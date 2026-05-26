import { createReadStream, promises as fsp } from 'node:fs';
import type { Readable } from 'node:stream';
import { join } from 'node:path';
import { safeJoinUnder } from '../security/safeJoinUnder.js';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

import { createZstdDecompressStream } from './compression/zstdStreams.js';
import { DockerAdapter } from './DockerAdapter.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';
import type {
  ChecksumPolicy,
  ChunkRef,
  ContentKind,
  DmigManifest,
  PackageProbeStatus,
  ProgressEvent,
  ProbeSummary,
} from '@shared/types.js';
import type { OpenedPackage, OpenedPackageBase, OpenedPackageResume } from './importer/OpenedPackage.js';
import { RollbackManager } from './RollbackManager.js';
import {
  buildDockerImageEntry,
  createRollbackRecord,
} from './rollbackRecordBuilder.js';
import type { RollbackEntry } from '@shared/types.js';

/** `ProbeSummary.pendingChunksPreview` の最大件数（マジックナンバー回避）。 */
export const PROBE_PREVIEW_LIMIT = 8;

const CHECKSUM_POLICIES: readonly ChecksumPolicy[] = ['verify-all', 'verify-resumed', 'trust-completed'];

/**
 * USB上の .dmig パッケージから Docker にイメージをロードする。
 */
export class Importer extends EventEmitter {
  constructor(private readonly docker: DockerAdapter) {
    super();
  }

  async readManifest(packageDir: string): Promise<DmigManifest> {
    const manifestPath = join(packageDir, 'manifest.json');
    try {
      const txt = await fsp.readFile(manifestPath, 'utf-8');
      const m = JSON.parse(txt) as DmigManifest;
      if (!m.dmigVersion || !m.contents) {
        throw new DmigError(ErrorCodes.PACK_FORMAT_INVALID, {
          detail: 'missing required fields',
        });
      }
      const major = m.dmigVersion.split('.')[0];
      if (major !== '1') {
        throw new DmigError(ErrorCodes.PACK_VERSION_INCOMPATIBLE, {
          detail: `pack=${m.dmigVersion}, app supports 1.x`,
        });
      }
      return m;
    } catch (e) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.PACK_FORMAT_INVALID, 'readManifest');
    }
  }

  /**
   * package を系列の基底または通常 Import 対象として開く。完了 package のみ受理。
   *
   * @throws DmigError(E2070) 中断 package が渡された
   * @throws DmigError(E2075) partialState の構造が不正
   */
  async openAsBase(packageDir: string): Promise<OpenedPackageBase> {
    const opened = await this.openInternal(packageDir);
    if (opened.mode === 'resume') {
      throw new DmigError(ErrorCodes.INVALID_BASE_PACKAGE, {
        detail: `path=${packageDir}`,
      });
    }
    return opened;
  }

  /**
   * package を再開対象として開く。中断 package のみ受理。
   *
   * @throws DmigError(E2071) 完了 package が渡された
   * @throws DmigError(E2075) partialState の構造が不正
   */
  async openForResume(packageDir: string): Promise<OpenedPackageResume> {
    const opened = await this.openInternal(packageDir);
    if (opened.mode === 'base') {
      throw new DmigError(ErrorCodes.NOT_A_PARTIAL_PACKAGE, {
        detail: `path=${packageDir}`,
      });
    }
    return opened;
  }

  /**
   * 例外を投げずに完了/中断/異常を判定する軽量 API。UI 先読みおよび `dmig:probePackage` 用。
   */
  async probe(packageDir: string): Promise<ProbeSummary> {
    try {
      const st = await fsp.stat(packageDir);
      if (!st.isDirectory()) {
        return this.makeProbeSummary(packageDir, 'missing_dir', undefined, 'reason=not_a_directory');
      }
    } catch {
      return this.makeProbeSummary(packageDir, 'missing_dir', undefined, 'reason=enoent');
    }

    const manifestPath = join(packageDir, 'manifest.json');
    try {
      await fsp.access(manifestPath);
    } catch {
      return this.makeProbeSummary(packageDir, 'missing_manifest', undefined, 'reason=manifest_not_found');
    }

    let manifest: DmigManifest;
    try {
      manifest = await this.readManifest(packageDir);
    } catch (e) {
      if (e instanceof DmigError && e.code === ErrorCodes.PACK_VERSION_INCOMPATIBLE) {
        return this.makeProbeSummary(
          packageDir,
          'version_incompatible',
          undefined,
          `reason=version_incompatible detail=${Importer.escapeDiag(e.detail ?? e.message)}`,
        );
      }
      if (e instanceof DmigError) {
        return this.makeProbeSummary(
          packageDir,
          'invalid_manifest',
          undefined,
          `reason=invalid_manifest detail=${Importer.escapeDiag(e.detail ?? e.message)}`,
        );
      }
      const msg = e instanceof Error ? e.message : String(e);
      return this.makeProbeSummary(
        packageDir,
        'invalid_manifest',
        undefined,
        `reason=invalid_manifest detail=${Importer.escapeDiag(msg)}`,
      );
    }

    if (manifest.partialState !== undefined) {
      try {
        Importer.validatePartialState(manifest);
      } catch (e) {
        const detail =
          e instanceof DmigError ? (e.detail ?? 'reason=unknown') : `reason=unknown detail=${Importer.escapeDiag(String(e))}`;
        return this.makeProbeSummary(packageDir, 'invalid_partial', manifest, detail);
      }
      return this.makeProbeSummary(packageDir, 'ok_partial', manifest);
    }

    return this.makeProbeSummary(packageDir, 'ok_complete', manifest);
  }

  private async openInternal(packageDir: string): Promise<OpenedPackage> {
    const manifest = await this.readManifest(packageDir);

    if (manifest.partialState !== undefined) {
      Importer.validatePartialState(manifest);
      return {
        mode: 'resume',
        packageDir,
        manifest,
        partialState: manifest.partialState,
      };
    }

    return {
      mode: 'base',
      packageDir,
      manifest,
    };
  }

  /**
   * partialState の構造検証（§4.3）。byteOffset+byteLength の content 総量超過は step 4 で扱う。
   *
   * @throws DmigError(E2075) 構造不正。`detail` は `reason=snake_case` を先頭にした key=value 連結。
   */
  static validatePartialState(manifest: DmigManifest): void {
    const ps = manifest.partialState;
    if (ps === undefined) {
      return;
    }

    if (manifest.schemaVersion !== '1.1') {
      throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
        detail: 'reason=partial_state_on_v1_0',
      });
    }

    if (!Array.isArray(ps.pendingChunks) || ps.pendingChunks.length === 0) {
      throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
        detail: 'reason=empty_pending_chunks',
      });
    }

    if (typeof ps.lastUpdatedAt !== 'string' || ps.lastUpdatedAt.length === 0) {
      throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
        detail: 'reason=partial_state_incomplete field=lastUpdatedAt',
      });
    }

    if (ps.checksumPolicy === undefined || !CHECKSUM_POLICIES.includes(ps.checksumPolicy)) {
      throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
        detail: 'reason=partial_state_incomplete field=checksumPolicy',
      });
    }

    const sha256Pattern = /^[0-9a-f]{64}$/;
    const seen = new Set<string>();

    for (const chunk of ps.pendingChunks) {
      if (!Importer.isValidContentKind(chunk.contentKind)) {
        throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
          detail: `reason=invalid_content_kind content_kind=${Importer.escapeDiag(String(chunk.contentKind))}`,
        });
      }

      if (!Importer.chunkRefExists(chunk, manifest)) {
        throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
          detail: `reason=unknown_content_ref content_kind=${chunk.contentKind} content_id=${Importer.escapeDiag(chunk.contentId)}`,
        });
      }

      const key = `${chunk.contentKind}:${chunk.contentId}:${chunk.chunkIndex}`;
      if (seen.has(key)) {
        throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
          detail: `reason=duplicate_chunk_ref content_kind=${chunk.contentKind} content_id=${Importer.escapeDiag(chunk.contentId)} chunk_index=${chunk.chunkIndex}`,
        });
      }
      seen.add(key);

      if (chunk.byteOffset < 0 || chunk.byteLength <= 0) {
        throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
          detail: `reason=invalid_chunk_bounds content_kind=${chunk.contentKind} content_id=${Importer.escapeDiag(chunk.contentId)} chunk_index=${chunk.chunkIndex}`,
        });
      }

      if (!sha256Pattern.test(chunk.expectedSha256)) {
        throw new DmigError(ErrorCodes.MANIFEST_PARTIAL_INVALID, {
          detail: `reason=invalid_sha256_format content_kind=${chunk.contentKind} content_id=${Importer.escapeDiag(chunk.contentId)} chunk_index=${chunk.chunkIndex}`,
        });
      }
    }
  }

  private static isValidContentKind(k: unknown): k is ContentKind {
    return k === 'image' || k === 'volume' || k === 'composeProject';
  }

  private static chunkRefExists(chunk: ChunkRef, manifest: DmigManifest): boolean {
    const c = manifest.contents;
    switch (chunk.contentKind) {
      case 'image':
        return c.images.some((e) => e.name === chunk.contentId);
      case 'volume':
        return (c.volumes ?? []).some((e) => e.name === chunk.contentId);
      case 'composeProject':
        return (c.composeProjects ?? []).some((e) => e.name === chunk.contentId);
      default:
        return false;
    }
  }

  private makeProbeSummary(
    packageDir: string,
    status: PackageProbeStatus,
    manifest: DmigManifest | undefined,
    diagnostic?: string,
  ): ProbeSummary {
    const summary: ProbeSummary = {
      packageDir,
      status,
      manifestPresent: manifest !== undefined,
      pendingChunkCount: 0,
    };

    if (manifest !== undefined) {
      summary.schemaVersion = manifest.schemaVersion;
      summary.dmigVersion = manifest.dmigVersion;

      if (manifest.partialState !== undefined) {
        const p = manifest.partialState;
        summary.pendingChunkCount = Array.isArray(p.pendingChunks) ? p.pendingChunks.length : 0;
        summary.lastUpdatedAt = p.lastUpdatedAt;
        summary.interruptionReason = p.interruptionReason;
        summary.checksumPolicy = p.checksumPolicy;
        if (Array.isArray(p.pendingChunks)) {
          summary.pendingChunksPreview = p.pendingChunks.slice(0, PROBE_PREVIEW_LIMIT).map((ch) => ({
            contentKind: ch.contentKind,
            contentId: ch.contentId,
            chunkIndex: ch.chunkIndex,
          }));
        }
      }
    }

    if (diagnostic !== undefined && status !== 'ok_complete' && status !== 'ok_partial') {
      summary.diagnostic = diagnostic;
    }

    return summary;
  }

  private static escapeDiag(value: string): string {
    return value.replace(/ /g, '%20').replace(/\n/g, '%0A').replace(/=/g, '%3D');
  }

  async importImages(
    opened: OpenedPackageBase,
    selectedImages: string[],
    signal?: AbortSignal,
    options?: { skipRollbackSave?: boolean },
  ): Promise<RollbackEntry[]> {
    const manifest = opened.manifest;
    const targets = manifest.contents.images.filter((e) => selectedImages.includes(e.name));
    const rollbackEntries: RollbackEntry[] = [];

    if (targets.length === 0) {
      throw new DmigError(ErrorCodes.IMAGE_NOT_FOUND, {
        detail: 'no matching image in pack',
      });
    }

    for (let i = 0; i < targets.length; i++) {
      if (signal?.aborted) {
        throw new DmigError(ErrorCodes.JOB_CANCELLED, {
          detail: `before import image ${i + 1}/${targets.length}`,
        });
      }

      const entry = targets[i];
      const rel = entry.filename.startsWith('images/') ? entry.filename : `images/${entry.filename}`;
      const filepath = safeJoinUnder(opened.packageDir, rel);

      this.emitProgress({
        taskId: entry.name,
        phase: 'verify',
        current: i,
        total: targets.length,
        percentage: Math.floor((i / targets.length) * 100),
        message: `(${i + 1}/${targets.length}) ${entry.name}: 整合性を検証中...`,
      });
      await this.verifyChecksum(filepath, entry.sha256);

      this.emitProgress({
        taskId: entry.name,
        phase: 'load',
        current: i,
        total: targets.length,
        percentage: Math.floor((i / targets.length) * 100),
        message: `(${i + 1}/${targets.length}) ${entry.name}: Docker にロード中...`,
      });
      await this.loadOne(filepath, entry.name);
      rollbackEntries.push(await buildDockerImageEntry(this.docker, entry.name));
    }

    if (!options?.skipRollbackSave && rollbackEntries.length > 0) {
      const manager = new RollbackManager(this.docker);
      await manager.saveRecord(
        opened.packageDir,
        createRollbackRecord(opened.packageDir, 'import', rollbackEntries),
      );
    }

    this.emitProgress({
      taskId: 'done',
      phase: 'load',
      current: targets.length,
      total: targets.length,
      percentage: 100,
      message: 'インポートが完了しました。',
    });

    return rollbackEntries;
  }

  private async verifyChecksum(filepath: string, expected: string): Promise<void> {
    const hash = createHash('sha256');
    try {
      const stream = createReadStream(filepath);
      for await (const chunk of stream) {
        hash.update(chunk as Buffer);
      }
    } catch (e) {
      throw wrapError(e, ErrorCodes.CHECKSUM_FAILED, 'verifyChecksum');
    }
    const actual = hash.digest('hex');
    if (actual !== expected) {
      throw new DmigError(ErrorCodes.CHECKSUM_MISMATCH, {
        detail: `expected=${expected}, actual=${actual}, file=${filepath}`,
      });
    }
  }

  private async loadOne(filepath: string, imageName: string): Promise<void> {
    let decompressor;
    try {
      decompressor = await createZstdDecompressStream();
    } catch (e) {
      throw wrapError(e, ErrorCodes.COMPRESS_FAILED, 'createDecompressor');
    }

    const fileStream = createReadStream(filepath);
    fileStream.pipe(decompressor);
    try {
      await this.docker.loadImageStream(decompressor as Readable, (msg) => {
        this.emitProgress({
          taskId: imageName,
          phase: 'load',
          current: 0,
          total: 0,
          percentage: 0,
          message: `${imageName}: ${msg}`,
        });
      });
    } catch (e) {
      throw wrapError(e, ErrorCodes.IMAGE_LOAD_FAILED, 'loadOne');
    }
  }

  private emitProgress(ev: ProgressEvent) {
    this.emit('progress', ev);
  }
}
