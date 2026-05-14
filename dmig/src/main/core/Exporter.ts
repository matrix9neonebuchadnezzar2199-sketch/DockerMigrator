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
import type {
  ExportRequest,
  DmigManifest,
  ManifestImageEntry,
  ProgressEvent,
} from '@shared/types.js';

const DMIG_VERSION = '1.0.0';
const APP_VERSION = '0.1.0-poc';

/**
 * イメージを USB に書き出すコアロジック。
 * 進捗は 'progress' イベントで通知される。
 */
export class Exporter extends EventEmitter {
  constructor(private readonly docker: DockerAdapter) {
    super();
  }

  async exportImages(req: ExportRequest, signal?: AbortSignal): Promise<DmigManifest> {
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

    const entries: ManifestImageEntry[] = [];
    const total = req.imageNames.length;

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
    }

    const ping = await this.docker.ping().catch(() => ({ version: 'unknown' }));
    const manifest: DmigManifest = {
      dmigVersion: DMIG_VERSION,
      createdAt: new Date().toISOString(),
      source: {
        os: process.platform,
        arch: process.arch,
        dockerVersion: ping.version,
        appVersion: APP_VERSION,
      },
      contents: { images: entries },
      totalSize: entries.reduce((sum, e) => sum + e.compressedSize, 0),
    };

    try {
      await fsp.writeFile(
        join(packDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8',
      );
    } catch (e) {
      throw wrapError(e, ErrorCodes.MANIFEST_WRITE_FAILED, 'writeManifest');
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

    return manifest;
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
      this.emitProgress({
        taskId: imageName,
        phase: 'compress',
        current: compressedSize,
        total: 0,
        percentage: 0,
        message: `${imageName}: 圧縮中... 元 ${this.fmtMB(originalSize)} → ${this.fmtMB(compressedSize)}`,
      });
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
