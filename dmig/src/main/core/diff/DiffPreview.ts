/**
 * Phase 6: {@link DiffResult} からプレビュー用サマリを生成する。
 *
 * 転送量はスナップショット由来のサイズを集計し、圧縮後は {@link SizeEstimator.estimateCompressedBytes} に委ねる
 * （係数は SizeEstimator と単一ソース）。
 */
import type { DiffPreviewResult, DiffResult } from '@shared/types.js';
import { SizeEstimator } from '../SizeEstimator.js';

/**
 * 差分プレビュー用サマリのビルダー。
 */
export class DiffPreview {
  /**
   * 差分結果からプレビューを構築する。
   * added / modified のみ転送サイズに含め、removed は含めない。
   *
   * @param diff - 差分計算結果
   */
  build(diff: DiffResult): DiffPreviewResult {
    const summary = {
      images: this.countByKind(diff.images),
      volumes: this.countByKind(diff.volumes),
      composeProjects: this.countByKind(diff.composeProjects),
    };

    let imageBytes = 0;
    for (const e of diff.images) {
      if (e.kind !== 'removed') imageBytes += e.size;
    }
    let volumeBytes = 0;
    for (const e of diff.volumes) {
      if (e.kind !== 'removed') volumeBytes += e.size;
    }

    const estimatedSizeRaw = imageBytes + volumeBytes;
    let estimatedSizeCompressed = 0;
    for (const e of diff.images) {
      if (e.kind !== 'removed') {
        estimatedSizeCompressed += SizeEstimator.estimateCompressedBytes(e.size, 'image');
      }
    }
    for (const e of diff.volumes) {
      if (e.kind !== 'removed') {
        estimatedSizeCompressed += SizeEstimator.estimateCompressedBytes(e.size, 'volume');
      }
    }

    return {
      diff,
      summary,
      estimatedSizeRaw,
      estimatedSizeCompressed,
    };
  }

  private countByKind<T extends { kind: string }>(
    entries: T[],
  ): { added: number; modified: number; removed: number } {
    const c = { added: 0, modified: 0, removed: 0 };
    for (const e of entries) {
      if (e.kind === 'added') c.added++;
      else if (e.kind === 'modified') c.modified++;
      else if (e.kind === 'removed') c.removed++;
    }
    return c;
  }
}
