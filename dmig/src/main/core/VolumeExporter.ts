import { createWriteStream, createReadStream, promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { safeJoinUnder } from '../security/safeJoinUnder.js';
import { EventEmitter } from 'node:events';

import { DockerAdapter } from './DockerAdapter.js';
import { createZstdCompressStream, createZstdDecompressStream } from './compression/zstdStreams.js';
import { wrapError, DmigError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';
import type { ManifestVolumeEntry, ProgressEvent } from '@shared/types.js';
import { buildProgressEvent } from '@shared/progress.js';

/**
 * 名前付きボリュームのエクスポート/インポート。
 */
export class VolumeExporter extends EventEmitter {
  constructor(private readonly docker: DockerAdapter) {
    super();
  }

  /**
   * 1ボリュームを volumesDir 配下に書き出す（.tar.zst + .meta.json）。
   */
  async exportOne(
    volumeName: string,
    volumesDir: string,
    compressionLevel: number,
    signal?: AbortSignal,
  ): Promise<ManifestVolumeEntry> {
    await fsp.mkdir(volumesDir, { recursive: true });

    const safe = this.safeName(volumeName);
    const tarPath = join(volumesDir, `${safe}.tar.zst`);
    const metaPath = join(volumesDir, `${safe}.meta.json`);

    let driver = 'local';
    try {
      const inspect = await this.docker.inspectVolume(volumeName);
      driver = inspect.Driver ?? 'local';
      await fsp.writeFile(metaPath, JSON.stringify(inspect, null, 2), 'utf-8');
    } catch (e) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.VOLUME_EXPORT_FAILED, `exportOne/inspect(${volumeName})`);
    }

    let compressedSize = 0;
    const hash = createHash('sha256');
    const volumeOriginal = await this.getVolumeOriginalSize(volumeName);

    const timer = setInterval(() => {
      const totalBytes = Math.max(volumeOriginal, compressedSize, 1);
      this.emit(
        'progress',
        buildProgressEvent({
          taskId: volumeName,
          phase: 'compress',
          current: compressedSize,
          total: totalBytes,
          message: `ボリューム ${volumeName} をエクスポート中... ${(compressedSize / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
        }),
      );
    }, 500);

    try {
      const tarStream = await this.docker.exportVolumeStream(volumeName);
      const compressor = await createZstdCompressStream(compressionLevel);
      const hasher = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          compressedSize += chunk.length;
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      const writeStream = createWriteStream(tarPath);
      const pipeOpts = signal ? { signal } : {};
      await pipeline(tarStream, compressor, hasher, writeStream, pipeOpts);
    } catch (e) {
      await fsp.unlink(tarPath).catch(() => {});
      const err = e as { name?: string };
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw new DmigError(ErrorCodes.JOB_CANCELLED, {
          detail: `volume export aborted: ${volumeName}`,
        });
      }
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.VOLUME_EXPORT_FAILED, `exportOne/pipeline(${volumeName})`);
    } finally {
      clearInterval(timer);
    }

    return {
      name: volumeName,
      filename: `volumes/${safe}.tar.zst`,
      compressedSize,
      sha256: hash.digest('hex'),
      driver,
    };
  }

  /**
   * パッケージ内の tar.zst からボリュームを復元する。
   */
  async importOne(
    volumeName: string,
    packageDir: string,
    tarFileRelative: string,
    options: { overwrite?: boolean } = {},
  ): Promise<void> {
    const tarPath = safeJoinUnder(packageDir, tarFileRelative);

    try {
      await fsp.access(tarPath);
    } catch {
      throw new DmigError(ErrorCodes.VOLUME_IMPORT_FAILED, {
        detail: `tar not found: ${tarPath}`,
      });
    }

    this.emit('progress', {
      taskId: volumeName,
      phase: 'load',
      current: 0,
      total: 0,
      percentage: 0,
      message: `ボリューム ${volumeName} をインポート中...`,
    } satisfies ProgressEvent);

    try {
      const fileStream = createReadStream(tarPath);
      const decompressor = await createZstdDecompressStream();
      fileStream.pipe(decompressor);
      await this.docker.importVolumeStream(volumeName, decompressor as import('stream').Readable, {
        overwrite: options.overwrite,
      });
    } catch (e) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.VOLUME_IMPORT_FAILED, `importOne(${volumeName})`);
    }
  }

  private safeName(volumeName: string): string {
    return volumeName.replace(/[/:\\]/g, '_');
  }

  private async getVolumeOriginalSize(volumeName: string): Promise<number> {
    try {
      const info = await this.docker.inspectVolume(volumeName);
      const usage = (info as { UsageData?: { Size?: number } }).UsageData?.Size;
      if (typeof usage === 'number' && usage > 0) {
        return usage;
      }
    } catch {
      /* inspect 失敗時はフォールバック */
    }
    return 100 * 1024 * 1024;
  }
}
