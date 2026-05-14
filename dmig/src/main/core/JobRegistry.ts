import type { JobToken, CancelResult } from '@shared/types.js';
import { DmigError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';

/**
 * 実行中ジョブの AbortController を保持するレジストリ（Main プロセス）。
 *
 * - Renderer が UUID を jobToken として付与し、IPC 開始時に register
 * - dmig:cancel で abort() を発火
 * - 完了時は finally で unregister
 *
 * jobToken が未指定の場合はキャンセル不可として登録しない（捨て用 Controller を返す）。
 */
class JobRegistry {
  private readonly jobs = new Map<JobToken, AbortController>();

  /**
   * 新しいジョブを登録し、AbortController を返す。
   */
  register(jobToken: JobToken | undefined): AbortController {
    if (!jobToken) {
      return new AbortController();
    }
    if (this.jobs.has(jobToken)) {
      throw new DmigError(ErrorCodes.UNKNOWN_ERROR, {
        detail: `job token already exists: ${jobToken}`,
      });
    }
    const controller = new AbortController();
    this.jobs.set(jobToken, controller);
    return controller;
  }

  unregister(jobToken: JobToken | undefined): void {
    if (!jobToken) return;
    this.jobs.delete(jobToken);
  }

  cancel(jobToken: JobToken): CancelResult {
    const controller = this.jobs.get(jobToken);
    if (!controller) {
      return { aborted: false, reason: 'job not found or already finished' };
    }
    controller.abort();
    return { aborted: true };
  }

  /** テスト・デバッグ用 */
  size(): number {
    return this.jobs.size;
  }
}

export const jobRegistry = new JobRegistry();
