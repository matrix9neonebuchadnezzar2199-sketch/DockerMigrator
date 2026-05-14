import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform, type Writable } from 'node:stream';

import { DmigError, wrapError } from '../errors/DmigError.js';
import { ErrorCodes } from '../errors/codes.js';
import type { TarBackend, TarBackendProbe, TarOpOptions } from './TarBackend.js';

/**
 * ホストの `tar` コマンドを spawn する実装。
 *
 * 利点: 高速、ストリーム転送量に依存しない（C 実装）
 * 欠点: tar コマンドが PATH 上に存在することが前提
 */
export class SystemTarBackend implements TarBackend, TarBackendProbe {
  readonly name = 'system' as const;

  /**
   * tar コマンドが実際に起動できるかを確認する。
   * --version を叩いて exit code 0 を確認する。
   */
  async probe(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const proc = spawn('tar', ['--version'], { shell: false });
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
        proc.stdout?.resume();
        proc.stderr?.resume();
      } catch {
        resolve(false);
      }
    });
  }

  async pack(srcDir: string, out: Writable, options?: TarOpOptions): Promise<void> {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'before tar pack' });
    }

    let written = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.length;
        options?.onBytes?.(written);
        cb(null, chunk);
      },
    });

    const tarProc = spawn('tar', ['-C', srcDir, '-cf', '-', '.'], { shell: false });
    tarProc.stderr.resume();

    const onAbort = () => {
      try {
        tarProc.kill('SIGTERM');
      } catch {
        /* noop */
      }
    };
    signal?.addEventListener('abort', onAbort);

    const tarDone = new Promise<void>((resolve, reject) => {
      tarProc.on('error', reject);
      tarProc.on('close', (code) => {
        if (signal?.aborted) {
          reject(new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'tar pack aborted' }));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar exited with code ${code}`));
        }
      });
    });

    try {
      if (!tarProc.stdout) {
        throw new DmigError(ErrorCodes.BUILD_CONTEXT_TAR_FAILED, { detail: 'tar stdout unavailable' });
      }
      await Promise.all([
        pipeline(tarProc.stdout, counter, out, { signal, end: false }),
        tarDone,
      ]);
    } catch (e: unknown) {
      if (signal?.aborted || (e instanceof Error && e.name === 'AbortError') || e instanceof DmigError) {
        if (e instanceof DmigError) throw e;
        throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'tar pack aborted' });
      }
      throw wrapError(e, ErrorCodes.BUILD_CONTEXT_TAR_FAILED, 'SystemTarBackend.pack');
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async extract(input: NodeJS.ReadableStream, destDir: string, options?: TarOpOptions): Promise<void> {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'before tar extract' });
    }

    let written = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.length;
        options?.onBytes?.(written);
        cb(null, chunk);
      },
    });

    const tarProc = spawn('tar', ['-C', destDir, '-xf', '-'], { shell: false });
    tarProc.stderr.resume();

    const onAbort = () => {
      try {
        tarProc.kill('SIGTERM');
      } catch {
        /* noop */
      }
    };
    signal?.addEventListener('abort', onAbort);

    const tarDone = new Promise<void>((resolve, reject) => {
      tarProc.on('error', reject);
      tarProc.on('close', (code) => {
        if (signal?.aborted) {
          reject(new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'tar extract aborted' }));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar -x exited with code ${code}`));
        }
      });
    });

    try {
      if (!tarProc.stdin) {
        throw new DmigError(ErrorCodes.COMPOSE_IMPORT_FAILED, { detail: 'tar stdin unavailable' });
      }
      await Promise.all([pipeline(input, counter, tarProc.stdin, { signal }), tarDone]);
      if (tarProc.stdout) {
        tarProc.stdout.resume();
      }
    } catch (e: unknown) {
      if (signal?.aborted || (e instanceof Error && e.name === 'AbortError') || e instanceof DmigError) {
        if (e instanceof DmigError) throw e;
        throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'tar extract aborted' });
      }
      throw wrapError(e, ErrorCodes.COMPOSE_IMPORT_FAILED, 'SystemTarBackend.extract');
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
