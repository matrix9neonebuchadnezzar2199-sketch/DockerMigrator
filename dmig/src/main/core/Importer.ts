import { createReadStream, promises as fsp } from 'node:fs';
import type { Readable } from 'node:stream';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

import { createZstdDecompressStream } from './compression/zstdStreams.js';
import { DockerAdapter } from './DockerAdapter.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';
import type { DmigManifest, ImportRequest, ProgressEvent } from '@shared/types.js';

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

  async importImages(req: ImportRequest, signal?: AbortSignal): Promise<void> {
    const manifest = await this.readManifest(req.packageDir);
    const targets = manifest.contents.images.filter((e) => req.selectedImages.includes(e.name));

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
      const filepath = join(req.packageDir, rel);

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
    }

    this.emitProgress({
      taskId: 'done',
      phase: 'load',
      current: targets.length,
      total: targets.length,
      percentage: 100,
      message: 'インポートが完了しました。',
    });
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
