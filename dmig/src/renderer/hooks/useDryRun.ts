import { useCallback, useState } from 'react';
import type { DryRunRequest, DryRunResult } from '../../shared/types.js';

export type DryRunStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseDryRunState {
  status: DryRunStatus;
  result: DryRunResult | null;
  error: string | null;
}

/**
 * ドライラン IPC の状態と run / reset を提供する。
 */
export function useDryRun() {
  const [status, setStatus] = useState<DryRunStatus>('idle');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  const run = useCallback(async (request: DryRunRequest) => {
    setStatus('running');
    setError(null);
    setResult(null);
    const r = await window.dmig.runDryRun(request);
    if (r.ok) {
      setResult(r.data);
      setStatus('done');
    } else {
      setError(r.error.message);
      setStatus('error');
    }
  }, []);

  const hasErrorFindings =
    result?.findings.some((f) => f.severity === 'error') ?? false;

  return { status, result, error, run, reset, hasErrorFindings };
}
