import { useCallback, useState } from 'react';
import type {
  ListRollbacksRequest,
  RollbackSummary,
  RunRollbackResult,
} from '../../shared/types.js';

export type RollbackStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

export function countDirectoryNotEmptyWarnings(warnings: string[]): number {
  return warnings.filter((w) => w.startsWith('directory_not_empty:')).length;
}

/**
 * ロールバック IPC の状態管理。
 */
export function useRollback() {
  const [status, setStatus] = useState<RollbackStatus>('idle');
  const [records, setRecords] = useState<RollbackSummary[]>([]);
  const [listWarnings, setListWarnings] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<RunRollbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setLastResult(null);
    setError(null);
  }, []);

  const listRecords = useCallback(async (req: ListRollbacksRequest) => {
    setStatus('loading');
    setError(null);
    try {
      const r = await window.dmig.listRollbacks(req);
      if (r.ok) {
        setRecords(r.data.records);
        setListWarnings(r.data.warnings);
        setStatus('idle');
      } else {
        setError(r.error.message);
        setStatus('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  const runRollback = useCallback(async (packageDir: string, entryIds?: string[]) => {
    setStatus('running');
    setError(null);
    setLastResult(null);
    const r = await window.dmig.runRollback({ packageDir, entryIds });
    if (r.ok) {
      setLastResult(r.data);
      setStatus('done');
      if (r.data.warnings.includes('already_executed')) {
        setError(null);
      }
    } else {
      setError(r.error.message);
      setStatus('error');
    }
    return r;
  }, []);

  return {
    status,
    records,
    listWarnings,
    lastResult,
    error,
    listRecords,
    runRollback,
    reset,
  };
}
