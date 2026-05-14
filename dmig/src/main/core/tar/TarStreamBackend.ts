import { createReadStream, createWriteStream, promises as fsp } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { Transform, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extract as createTarExtract, pack as createTarPack, type Pack } from 'tar-stream';

import { DmigError, wrapError } from '../errors/DmigError.js';
import { ErrorCodes } from '../errors/codes.js';
import type { TarBackend, TarOpOptions } from './TarBackend.js';

/**
 * tar-stream パッケージを用いた純 Node 実装。
 *
 * 利点: tar コマンド不要、Windows でも追加インストール無しで動作
 * 欠点: spawn 版より遅い（特に小さなファイル多数のとき）、メモリ使用量も多め
 *
 * 実装メモ:
 *   - ディレクトリ走査は再帰的に行い、シンボリックリンク・FIFO 等は無視
 *   - 大きなファイルは fs.createReadStream → pack.entry の Sink に pipe
 *   - ファイルモードは uid/gid 含めて保持しない（クロスOS転送のため意図的に単純化）
 */
export class TarStreamBackend implements TarBackend {
  readonly name = 'stream' as const;

  async pack(srcDir: string, out: Writable, options?: TarOpOptions): Promise<void> {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'before tar-stream pack' });
    }

    const pack = createTarPack();
    let written = 0;

    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.length;
        options?.onBytes?.(written);
        cb(null, chunk);
      },
    });

    const pipePromise = pipeline(pack, counter, out, { signal, end: false });

    const onAbort = () => {
      try {
        pack.destroy();
      } catch {
        /* noop */
      }
    };
    signal?.addEventListener('abort', onAbort);

    try {
      await this.addDirectoryEntries(pack, srcDir, srcDir, signal);
      pack.finalize();
      await pipePromise;
    } catch (e: unknown) {
      try {
        pack.destroy();
      } catch {
        /* noop */
      }
      if (signal?.aborted || (e instanceof Error && e.name === 'AbortError') || e instanceof DmigError) {
        if (e instanceof DmigError) throw e;
        throw new DmigError(ErrorCodes.JOB_CANCELLED, {
          detail: 'tar-stream pack aborted',
        });
      }
      throw wrapError(e, ErrorCodes.BUILD_CONTEXT_TAR_FAILED, 'TarStreamBackend.pack');
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async extract(input: NodeJS.ReadableStream, destDir: string, options?: TarOpOptions): Promise<void> {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'before tar-stream extract' });
    }

    await fsp.mkdir(destDir, { recursive: true });

    const extract = createTarExtract();
    let written = 0;

    const onAbort = () => {
      try {
        extract.destroy();
      } catch {
        /* noop */
      }
    };
    signal?.addEventListener('abort', onAbort);

    extract.on('entry', (header, stream, next) => {
      void (async () => {
        try {
          if (signal?.aborted) {
            stream.resume();
            next(
              new DmigError(ErrorCodes.JOB_CANCELLED, {
                detail: 'tar-stream extract aborted',
              }),
            );
            return;
          }

          const outPath = join(destDir, header.name);

          if (header.type === 'directory') {
            await fsp.mkdir(outPath, { recursive: true });
            stream.resume();
            next();
            return;
          }

          if (header.type === 'file') {
            await fsp.mkdir(dirname(outPath), { recursive: true });
            const ws = createWriteStream(outPath);
            stream.on('data', (chunk: Buffer) => {
              written += chunk.length;
              options?.onBytes?.(written);
            });
            await pipeline(stream, ws);
            next();
            return;
          }

          stream.resume();
          next();
        } catch (err) {
          next(err);
        }
      })();
    });

    try {
      await pipeline(input, extract, { signal });
    } catch (e: unknown) {
      if (signal?.aborted || (e instanceof Error && e.name === 'AbortError') || e instanceof DmigError) {
        if (e instanceof DmigError) throw e;
        throw new DmigError(ErrorCodes.JOB_CANCELLED, {
          detail: 'tar-stream extract aborted',
        });
      }
      throw wrapError(e, ErrorCodes.COMPOSE_IMPORT_FAILED, 'TarStreamBackend.extract');
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * srcDir 配下を再帰的に巡回し、tar-stream の pack に追加する。
   *
   * baseDir は tar 内パス計算の起点（常に srcDir と同じ値）。
   */
  private async addDirectoryEntries(
    pack: Pack,
    currentDir: string,
    baseDir: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'walking aborted' });
    }

    const entries = await fsp.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (signal?.aborted) {
        throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'walking aborted' });
      }

      const fullPath = join(currentDir, entry.name);
      const tarPath = relative(baseDir, fullPath).split(sep).join('/');

      if (entry.isDirectory()) {
        await new Promise<void>((resolve, reject) => {
          const dirName = tarPath.endsWith('/') ? tarPath : `${tarPath}/`;
          pack.entry({ name: dirName, type: 'directory' }, (err) => (err ? reject(err) : resolve()));
        });
        await this.addDirectoryEntries(pack, fullPath, baseDir, signal);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(fullPath);
        await new Promise<void>((resolve, reject) => {
          const sink = pack.entry(
            {
              name: tarPath,
              size: stat.size,
              mode: stat.mode & 0o777,
              type: 'file',
            },
            (err) => (err ? reject(err) : resolve()),
          );
          const rs = createReadStream(fullPath);
          rs.on('error', reject);
          sink.on('error', reject);
          rs.pipe(sink);
        });
      }
    }
  }
}
