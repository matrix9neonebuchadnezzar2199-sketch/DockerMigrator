import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useDryRun } from './useDryRun.js';

describe('useDryRun', () => {
  beforeEach(() => {
    window.dmig = {
      ...window.dmig,
      runDryRun: vi.fn(),
    } as typeof window.dmig;
  });

  it('idle → running → done', async () => {
    vi.mocked(window.dmig.runDryRun).mockResolvedValue({
      ok: true,
      data: {
        findings: [],
        startedAt: 't0',
        finishedAt: 't1',
        warnings: [],
      },
    });

    const { result } = renderHook(() => useDryRun());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.run({
        mode: 'export-pack',
        outputDir: '/out',
        imageNames: ['a'],
      });
    });

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.result?.findings).toEqual([]);
  });

  it('error 遷移', async () => {
    vi.mocked(window.dmig.runDryRun).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: '失敗' },
    });

    const { result } = renderHook(() => useDryRun());
    await act(async () => {
      await result.current.run({ mode: 'compose-project' });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('失敗');
  });

  it('reset で idle に戻る', async () => {
    vi.mocked(window.dmig.runDryRun).mockResolvedValue({
      ok: true,
      data: { findings: [], startedAt: '', finishedAt: '', warnings: [] },
    });
    const { result } = renderHook(() => useDryRun());
    await act(async () => {
      await result.current.run({ mode: 'export-pack', packageDir: '/p' });
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
  });
});
