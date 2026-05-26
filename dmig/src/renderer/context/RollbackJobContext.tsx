import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { RunRollbackResult } from '../../shared/types.js';

export type RollbackJobStatus = 'idle' | 'running' | 'done' | 'error';

type RollbackJobContextValue = {
  status: RollbackJobStatus;
  lastResult: RunRollbackResult | null;
  error: string | null;
  wasAlreadyExecuted: boolean;
  runRollback: (packageDir: string, entryIds?: string[]) => Promise<
    Awaited<ReturnType<typeof window.dmig.runRollback>>
  >;
  reset: () => void;
};

const RollbackJobContext = createContext<RollbackJobContextValue | null>(null);

export const RollbackJobProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<RollbackJobStatus>('idle');
  const [lastResult, setLastResult] = useState<RunRollbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasAlreadyExecuted, setWasAlreadyExecuted] = useState(false);

  const reset = useCallback(() => {
    setStatus('idle');
    setLastResult(null);
    setError(null);
    setWasAlreadyExecuted(false);
  }, []);

  const runRollback = useCallback(async (packageDir: string, entryIds?: string[]) => {
    if (status === 'running') {
      return {
        ok: false as const,
        error: { code: 'ROLLBACK_BUSY', message: 'ロールバックは既に実行中です。' },
      };
    }
    setStatus('running');
    setError(null);
    setLastResult(null);
    setWasAlreadyExecuted(false);
    const r = await window.dmig.runRollback({ packageDir, entryIds });
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
      runRollback,
      reset,
    }),
    [status, lastResult, error, wasAlreadyExecuted, runRollback, reset],
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
