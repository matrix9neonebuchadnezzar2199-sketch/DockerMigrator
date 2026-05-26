import { createWriteStream, promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

import { createZstdCompressStream } from './compression/zstdStreams.js';
import { DockerAdapter } from './DockerAdapter.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';
import { ManifestWriter } from './manifest/ManifestWriter.js';
import {
  createStageAChunkRef,
  removePendingChunk,
  STAGE_A_PLACEHOLDER_SHA256,
  updatePartialState,
} from './manifest/partialStateHelpers.js';
import { SizeEstimator } from './SizeEstimator.js';
import type {
  ExportRequest,
  DmigManifest,
  ManifestImageEntry,
  ProgressEvent,
} from '@shared/types.js';
import { buildProgressEvent } from '@shared/progress.js';
import type { OpenedPackageResume } from './importer/OpenedPackage.js';
import { RollbackManager } from './RollbackManager.js';
import { buildExportPackDirectoryEntry, createRollbackRecord } from './rollbackRecordBuilder.js';

const DMIG_VERSION = '0.2.0-poc';
const APP_VERSION = '0.1.0-poc';

function isAbortLike(e: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (e instanceof DmigError && e.code === ErrorCodes.JOB_CANCELLED) return true;
  if (e instanceof Error && e.name === 'AbortError') return true;
  return false;
}

/**
 * イメージを USB に書き出すコアロジック。
 * 進捗は 'progress' イベントで通知される。
 */
export class Exporter extends EventEmitter {
  constructor(private readonly docker: DockerAdapter) {
    super();
  }

  async exportImages(
    req: ExportRequest,
    signal?: AbortSignal,
  ): Promise<{ manifest: DmigManifest; packDir: string }> {
    const packName =
      req.packName ?? `dmig-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const packDir = join(req.outputDir, `${packName}.dmig`);
    const imagesDir = join(packDir, 'images');

    try {
      await fsp.access(req.outputDir);
    } catch (e) {
      throw new DmigError(ErrorCodes.USB_PATH_NOT_FOUND, {
        detail: `path=${req.outputDir}`,
        cause: e instanceof Error ? e : undefined,
      });
    }

    try {
      await fsp.mkdir(imagesDir, { recursive: true });
    } catch (e) {
      throw wrapError(e, ErrorCodes.MANIFEST_WRITE_FAILED, 'mkdir');
    }

    const writer = new ManifestWriter();
    const estimator = new SizeEstimator(this.docker);
    const sizeEst = await estimator.estimateForImages(req.imageNames);
    const estByName = new Map(sizeEst.breakdown.map((b) => [b.name, Math.max(1, b.estimatedBytes)]));

    const stubEntries: ManifestImageEntry[] = req.imageNames.map((name) => {
      const est = estByName.get(name) ?? 1;
      return {
        name,
        filename: `${this.safeName(name)}.tar.zst`,
        originalSize: est,
        compressedSize: 1,
        sha256: STAGE_A_PLACEHOLDER_SHA256,
      };
    });

    let pending = req.imageNames.map((name) =>
      createStageAChunkRef('image', name, estByName.get(name) ?? 1),
    );

    const ping = await this.docker.ping().catch(() => ({ version: 'unknown' }));
    let manifest: DmigManifest = {
      dmigVersion: DMIG_VERSION,
      schemaVersion: '1.1',
      createdAt: new Date().toISOString(),
      source: {
        os: process.platform,
        arch: process.arch,
        dockerVersion: ping.version,
        appVersion: APP_VERSION,
      },
      contents: { images: stubEntries },
      totalSize: stubEntries.reduce((sum, e) => sum + e.compressedSize, 0),
    };
    manifest = updatePartialState(manifest, pending);
    await writer.write(packDir, manifest);

    const entries: ManifestImageEntry[] = [];
    const total = req.imageNames.length;

    try {
      for (let idx = 0; idx < total; idx++) {
        if (signal?.aborted) {
          throw new DmigError(ErrorCodes.JOB_CANCELLED, {
            detail: `before image ${idx + 1}/${total}`,
          });
        }

        const imageName = req.imageNames[idx];
        this.emitProgress({
          taskId: imageName,
          phase: 'save',
          current: idx,
          total,
          percentage: Math.floor((idx / total) * 100),
          message: `(${idx + 1}/${total}) ${imageName} をエクスポート中...`,
        });

        const entry = await this.exportSingleImagePublic(
          imageName,
          imagesDir,
          req.compressionLevel ?? 3,
          signal,
        );
        entries.push(entry);

        const manifestEntry: ManifestImageEntry = {
          name: entry.name,
          filename: entry.filename,
          originalSize: entry.originalSize,
          compressedSize: entry.compressedSize,
          sha256: entry.sha256,
        };
        const nextImages = manifest.contents.images.map((im) =>
          im.name === manifestEntry.name ? manifestEntry : im,
        );
        pending = removePendingChunk(pending, 'image', imageName);
        manifest = {
          ...manifest,
          contents: { images: nextImages },
          totalSize: nextImages.reduce((sum, e) => sum + e.compressedSize, 0),
        };
        manifest = updatePartialState(manifest, pending);
        await writer.write(packDir, manifest);
      }

      manifest = updatePartialState(manifest, []);
      await writer.write(packDir, manifest);
    } catch (e) {
      const reason = isAbortLike(e, signal) ? ('user-cancel' as const) : ('error' as const);
      try {
        manifest = updatePartialState(manifest, pending, { interruptionReason: reason });
        await writer.write(packDir, manifest);
      } catch {
        /* 最終 manifest 失敗は無視 */
      }
      throw e;
    }

    const checksumLines = entries.map((e) => `${e.sha256}  images/${e.filename}`).join('\n');
    await fsp.writeFile(join(packDir, 'checksums.sha256'), `${checksumLines}\n`, 'utf-8');

    this.emitProgress({
      taskId: 'done',
      phase: 'write',
      current: total,
      total,
      percentage: 100,
      message: 'エクスポートが完了しました。',
    });

    const rollbackManager = new RollbackManager(this.docker);
    await rollbackManager.saveRecord(
      packDir,
      createRollbackRecord(packDir, 'export', [buildExportPackDirectoryEntry(packDir)]),
    );

    return { manifest, packDir };
  }

  /**
   * イメージのみの中断パッケージを再開する（Compose / volume を含まない想定）。
   */
  async resumeImagePack(
    opened: OpenedPackageResume,
    compressionLevel: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const writer = new ManifestWriter();
    const packDir = opened.packageDir;
    const imagesDir = join(packDir, 'images');
    let manifest: DmigManifest = JSON.parse(JSON.stringify(opened.manifest)) as DmigManifest;
    let pending = opened.partialState.pendingChunks.map((c) => ({ ...c }));

    const queue = [...pending];
    const total = queue.filter((c) => c.contentKind === 'image').length;
    let done = 0;
    let cancelRequestedOnDone = false;

    try {
      for (const chunk of queue) {
        if (chunk.contentKind !== 'image') {
          continue;
        }

        const stillThere = pending.some(
          (p) =>
            p.contentKind === chunk.contentKind &&
            p.contentId === chunk.contentId &&
            p.chunkIndex === chunk.chunkIndex,
        );
        if (!stillThere) {
          continue;
        }

        if (signal?.aborted) {
          throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'resumeImagePack aborted' });
        }

        const imageName = chunk.contentId;
        this.emitProgress({
          taskId: imageName,
          phase: 'save',
          current: done,
          total,
          percentage: total > 0 ? Math.floor((done / total) * 100) : 0,
          message: `(${done + 1}/${total}) ${imageName} を再エクスポート中...`,
        });

        const entry = await this.exportSingleImagePublic(
          imageName,
          imagesDir,
          compressionLevel,
          signal,
        );
        done += 1;

        const manifestEntry: ManifestImageEntry = {
          name: entry.name,
          filename: entry.filename,
          originalSize: entry.originalSize,
          compressedSize: entry.compressedSize,
          sha256: entry.sha256,
        };
        const nextImages = manifest.contents.images.map((im) =>
          im.name === manifestEntry.name ? manifestEntry : im,
        );
        pending = removePendingChunk(pending, 'image', imageName);
        manifest = {
          ...manifest,
          contents: { images: nextImages },
          totalSize: nextImages.reduce((sum, e) => sum + e.compressedSize, 0),
        };
        manifest = updatePartialState(manifest, pending);
        await writer.write(packDir, manifest);
      }

      if (signal?.aborted) {
        cancelRequestedOnDone = true;
      }

      manifest = updatePartialState(manifest, []);
      await writer.write(packDir, manifest);
    } catch (e) {
      const reason = isAbortLike(e, signal) ? ('user-cancel' as const) : ('error' as const);
      try {
        manifest = updatePartialState(manifest, pending, { interruptionReason: reason });
        await writer.write(packDir, manifest);
      } catch {
        /* 最終 manifest 失敗は無視 */
      }
      throw e;
    }

    const checksumLines = manifest.contents.images
      .map((e) => `${e.sha256}  images/${e.filename}`)
      .join('\n');
    await fsp.writeFile(join(packDir, 'checksums.sha256'), `${checksumLines}\n`, 'utf-8');

    this.emitProgress({
      taskId: 'done',
      phase: 'write',
      current: total,
      total,
      percentage: 100,
      message: '再エクスポートが完了しました。',
      ...(cancelRequestedOnDone ? { cancelRequested: true } : {}),
    });

    const rollbackManager = new RollbackManager(this.docker);
    await rollbackManager.saveRecord(
      packDir,
      createRollbackRecord(packDir, 'export', [buildExportPackDirectoryEntry(packDir)]),
    );
  }

  /**
   * 単一イメージの save → SHA 計算 → zstd 圧縮 → ファイル書き込み。
   * ComposeExporter からも利用する。
   */
  async exportSingleImagePublic(
    imageName: string,
    imagesDir: string,
    compLevel: number,
    signal?: AbortSignal,
  ): Promise<ManifestImageEntry> {
    const filename = `${this.safeName(imageName)}.tar.zst`;
    const filepath = join(imagesDir, filename);

    if (signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: `before save: ${imageName}` });
    }

    let originalSize = 0;
    let compressedSize = 0;
    const hash = createHash('sha256');

    const tarStream = await this.docker.saveImageStream(imageName);
    const originalTotal = await this.docker.getImageOriginalSize(imageName);

    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        originalSize += chunk.length;
        cb(null, chunk);
      },
    });

    let compressor;
    try {
      compressor = await createZstdCompressStream(compLevel);
    } catch (e) {
      throw wrapError(e, ErrorCodes.COMPRESS_FAILED, 'createCompressor');
    }

    const hasher = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        compressedSize += chunk.length;
        hash.update(chunk);
        cb(null, chunk);
      },
    });

    const timer = setInterval(() => {
      const totalBytes = Math.max(originalTotal, originalSize, 1);
      this.emitProgress(
        buildProgressEvent({
          taskId: imageName,
          phase: 'compress',
          current: originalSize,
          total: totalBytes,
          message: `${imageName}: 圧縮中... 元 ${this.fmtMB(originalSize)} / ${this.fmtMB(totalBytes)} → 圧縮 ${this.fmtMB(compressedSize)}`,
        }),
      );
    }, 500);

    const pipeOpts = signal ? { signal } : {};

    try {
      const writeStream = createWriteStream(filepath);
      await pipeline(tarStream, counter, compressor, hasher, writeStream, pipeOpts);
    } catch (e: unknown) {
      await fsp.unlink(filepath).catch(() => {});
      const err = e as { name?: string };
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw new DmigError(ErrorCodes.JOB_CANCELLED, {
          detail: `pipeline aborted: ${imageName}`,
        });
      }
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.IMAGE_SAVE_FAILED, 'pipeline');
    } finally {
      clearInterval(timer);
    }

    return {
      name: imageName,
      filename,
      originalSize,
      compressedSize,
      sha256: hash.digest('hex'),
    };
  }

  private safeName(imageName: string): string {
    return imageName.replace(/[/:]/g, '_');
  }

  private fmtMB(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  private emitProgress(ev: ProgressEvent) {
    this.emit('progress', ev);
  }
}
