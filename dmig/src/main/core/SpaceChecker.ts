import checkDiskSpace from 'check-disk-space';

import type { SpaceCheckResult } from '@shared/types.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';

/**
 * 出力先パスの空き容量と推定必要量を比較する。
 *
 * 判定:
 *   - free < required * 1.0  → insufficient（実行不可）
 *   - free < required * 1.1  → warning（ぎりぎり、警告表示）
 *   - それ以上               → ok
 */
export class SpaceChecker {
  async check(path: string, requiredBytes: number): Promise<SpaceCheckResult> {
    let totalBytes = 0;
    let freeBytes = 0;
    try {
      const info = await checkDiskSpace(path);
      totalBytes = info.size;
      freeBytes = info.free;
    } catch (e: unknown) {
      throw wrapError(e, ErrorCodes.PREFLIGHT_FAILED, `SpaceChecker.check(${path})`);
    }

    const recommendedBytes = Math.ceil(requiredBytes * 1.1);
    let status: SpaceCheckResult['status'];
    if (freeBytes < requiredBytes) {
      status = 'insufficient';
    } else if (freeBytes < recommendedBytes) {
      status = 'warning';
    } else {
      status = 'ok';
    }

    return {
      path,
      totalBytes,
      freeBytes,
      requiredBytes,
      recommendedBytes,
      status,
    };
  }

  /**
   * 結果に応じて DmigError を投げる（不足時のみ）。warning は呼び出し側で判断。
   */
  assertSufficient(result: SpaceCheckResult): void {
    if (result.status === 'insufficient') {
      const need = (result.requiredBytes / 1024 / 1024 / 1024).toFixed(2);
      const free = (result.freeBytes / 1024 / 1024 / 1024).toFixed(2);
      throw new DmigError(ErrorCodes.DISK_SPACE_INSUFFICIENT, {
        detail: `必要 ${need}GB / 空き ${free}GB / パス ${result.path}`,
      });
    }
  }
}
