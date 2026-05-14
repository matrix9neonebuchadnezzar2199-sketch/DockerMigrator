import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

import type { DockerAdapter } from './DockerAdapter.js';
import type { ComposeProjectInfo, SizeEstimate, SizeEstimateEntry } from '@shared/types.js';

/**
 * エクスポート前のサイズ推定。
 *
 * 推定モデル:
 *   - イメージ: docker images の Size をそのまま使い、圧縮後 × 0.4 倍
 *   - ボリューム: inspect の UsageData.Size が取れればそれ、不明時は 100MB 仮定
 *   - ビルドコンテキスト / bind mount: ディレクトリ再帰サイズ × 0.5 倍
 */
export class SizeEstimator {
  private static readonly IMAGE_RATIO = 0.4;
  private static readonly VOLUME_RATIO = 0.5;
  private static readonly CONTEXT_RATIO = 0.5;
  private static readonly UNKNOWN_VOLUME_FALLBACK = 100 * 1024 * 1024;

  /**
   * 圧縮後バイト数の経験値（DiffPreview 等と共有。係数変更時はここを単一ソースとする）。
   */
  static estimateCompressedBytes(originalBytes: number, kind: 'image' | 'volume'): number {
    const ratio = kind === 'image' ? SizeEstimator.IMAGE_RATIO : SizeEstimator.VOLUME_RATIO;
    return Math.ceil(originalBytes * ratio);
  }

  constructor(private readonly docker: DockerAdapter) {}

  async estimateForCompose(projects: ComposeProjectInfo[]): Promise<SizeEstimate> {
    const breakdown: SizeEstimateEntry[] = [];

    const imageSet = new Set<string>();
    const volumeSet = new Set<string>();
    const buildPaths: Array<{ name: string; path: string }> = [];
    const bindPaths: Array<{ name: string; path: string }> = [];

    for (const proj of projects) {
      for (const svc of proj.services) {
        if (svc.image) imageSet.add(svc.image);
        if (svc.buildContextPath) {
          buildPaths.push({
            name: `${proj.name}/${svc.name}`,
            path: svc.buildContextPath,
          });
        }
      }
      for (const v of proj.volumeNames) volumeSet.add(v);
      for (const bm of proj.bindMounts) {
        bindPaths.push({
          name: `${proj.name}: ${bm.hostPath}`,
          path: bm.hostPath,
        });
      }
    }

    let imagesEstimated = 0;
    for (const imgName of imageSet) {
      const orig = await this.getImageSize(imgName);
      const est = Math.ceil(orig * SizeEstimator.IMAGE_RATIO);
      imagesEstimated += est;
      breakdown.push({
        kind: 'image',
        name: imgName,
        originalBytes: orig,
        estimatedBytes: est,
      });
    }

    let volumesEstimated = 0;
    for (const volName of volumeSet) {
      const orig = await this.getVolumeSize(volName);
      const est = Math.ceil(orig * SizeEstimator.VOLUME_RATIO);
      volumesEstimated += est;
      breakdown.push({
        kind: 'volume',
        name: volName,
        originalBytes: orig,
        estimatedBytes: est,
      });
    }

    let contextsEstimated = 0;
    for (const { name, path } of buildPaths) {
      const orig = await this.estimateDirSize(path);
      const est = Math.ceil(orig * SizeEstimator.CONTEXT_RATIO);
      contextsEstimated += est;
      breakdown.push({
        kind: 'buildContext',
        name,
        originalBytes: orig,
        estimatedBytes: est,
      });
    }
    for (const { name, path } of bindPaths) {
      const orig = await this.estimateDirSize(path);
      const est = Math.ceil(orig * SizeEstimator.CONTEXT_RATIO);
      contextsEstimated += est;
      breakdown.push({
        kind: 'bindMount',
        name,
        originalBytes: orig,
        estimatedBytes: est,
      });
    }

    return {
      imagesEstimated,
      volumesEstimated,
      contextsEstimated,
      totalEstimated: imagesEstimated + volumesEstimated + contextsEstimated,
      breakdown,
    };
  }

  /**
   * イメージ単体のサイズ取得（Image 直接エクスポート用）。
   */
  async estimateForImages(imageNames: string[]): Promise<SizeEstimate> {
    const breakdown: SizeEstimateEntry[] = [];
    let imagesEstimated = 0;

    for (const imgName of imageNames) {
      const orig = await this.getImageSize(imgName);
      const est = Math.ceil(orig * SizeEstimator.IMAGE_RATIO);
      imagesEstimated += est;
      breakdown.push({
        kind: 'image',
        name: imgName,
        originalBytes: orig,
        estimatedBytes: est,
      });
    }

    return {
      imagesEstimated,
      volumesEstimated: 0,
      contextsEstimated: 0,
      totalEstimated: imagesEstimated,
      breakdown,
    };
  }

  private async getImageSize(imageName: string): Promise<number> {
    try {
      const images = await this.docker.listImages();
      const match = images.find((i) => i.repoTags.includes(imageName));
      return match?.size ?? 0;
    } catch {
      return 0;
    }
  }

  private async getVolumeSize(volumeName: string): Promise<number> {
    try {
      const info = await this.docker.inspectVolume(volumeName);
      const usage = (info as { UsageData?: { Size?: number } }).UsageData?.Size;
      if (typeof usage === 'number' && usage >= 0) return usage;
      return SizeEstimator.UNKNOWN_VOLUME_FALLBACK;
    } catch {
      return SizeEstimator.UNKNOWN_VOLUME_FALLBACK;
    }
  }

  /**
   * ディレクトリの総サイズを再帰的に計算する。
   * シンボリックリンクは辿らない（ループ回避）。
   */
  private async estimateDirSize(dir: string): Promise<number> {
    let total = 0;
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isSymbolicLink()) {
          continue;
        }
        if (entry.isDirectory()) {
          total += await this.estimateDirSize(full);
        } else if (entry.isFile()) {
          try {
            const stat = await fsp.stat(full);
            total += stat.size;
          } catch {
            /* permission denied 等は無視 */
          }
        }
      }
    } catch {
      /* dir 自体が読めない場合は 0 */
    }
    return total;
  }
}
