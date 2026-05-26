import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { RunRollbackResult } from '../../shared/types.js';

export type RollbackJobStatus = 'idle' | 'running' | 'done' | 'error';

type RollbackJobContextValue = {
  status: RollbackJobStatus;
  lastResult: RunRollbackResult | null;
  error: string | null;
  wasAlreadyExecuted: boolean;
  rollbackJobToken: string | null;
  runRollback: (packageDir: string, entryIds?: string[]) => Promise<
    Awaited<ReturnType<typeof window.dmig.runRollback>>
  >;
  cancelRollback: () => void;
  reset: () => void;
};

const RollbackJobContext = createContext<RollbackJobContextValue | null>(null);

export const RollbackJobProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<RollbackJobStatus>('idle');
  const [lastResult, setLastResult] = useState<RunRollbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasAlreadyExecuted, setWasAlreadyExecuted] = useState(false);
  const [rollbackJobToken, setRollbackJobToken] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setLastResult(null);
    setError(null);
    setWasAlreadyExecuted(false);
    setRollbackJobToken(null);
  }, []);

  const cancelRollback = useCallback(() => {
    if (rollbackJobToken) {
      void window.dmig.cancel(rollbackJobToken);
    }
  }, [rollbackJobToken]);

  const runRollback = useCallback(async (packageDir: string, entryIds?: string[]) => {
    if (status === 'running') {
      return {
        ok: false as const,
        error: { code: 'ROLLBACK_BUSY', message: 'ロールバックは既に実行中です。' },
      };
    }
    const jobToken = crypto.randomUUID();
    setRollbackJobToken(jobToken);
    setStatus('running');
    setError(null);
    setLastResult(null);
    setWasAlreadyExecuted(false);
    let r;
    try {
      r = await window.dmig.runRollback({ packageDir, entryIds, jobToken });
    } finally {
      setRollbackJobToken(null);
    }
    if (r.ok) {
      setLastResult(r.data);
      setStatus('done');
      if (r.data.warnings.includes('already_executed')) {
        setWasAlreadyExecuted(true);
      }
    } else {
      setError(r.error.message);
      setStatus('error');
    }
    return r;
  }, [status]);

  const value = useMemo(
    () => ({
      status,
      lastResult,
      error,
      wasAlreadyExecuted,
      rollbackJobToken,
      runRollback,
      cancelRollback,
      reset,
    }),
    [status, lastResult, error, wasAlreadyExecuted, rollbackJobToken, runRollback, cancelRollback, reset],
  );

  return <RollbackJobContext.Provider value={value}>{children}</RollbackJobContext.Provider>;
};

export function useRollbackJob(): RollbackJobContextValue {
  const ctx = useContext(RollbackJobContext);
  if (!ctx) {
    throw new Error('useRollbackJob must be used within RollbackJobProvider');
  }
  return ctx;
}
