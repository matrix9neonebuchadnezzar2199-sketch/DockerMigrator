import type { Duplex, Transform } from 'node:stream';
import * as zlib from 'node:zlib';

/**
 * Node 22+ の node:zlib ネイティブ zstd を優先し、
 * ランタイムに API が無い・生成に失敗した場合は simple-zstd にフォールバックする。
 *
 * Electron 39 以降（Node 22 同梱）では通常ネイティブ経路が選ばれる。
 */

type ZstdCompressFn = (options?: { level?: number }) => Transform;
type ZstdDecompressFn = (options?: object) => Transform;

function getNativeZstdCompress(): ZstdCompressFn | undefined {
  const fn = (zlib as typeof zlib & { createZstdCompress?: ZstdCompressFn }).createZstdCompress;
  return typeof fn === 'function' ? fn : undefined;
}

function getNativeZstdDecompress(): ZstdDecompressFn | undefined {
  const fn = (zlib as typeof zlib & { createZstdDecompress?: ZstdDecompressFn }).createZstdDecompress;
  return typeof fn === 'function' ? fn : undefined;
}

/**
 * zstd 圧縮用の Transform（または simple-zstd の Duplex）を返す。
 */
export async function createZstdCompressStream(level: number): Promise<Transform | Duplex> {
  const native = getNativeZstdCompress();
  if (native) {
    try {
      return native({ level });
    } catch {
      // ネイティブ生成失敗時はフォールバックへ
    }
  }
  const { compress } = await import('simple-zstd');
  return compress(level);
}

/**
 * zstd 展開用の Transform（または simple-zstd の Duplex）を返す。
 */
export async function createZstdDecompressStream(): Promise<Transform | Duplex> {
  const native = getNativeZstdDecompress();
  if (native) {
    try {
      return native({});
    } catch {
      // 同上
    }
  }
  const { decompress } = await import('simple-zstd');
  return decompress();
}
