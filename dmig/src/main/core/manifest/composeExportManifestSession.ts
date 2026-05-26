import { DMIG_MANIFEST_VERSION } from '@shared/manifestVersion.js';
import type {
  ChunkRef,
  ComposeExportRequest,
  ComposeProjectInfo,
  DmigManifest,
  InterruptionReason,
  ManifestComposeEntry,
  ManifestImageEntry,
  ManifestVolumeEntry,
} from '@shared/types.js';

import { DockerAdapter } from '../DockerAdapter.js';
import { SizeEstimator } from '../SizeEstimator.js';
import { ManifestWriter } from './ManifestWriter.js';
import {
  createStageAChunkRef,
  removePendingChunk,
  STAGE_A_PLACEHOLDER_SHA256,
  updatePartialState,
} from './partialStateHelpers.js';
import { safeComposeProjectDirName, safeImageFileStem, safeVolumeFileStem } from './packagingNames.js';

const APP_VERSION = '0.1.0-poc';

function recomputeTotal(m: DmigManifest): number {
  let t = 0;
  for (const im of m.contents.images) {
    t += im.compressedSize;
  }
  for (const v of m.contents.volumes ?? []) {
    t += v.compressedSize;
  }
  return t;
}

function stubImage(name: string, estimatedBytes: number): ManifestImageEntry {
  const stem = safeImageFileStem(name);
  return {
    name,
    filename: `${stem}.tar.zst`,
    originalSize: Math.max(1, estimatedBytes),
    compressedSize: 1,
    sha256: STAGE_A_PLACEHOLDER_SHA256,
  };
}

function stubVolume(name: string, _estimatedBytes: number): ManifestVolumeEntry {
  const stem = safeVolumeFileStem(name);
  return {
    name,
    filename: `volumes/${stem}.tar.zst`,
    compressedSize: 1,
    sha256: STAGE_A_PLACEHOLDER_SHA256,
    driver: 'local',
  };
}

function stubCompose(p: ComposeProjectInfo): ManifestComposeEntry {
  return {
    name: p.name,
    manifestFile: `compose/${safeComposeProjectDirName(p.name)}/project-manifest.json`,
    serviceCount: 0,
    volumeCount: 0,
    hasEnvFile: false,
    envFileMasked: false,
  };
}

/**
 * Compose エクスポート中の manifest / partialState を原子的に維持するセッション。
 */
export class ComposeExportManifestSession {
  readonly writer = new ManifestWriter();

  /**
   * 再開用: ディスク上の manifest / pending をディープコピーしたセッションを返す。
   */
  static fromResumeState(
    packageDir: string,
    manifest: DmigManifest,
    pendingChunks: ChunkRef[],
  ): ComposeExportManifestSession {
    const m = JSON.parse(JSON.stringify(manifest)) as DmigManifest;
    const p = pendingChunks.map((c) => ({ ...c }));
    return new ComposeExportManifestSession(packageDir, m, p);
  }

  private constructor(
    readonly packDir: string,
    public manifest: DmigManifest,
    public pending: ChunkRef[],
  ) {}

  /**
   * 選択プロジェクトから初期 stub manifest と pendingChunks を構築する。
   */
  static async create(
    packDir: string,
    _req: ComposeExportRequest,
    targets: ComposeProjectInfo[],
    docker: DockerAdapter,
  ): Promise<ComposeExportManifestSession> {
    const estimator = new SizeEstimator(docker);
    const estimate = await estimator.estimateForCompose(targets);
    const estBy = new Map<string, number>();
    for (const b of estimate.breakdown) {
      if (b.kind === 'image' || b.kind === 'volume') {
        estBy.set(`${b.kind}:${b.name}`, Math.max(1, b.estimatedBytes));
      }
    }

    const seenImages = new Set<string>();
    const imageEntries: ManifestImageEntry[] = [];
    const pending: ChunkRef[] = [];

    for (const p of targets) {
      for (const svc of p.services) {
        if (!svc.image || seenImages.has(svc.image)) continue;
        seenImages.add(svc.image);
        const est = estBy.get(`image:${svc.image}`) ?? 1;
        imageEntries.push(stubImage(svc.image, est));
        pending.push(createStageAChunkRef('image', svc.image, est));
      }
    }

    const seenVols = new Set<string>();
    const volumeEntries: ManifestVolumeEntry[] = [];
    for (const p of targets) {
      for (const v of p.volumeNames) {
        if (seenVols.has(v)) continue;
        seenVols.add(v);
        const est = estBy.get(`volume:${v}`) ?? 1;
        volumeEntries.push(stubVolume(v, est));
        pending.push(createStageAChunkRef('volume', v, est));
      }
    }

    const composeEntries: ManifestComposeEntry[] = [];
    for (const p of targets) {
      composeEntries.push(stubCompose(p));
      pending.push(createStageAChunkRef('composeProject', p.name, 1));
    }

    const ping = await docker.ping().catch(() => ({ version: 'unknown' }));
    const manifest: DmigManifest = {
      dmigVersion: DMIG_MANIFEST_VERSION,
      schemaVersion: '1.1',
      createdAt: new Date().toISOString(),
      source: {
        os: process.platform,
        arch: process.arch,
        dockerVersion: ping.version,
        appVersion: APP_VERSION,
      },
      contents: {
        images: imageEntries,
        volumes: volumeEntries,
        composeProjects: composeEntries,
      },
      totalSize: 0,
    };
    manifest.totalSize = recomputeTotal(manifest);

    const withPartial = updatePartialState(manifest, pending);
    return new ComposeExportManifestSession(packDir, withPartial, pending);
  }

  /** 現在の manifest / pending をディスクへ書き込む。 */
  async persist(interruptionReason?: InterruptionReason): Promise<void> {
    this.manifest = updatePartialState(this.manifest, this.pending, {
      ...(interruptionReason !== undefined ? { interruptionReason } : {}),
    });
    await this.writer.write(this.packDir, this.manifest);
  }

  /** イメージエントリを確定し、pending から除外して書き込む。 */
  async onImageExported(entry: ManifestImageEntry): Promise<void> {
    const filename = entry.filename.startsWith('images/') ? entry.filename : `images/${entry.filename}`;
    const normalized: ManifestImageEntry = { ...entry, filename };
    const nextImages = this.manifest.contents.images.map((im) =>
      im.name === normalized.name ? normalized : im,
    );
    this.manifest = {
      ...this.manifest,
      contents: {
        ...this.manifest.contents,
        images: nextImages,
      },
      totalSize: recomputeTotal({ ...this.manifest, contents: { ...this.manifest.contents, images: nextImages } }),
    };
    this.pending = removePendingChunk(this.pending, 'image', entry.name);
    await this.persist();
  }

  /** ボリュームエントリを確定し、pending から除外して書き込む。 */
  async onVolumeExported(entry: ManifestVolumeEntry): Promise<void> {
    const nextVols = (this.manifest.contents.volumes ?? []).map((v) => (v.name === entry.name ? entry : v));
    this.manifest = {
      ...this.manifest,
      contents: {
        ...this.manifest.contents,
        volumes: nextVols,
      },
      totalSize: recomputeTotal({ ...this.manifest, contents: { ...this.manifest.contents, volumes: nextVols } }),
    };
    this.pending = removePendingChunk(this.pending, 'volume', entry.name);
    await this.persist();
  }

  /** Compose プロジェクトエントリを確定し、pending から除外して書き込む。 */
  async onComposeProjectExported(entry: ManifestComposeEntry): Promise<void> {
    const nextCompose = (this.manifest.contents.composeProjects ?? []).map((c) =>
      c.name === entry.name ? entry : c,
    );
    const nextManifest: DmigManifest = {
      ...this.manifest,
      contents: {
        ...this.manifest.contents,
        composeProjects: nextCompose,
      },
    };
    nextManifest.totalSize = recomputeTotal(nextManifest);
    this.manifest = nextManifest;
    this.pending = removePendingChunk(this.pending, 'composeProject', entry.name);
    await this.persist();
  }

  /** 作成直後の manifest（partialState 付き）を初回書き込みする。 */
  async writeInitial(): Promise<void> {
    await this.writer.write(this.packDir, this.manifest);
  }

  /** 完了時: pending を空にし partialState を外して書き込む。 */
  async finalizeSuccess(): Promise<void> {
    this.pending = [];
    this.manifest = updatePartialState(this.manifest, []);
    await this.writer.write(this.packDir, this.manifest);
  }

  /** 中断・例外時: interruptionReason を付与して書き込む。 */
  async finalizeInterrupted(reason: InterruptionReason): Promise<void> {
    this.manifest = updatePartialState(this.manifest, this.pending, { interruptionReason: reason });
    await this.writer.write(this.packDir, this.manifest);
  }
}
