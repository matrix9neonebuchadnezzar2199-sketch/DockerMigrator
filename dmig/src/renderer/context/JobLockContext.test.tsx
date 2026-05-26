import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JobLockProvider, useJobLock } from './JobLockContext.js';

function wrapper({ children }: { children: React.ReactNode }) {
  return <JobLockProvider>{children}</JobLockProvider>;
}

describe('JobLockContext', () => {
  it('同種ジョブの二重開始を拒否する', async () => {
    const { result } = renderHook(() => useJobLock(), { wrapper });
    act(() => {
      expect(result.current.tryBegin('export')).toBe(true);
    });
    act(() => {
      expect(result.current.tryBegin('export')).toBe(false);
    });
    await waitFor(() => {
      expect(result.current.blockedMessage).toContain('実行中');
    });
    act(() => {
      result.current.end('export');
    });
    act(() => {
      expect(result.current.tryBegin('export')).toBe(true);
    });
  });
});
