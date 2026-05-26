import { useCallback, useEffect, useState } from 'react';
import type { ProgressScope } from '../../shared/types.js';
import { useProgressBus } from '../context/ProgressBusContext.js';

/** 再開完了時、最終チャンク完了後のキャンセル要求（B-20 案B）向け UI 文言。 */
export const RESUME_LATE_CANCEL_SUCCESS_MESSAGE =
  'キャンセル要求を受けましたが、最終チャンクは完了済みのため、パックは成功として保存されました。';

export const RESUME_SUCCESS_MESSAGE = 'エクスポートの再開が完了しました。';

function isDoneProgress(ev: { taskId: string; phase: string; percentage: number }): boolean {
  return ev.taskId === 'done' && ev.phase === 'write' && ev.percentage >= 100;
}

/**
 * 最終 progress（taskId=done）の cancelRequested を捕捉する。
 */
export function useDoneProgressNotice(scope: ProgressScope = 'transfer') {
  const { subscribe } = useProgressBus();
  const [cancelRequestedOnDone, setCancelRequestedOnDone] = useState(false);

  useEffect(() => {
    return subscribe(scope, (ev) => {
      if (isDoneProgress(ev)) {
        setCancelRequestedOnDone(ev.cancelRequested === true);
      }
    });
  }, [subscribe, scope]);

  const clear = useCallback(() => setCancelRequestedOnDone(false), []);

  return { cancelRequestedOnDone, clear };
}
