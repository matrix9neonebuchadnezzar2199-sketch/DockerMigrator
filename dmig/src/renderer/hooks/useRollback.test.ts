import { createElement, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JobLockProvider } from '../context/JobLockContext.js';
import { RollbackJobProvider } from '../context/RollbackJobContext.js';
import { countDirectoryNotEmptyWarnings, useRollback } from './useRollback.js';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    JobLockProvider,
    null,
    createElement(RollbackJobProvider, null, children),
  );
}

describe('countDirectoryNotEmptyWarnings', () => {
  it('directory_not_empty: プレフィックスを数える', () => {
    expect(
      countDirectoryNotEmptyWarnings([
        'directory_not_empty:dir-001',
        'already_executed',
        'directory_not_empty:dir-002',
      ]),
    ).toBe(2);
  });
});

describe('useRollback', () => {
  it('listRecords で summaries を保持', async () => {
    window.dmig = {
      ...window.dmig,
      listRollbacks: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          records: [
            {
              packageDir: '/p',
              kind: 'import',
              createdAt: 't',
              entryCount: 1,
              supported: true,
            },
          ],
          warnings: [],
        },
      }),
    } as typeof window.dmig;

    const { result } = renderHook(() => useRollback(), { wrapper });
    await act(async () => {
      await result.current.listRecords({ rootDir: '/usb', maxDepth: 1 });
    });
    await waitFor(() => {
      expect(result.current.records).toHaveLength(1);
    });
  });

  it('listRollbacks が例外のとき error 状態になる', async () => {
    window.dmig = {
      ...window.dmig,
      listRollbacks: vi.fn().mockRejectedValue(new Error('IPC channel missing')),
    } as typeof window.dmig;

    const { result } = renderHook(() => useRollback(), { wrapper });
    await act(async () => {
      await result.current.listRecords({ rootDir: '/usb', maxDepth: 1 });
    });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('IPC channel missing');
    });
  });

  it('runRollback で lastResult を設定', async () => {
    window.dmig = {
      ...window.dmig,
      runRollback: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          succeeded: ['a'],
          skipped: [],
          failed: [],
          warnings: ['directory_not_empty:dir-001'],
        },
      }),
    } as typeof window.dmig;

    const { result } = renderHook(() => useRollback(), { wrapper });
    await act(async () => {
      await result.current.runRollback('/p');
    });
    await waitFor(() => {
      expect(result.current.lastResult?.succeeded).toEqual(['a']);
    });
  });
});
