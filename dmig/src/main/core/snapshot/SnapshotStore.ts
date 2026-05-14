/**
 * Phase 6: スナップショットの永続化層。
 * userData/snapshots/ 以下にスナップショット JSON を保存し、machine-id を管理する。
 *
 * 規約:
 * - machine-id は OS から取得せず、初回起動時に crypto.randomUUID() で生成
 * - userData/machine-id ファイルに { machineId, generatedAt } を JSON 保存
 * - スナップショットファイル名: `<id>.json`（id の `:` は `-` に置換）
 * - デフォルト保持件数は 10 件（pruneOld）
 */
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

import type { MachineInfo, Snapshot, SnapshotSummary } from '@shared/snapshot-types.js';
import { DmigError, wrapError } from '../errors/DmigError.js';
import { ErrorCodes } from '../errors/codes.js';

/** デフォルトの保持件数。 */
const DEFAULT_KEEP_COUNT = 10;

/** machine-id ファイル名。 */
const MACHINE_ID_FILE = 'machine-id';

/** スナップショット保存ディレクトリ名。 */
const SNAPSHOTS_DIR = 'snapshots';

/**
 * スナップショットの永続化層。
 * シングルトンとして main プロセスで使用する。
 */
export class SnapshotStore {
  private static instance: SnapshotStore | null = null;

  private constructor(
    private readonly userDataDir: string,
    private readonly machineInfo: MachineInfo,
  ) {}

  /**
   * SnapshotStore を初期化する。
   * userData 配下に snapshots ディレクトリを作成し、machine-id を読み込みまたは生成する。
   *
   * @param userDataDir - Electron の app.getPath('userData')
   * @returns 初期化済みの SnapshotStore
   */
  static async initialize(userDataDir: string): Promise<SnapshotStore> {
    try {
      await fsp.mkdir(join(userDataDir, SNAPSHOTS_DIR), { recursive: true });
      const machineInfo = await SnapshotStore.loadOrCreateMachineId(userDataDir);
      const store = new SnapshotStore(userDataDir, machineInfo);
      SnapshotStore.instance = store;
      return store;
    } catch (e: unknown) {
      throw wrapError(e, ErrorCodes.SNAPSHOT_WRITE_FAILED, 'SnapshotStore.initialize');
    }
  }

  /**
   * シングルトンインスタンスを取得する。
   * initialize 未呼び出しなら DmigError を投げる。
   */
  static getInstance(): SnapshotStore {
    if (!SnapshotStore.instance) {
      throw new DmigError(ErrorCodes.SNAPSHOT_READ_FAILED, {
        detail: 'SnapshotStore not initialized',
      });
    }
    return SnapshotStore.instance;
  }

  /** 現在の machine-id を取得する。 */
  getMachineId(): string {
    return this.machineInfo.machineId;
  }

  /**
   * 新しいスナップショットを保存する（atomic write: .tmp → rename）。
   *
   * @param snapshot - 保存するスナップショット
   */
  async save(snapshot: Snapshot): Promise<void> {
    const filePath = this.getSnapshotPath(snapshot.id);
    try {
      const tmpPath = `${filePath}.tmp`;
      await fsp.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
      await fsp.rename(tmpPath, filePath);
    } catch (e: unknown) {
      throw wrapError(e, ErrorCodes.SNAPSHOT_WRITE_FAILED, `SnapshotStore.save(${snapshot.id})`);
    }
  }

  /**
   * 最新のスナップショットを読み込む。
   * 存在しなければ null。
   */
  async loadLatest(): Promise<Snapshot | null> {
    const summaries = await this.list();
    if (summaries.length === 0) return null;
    return this.loadById(summaries[0].id);
  }

  /**
   * ID 指定でスナップショットを読み込む。
   * ファイルが無ければ null。
   */
  async loadById(id: string): Promise<Snapshot | null> {
    const filePath = this.getSnapshotPath(id);
    try {
      const text = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(text) as Snapshot;
      if (!parsed.id || !parsed.machineId || !parsed.entries) {
        throw new DmigError(ErrorCodes.SNAPSHOT_CORRUPTED, {
          detail: `snapshotId=${id}`,
        });
      }
      return parsed;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.SNAPSHOT_READ_FAILED, `SnapshotStore.loadById(${id})`);
    }
  }

  /**
   * すべてのスナップショットのサマリ一覧を返す（createdAt 降順）。
   */
  async list(): Promise<SnapshotSummary[]> {
    const dir = join(this.userDataDir, SNAPSHOTS_DIR);
    try {
      const files = await fsp.readdir(dir);
      const summaries: SnapshotSummary[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(dir, file);
        try {
          const stat = await fsp.stat(filePath);
          const text = await fsp.readFile(filePath, 'utf8');
          const snap = JSON.parse(text) as Snapshot;
          summaries.push({
            id: snap.id,
            machineId: snap.machineId,
            createdAt: snap.createdAt,
            imageCount: snap.entries.images.length,
            volumeCount: snap.entries.volumes.length,
            composeProjectCount: snap.entries.composeProjects.length,
            fileSize: stat.size,
          });
        } catch {
          console.warn(`[SnapshotStore] skipped corrupted file: ${file}`);
        }
      }
      summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return summaries;
    } catch (e: unknown) {
      throw wrapError(e, ErrorCodes.SNAPSHOT_READ_FAILED, 'SnapshotStore.list');
    }
  }

  /**
   * ID 指定でスナップショットを削除する。
   */
  async delete(id: string): Promise<void> {
    const filePath = this.getSnapshotPath(id);
    try {
      await fsp.unlink(filePath);
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      throw wrapError(e, ErrorCodes.SNAPSHOT_WRITE_FAILED, `SnapshotStore.delete(${id})`);
    }
  }

  /**
   * 古いスナップショットを削除し、最新の keepCount 件のみを残す。
   *
   * @param keepCount - 保持する件数（既定 10）
   * @returns 削除した件数
   */
  async pruneOld(keepCount: number = DEFAULT_KEEP_COUNT): Promise<number> {
    const summaries = await this.list();
    if (summaries.length <= keepCount) return 0;
    const toDelete = summaries.slice(keepCount);
    let deleted = 0;
    for (const s of toDelete) {
      try {
        await this.delete(s.id);
        deleted++;
      } catch {
        /* 個別の削除失敗は続行 */
      }
    }
    return deleted;
  }

  /** スナップショットファイルのフルパスを生成する。 */
  private getSnapshotPath(id: string): string {
    const safe = id.replace(/:/g, '-');
    return join(this.userDataDir, SNAPSHOTS_DIR, `${safe}.json`);
  }

  /**
   * machine-id を読み込み、無ければ新規生成して保存する。
   */
  private static async loadOrCreateMachineId(userDataDir: string): Promise<MachineInfo> {
    const filePath = join(userDataDir, MACHINE_ID_FILE);
    try {
      const text = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(text) as MachineInfo;
      if (parsed.machineId && parsed.generatedAt) {
        return parsed;
      }
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('[SnapshotStore] machine-id read failed, regenerating');
      }
    }

    const info: MachineInfo = {
      machineId: randomUUID(),
      generatedAt: new Date().toISOString(),
    };
    await fsp.writeFile(filePath, JSON.stringify(info, null, 2), 'utf8');
    return info;
  }
}
