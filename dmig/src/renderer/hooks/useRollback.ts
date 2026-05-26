import { useCallback, useState } from 'react';
import type { ListRollbacksRequest, RollbackSummary } from '../../shared/types.js';
import { useRollbackJob } from '../context/RollbackJobContext.js';

export type RollbackStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

export function countDirectoryNotEmptyWarnings(warnings: string[]): number {
  return warnings.filter((w) => w.startsWith('directory_not_empty:')).length;
}

/**
 * ロールバック一覧はローカル、実行状態は RollbackJobContext を参照する。
 */
export function useRollback() {
  const {
    status: jobStatus,
    lastResult,
    error,
    wasAlreadyExecuted,
    rollbackJobToken,
    runRollback,
    cancelRollback,
    reset: resetJob,
  } = useRollbackJob();

  const [listStatus, setListStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [records, setRecords] = useState<RollbackSummary[]>([]);
  const [listWarnings, setListWarnings] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const status: RollbackStatus =
    jobStatus === 'running'
      ? 'running'
      : jobStatus === 'done'
        ? 'done'
        : jobStatus === 'error'
          ? 'error'
          : listStatus === 'loading'
            ? 'loading'
            : listStatus === 'error'
              ? 'error'
              : 'idle';

  const reset = useCallback(() => {
    resetJob();
    setListError(null);
  }, [resetJob]);

  const listRecords = useCallback(async (req: ListRollbacksRequest) => {
    setListStatus('loading');
    setListError(null);
    try {
      const r = await window.dmig.listRollbacks(req);
      if (r.ok) {
        setRecords(r.data.records);
        setListWarnings(r.data.warnings);
        setListStatus('idle');
      } else {
        setListError(r.error.message);
        setListStatus('error');
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setListStatus('error');
    }
  }, []);

  return {
    status,
    records,
    listWarnings,
    lastResult,
    error: error ?? listError,
    wasAlreadyExecuted,
    listRecords,
    runRollback,
    cancelRollback,
    rollbackJobToken,
    reset,
  };
}
