import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DmigAPI } from '../../preload/index.js';
import { useWelcomeWizard } from './useWelcomeWizard.js';

function makeDmigMock(overrides: Partial<DmigAPI> = {}): DmigAPI {
  return {
    getSettings: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    updateSettings: vi.fn().mockResolvedValue({
      ok: true,
      data: { welcomeWizardCompleted: true, welcomeWizardLastShownAt: '2026-05-19T00:00:00.000Z' },
    }),
    ...overrides,
  } as DmigAPI;
}

describe('useWelcomeWizard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('welcomeWizardCompleted: false → checkAndMaybeOpen 後 open', async () => {
    window.dmig = makeDmigMock({
      getSettings: vi.fn().mockResolvedValue({
        ok: true,
        data: { welcomeWizardCompleted: false },
      }),
    });
    const { result } = renderHook(() => useWelcomeWizard());
    await act(async () => {
      await result.current.checkAndMaybeOpen();
    });
    expect(result.current.open).toBe(true);
  });

  it('welcomeWizardCompleted: true → open のまま false', async () => {
    window.dmig = makeDmigMock({
      getSettings: vi.fn().mockResolvedValue({
        ok: true,
        data: { welcomeWizardCompleted: true },
      }),
    });
    const { result } = renderHook(() => useWelcomeWizard());
    await act(async () => {
      await result.current.checkAndMaybeOpen();
    });
    expect(result.current.open).toBe(false);
  });

  it('welcomeWizardCompleted: undefined → open true', async () => {
    window.dmig = makeDmigMock({
      getSettings: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    });
    const { result } = renderHook(() => useWelcomeWizard());
    await act(async () => {
      await result.current.checkAndMaybeOpen();
    });
    expect(result.current.open).toBe(true);
  });

  it('getSettings ok:false → open false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.dmig = makeDmigMock({
      getSettings: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'E9001', message: 'fail' },
      }),
    });
    const { result } = renderHook(() => useWelcomeWizard());
    await act(async () => {
      await result.current.checkAndMaybeOpen();
    });
    expect(result.current.open).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('completeAndClose → updateSettings と open false', async () => {
    const updateSettings = vi.fn().mockResolvedValue({
      ok: true,
      data: { welcomeWizardCompleted: true },
    });
    window.dmig = makeDmigMock({ updateSettings });
    const { result } = renderHook(() => useWelcomeWizard());
    await act(async () => {
      result.current.forceOpen();
    });
    expect(result.current.open).toBe(true);
    await act(async () => {
      await result.current.completeAndClose();
    });
    await waitFor(() => expect(result.current.open).toBe(false));
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        welcomeWizardCompleted: true,
        welcomeWizardLastShownAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
  });

  it('forceOpen → open true、updateSettings は呼ばれない', async () => {
    const updateSettings = vi.fn();
    window.dmig = makeDmigMock({ updateSettings });
    const { result } = renderHook(() => useWelcomeWizard());
    act(() => {
      result.current.forceOpen();
    });
    expect(result.current.open).toBe(true);
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
