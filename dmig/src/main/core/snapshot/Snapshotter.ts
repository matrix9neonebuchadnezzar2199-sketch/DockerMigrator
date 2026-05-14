/**
 * Phase 6: 現在の Docker 状態をスナップショットにシリアライズする。
 *
 * 規約:
 * - ボリュームの SHA-256 は VolumeDiffStrategy='strict' のときのみ tar ストリームをハッシュ
 * - 進捗は ProgressEvent（phase='snapshot'）で emit
 * - AbortSignal でキャンセル可能
 */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { promises as fsp } from 'node:fs';

import type { ProgressEvent, VolumeDiffStrategy } from '@shared/types.js';
import type {
  Snapshot,
  SnapshotComposeEntry,
  SnapshotImageEntry,
  SnapshotVolumeEntry,
} from '@shared/snapshot-types.js';
import { DockerAdapter } from '../DockerAdapter.js';
import { DmigError, wrapError } from '../errors/DmigError.js';
import { ErrorCodes } from '../errors/codes.js';
import { SnapshotStore } from './SnapshotStore.js';

/** {@link Snapshotter.capture} のオプション。 */
export interface SnapshotterOptions {
  volumeStrategy: VolumeDiffStrategy;
  signal?: AbortSignal;
  /** 進捗イベントの taskId（省略時は固定プレースホルダ）。 */
  jobToken?: string;
}

type VolumeInspect = import('dockerode').VolumeInspectInfo & { CreatedAt?: string };

/**
 * Docker 状態を {@link Snapshot} に変換する。
 * 保存は呼び出し側で {@link SnapshotStore.save} を行う。
 */
export class Snapshotter extends EventEmitter {
  constructor(private readonly docker: DockerAdapter) {
    super();
  }

  /**
   * 現在の Docker 状態からスナップショットを生成する。
   *
   * @param options - ボリューム戦略・キャンセル・ジョブトークン
   * @returns 永続化前のスナップショット
   */
  async capture(options: SnapshotterOptions): Promise<Snapshot> {
    const { volumeStrategy, signal, jobToken } = options;
    const taskId = jobToken ?? 'snapshot';

    this.checkAborted(signal);

    try {
      this.emitSnapshotProgress(taskId, 0, 0, 'イメージ情報を収集中');
      const images = await this.captureImages(signal, taskId);

      this.checkAborted(signal);
      this.emitSnapshotProgress(taskId, 0, 0, 'ボリューム情報を収集中');
      const volumes = await this.captureVolumes(volumeStrategy, signal, taskId);

      this.checkAborted(signal);
      this.emitSnapshotProgress(taskId, 0, 0, 'Compose 情報を収集中');
      const composeProjects = await this.captureCompose(signal, taskId);

      this.checkAborted(signal);

      const { version: dockerVersion } = await this.docker.ping();
      const store = SnapshotStore.getInstance();

      const snapshot: Snapshot = {
        id: this.generateSnapshotId(),
        machineId: store.getMachineId(),
        createdAt: new Date().toISOString(),
        dockerVersion,
        os: {
          platform: process.platform,
          release: getOsRelease(),
        },
        schemaVersion: '1.0',
        entries: { images, volumes, composeProjects },
      };

      this.emitSnapshotProgress(taskId, 1, 1, 'スナップショット完成');
      return snapshot;
    } catch (e: unknown) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.DIFF_COMPUTATION_FAILED, 'Snapshotter.capture');
    }
  }

  private async captureImages(signal: AbortSignal | undefined, taskId: string): Promise<SnapshotImageEntry[]> {
    const list = await this.docker.listImages();
    const n = list.length;
    const result: SnapshotImageEntry[] = [];
    let i = 0;
    for (const img of list) {
      this.checkAborted(signal);
      result.push({
        id: img.id,
        repoTags: img.repoTags,
        size: img.size,
      });
      i++;
      this.emitSnapshotProgress(taskId, i, n, `イメージ: ${i}/${n}`);
    }
    return result;
  }

  private async captureVolumes(
    strategy: VolumeDiffStrategy,
    signal: AbortSignal | undefined,
    taskId: string,
  ): Promise<SnapshotVolumeEntry[]> {
    const list = await this.docker.listVolumes();
    const n = list.length;
    const result: SnapshotVolumeEntry[] = [];
    let processed = 0;

    for (const vol of list) {
      this.checkAborted(signal);
      const info = await this.docker.inspectVolume(vol.name);
      const { mtime, size } = volumeInspectMeta(info);
      const entry: SnapshotVolumeEntry = { name: vol.name, mtime, size };

      if (strategy === 'strict') {
        this.emitSnapshotProgress(
          taskId,
          processed,
          Math.max(n, 1),
          `ボリューム SHA-256 計算中: ${vol.name}`,
        );
        entry.hash = await this.hashVolume(vol.name, signal);
      }
      result.push(entry);
      processed++;
    }
    return result;
  }

  private async captureCompose(signal: AbortSignal | undefined, taskId: string): Promise<SnapshotComposeEntry[]> {
    const projects = await this.docker.listComposeProjects();
    const n = projects.length;
    const result: SnapshotComposeEntry[] = [];
    const imageIdCache = new Map<string, string | undefined>();
    let i = 0;

    for (const p of projects) {
      this.checkAborted(signal);
      let configHash = '';
      const primaryConfig = p.configFiles[0];
      if (primaryConfig) {
        try {
          const content = await fsp.readFile(primaryConfig, 'utf8');
          configHash = createHash('sha256').update(content).digest('hex');
        } catch {
          /* compose 設定が読めない場合は空ハッシュ（差分では modified 扱いになりうる） */
        }
      }

      const services: SnapshotComposeEntry['services'] = [];
      for (const s of p.services) {
        const key = s.image ?? '';
        let imageId: string | undefined;
        if (key) {
          if (imageIdCache.has(key)) {
            imageId = imageIdCache.get(key);
          } else {
            imageId = await this.docker.resolveImageId(key);
            imageIdCache.set(key, imageId);
          }
        }
        services.push({ name: s.name, imageId });
      }

      result.push({ name: p.name, configHash, services });
      i++;
      this.emitSnapshotProgress(taskId, i, n, `Compose: ${i}/${n}`);
    }
    return result;
  }

  /**
   * ボリューム tar ストリームの SHA-256 を計算する。
   */
  private async hashVolume(name: string, signal: AbortSignal | undefined): Promise<string> {
    const stream = await this.docker.exportVolumeStream(name);
    const hash = createHash('sha256');

    return await new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        stream.destroy();
        reject(
          new DmigError(ErrorCodes.JOB_CANCELLED, {
            detail: `volume hash aborted: ${name}`,
            phase: 'snapshot',
          }),
        );
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      stream.on('data', (chunk: Buffer) => {
        hash.update(chunk);
      });
      stream.on('end', () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(hash.digest('hex'));
      });
      stream.on('error', (err: Error) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(wrapError(err, ErrorCodes.DIFF_COMPUTATION_FAILED, `Snapshotter.hashVolume(${name})`));
      });
    });
  }

  private generateSnapshotId(): string {
    return new Date().toISOString();
  }

  private checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, {
        detail: 'snapshot aborted',
        phase: 'snapshot',
      });
    }
  }

  private emitSnapshotProgress(taskId: string, current: number, total: number, message: string): void {
    const percentage = total > 0 ? Math.min(100, Math.round((100 * current) / total)) : 0;
    const ev: ProgressEvent = {
      taskId,
      phase: 'snapshot',
      current,
      total,
      message,
      percentage,
    };
    this.emit('progress', ev);
  }
}

function getOsRelease(): string {
  const getSys = (process as NodeJS.Process & { getSystemVersion?: () => string }).getSystemVersion;
  return typeof getSys === 'function' ? getSys() : '';
}

function volumeInspectMeta(info: import('dockerode').VolumeInspectInfo): { mtime: string; size: number } {
  const ext = info as VolumeInspect;
  const mtime =
    typeof ext.CreatedAt === 'string' && ext.CreatedAt.length > 0
      ? ext.CreatedAt
      : new Date(0).toISOString();
  const size = info.UsageData?.Size ?? 0;
  return { mtime, size };
}
