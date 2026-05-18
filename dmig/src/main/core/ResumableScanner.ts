import { access, lstat, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type {
  ListResumablePackagesRequest,
  ListResumablePackagesResult,
  ProbeSummary,
} from '@shared/types.js';

/** `Importer.probe` と同じシグネチャの走査用コールバック */
export type PackageProbeFn = (packageDir: string) => Promise<ProbeSummary>;

/** フォルダ走査中の UI 向け進捗。 */
export type ResumableScanProgressCallback = (info: {
  current: number;
  total: number;
  message: string;
}) => void | Promise<void>;

/** DoS 抑止の走査上限（テストではコンストラクタで上書き可） */
export interface ResumableScanLimits {
  maxPackages: number;
  maxDirsScanned: number;
}

export const DEFAULT_RESUMABLE_SCAN_LIMITS: ResumableScanLimits = {
  maxPackages: 50,
  maxDirsScanned: 500,
};

const MANIFEST_NAME = 'manifest.json';
const TRUNCATED_WARNING = 'truncated_at_50';

/**
 * ユーザー指定ディレクトリを浅く走査し、中断中（`ok_partial`）パッケージのみ列挙する。
 */
export class ResumableScanner {
  constructor(
    private readonly probe: PackageProbeFn,
    private readonly limits: ResumableScanLimits = DEFAULT_RESUMABLE_SCAN_LIMITS,
  ) {}

  async scan(
    req: ListResumablePackagesRequest,
    onProgress?: ResumableScanProgressCallback,
  ): Promise<ListResumablePackagesResult> {
    const warnings: string[] = [];
    const packages: ProbeSummary[] = [];
    const maxDepth = ResumableScanner.clampDepth(req.maxDepth);

    try {
      await access(req.rootDir);
    } catch {
      return { packages: [], warnings: ['root_not_found'] };
    }

    let dirsScanned = 0;
    let truncated = false;

    const visit = async (dir: string, depth: number): Promise<void> => {
      if (truncated) return;
      if (dirsScanned >= this.limits.maxDirsScanned) return;

      dirsScanned += 1;
      if (dirsScanned === 1 || dirsScanned % 10 === 0) {
        await onProgress?.({
          current: dirsScanned,
          total: this.limits.maxDirsScanned,
          message: `フォルダを走査中… (${dirsScanned} / ${this.limits.maxDirsScanned})`,
        });
      }

      const manifestPath = join(dir, MANIFEST_NAME);
      let hasManifest = false;
      try {
        await access(manifestPath);
        hasManifest = true;
      } catch {
        hasManifest = false;
      }

      if (hasManifest) {
        const summary = await this.probe(dir);
        if (summary.status === 'ok_partial') {
          packages.push(summary);
          if (packages.length >= this.limits.maxPackages) {
            truncated = true;
            if (!warnings.includes(TRUNCATED_WARNING)) {
              warnings.push(TRUNCATED_WARNING);
            }
          }
        }
        return;
      }

      if (depth >= maxDepth) return;
      if (truncated) return;

      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        const rel = ResumableScanner.safeRel(req.rootDir, dir);
        warnings.push(`permission_denied:${rel}`);
        return;
      }

      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        if (truncated) break;

        const child = join(dir, ent.name);
        let childStat;
        try {
          childStat = await lstat(child);
        } catch {
          warnings.push(`permission_denied:${ResumableScanner.safeRel(req.rootDir, child)}`);
          continue;
        }
        if (childStat.isSymbolicLink()) continue;

        await visit(child, depth + 1);
      }
    };

    await visit(req.rootDir, 0);
    return { packages, warnings };
  }

  /** 走査深度: 既定 1、最大 2、3 以上は 2 にクランプ。 */
  static clampDepth(maxDepth: number | undefined): number {
    const d = maxDepth ?? 1;
    if (d < 1) return 1;
    if (d > 2) return 2;
    return d;
  }

  private static safeRel(rootDir: string, target: string): string {
    const rel = relative(rootDir, target);
    return rel.length > 0 ? rel : '.';
  }
}
