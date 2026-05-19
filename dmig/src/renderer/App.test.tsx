import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DmigAPI } from '../preload/index.js';
import { App } from './App.js';

function makeDmigMock(overrides: Partial<DmigAPI> = {}): DmigAPI {
  return {
    ping: vi.fn().mockResolvedValue({ ok: true, data: { version: '24.0' } }),
    getSettings: vi.fn().mockResolvedValue({
      ok: true,
      data: { welcomeWizardCompleted: false },
    }),
    updateSettings: vi.fn().mockResolvedValue({
      ok: true,
      data: { welcomeWizardCompleted: true },
    }),
    listImages: vi.fn(),
    exportImages: vi.fn(),
    importImages: vi.fn(),
    readManifest: vi.fn(),
    probePackage: vi.fn(),
    resumeExport: vi.fn(),
    listResumablePackages: vi.fn(),
    onProgress: vi.fn(() => () => {}),
    listComposeProjects: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listVolumes: vi.fn(),
    scanSecrets: vi.fn(),
    exportCompose: vi.fn(),
    importCompose: vi.fn(),
    selectDirectory: vi.fn(),
    cancel: vi.fn(),
    preflight: vi.fn(),
    saveErrorReport: vi.fn(),
    listSnapshots: vi.fn(),
    deleteSnapshot: vi.fn(),
    computeDiff: vi.fn(),
    composeLifecycle: vi.fn(),
    pruneDanglingImages: vi.fn(),
    ...overrides,
  } as DmigAPI;
}

describe('App welcome wizard', () => {
  afterEach(() => cleanup());

  it('初回起動: welcomeWizardCompleted false → ウィザード表示', async () => {
    window.dmig = makeDmigMock();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'DockerMigrator へようこそ' })).toBeInTheDocument();
  });

  it('2 回目相当: welcomeWizardCompleted true → ウィザード非表示', async () => {
    window.dmig = makeDmigMock({
      getSettings: vi.fn().mockResolvedValue({
        ok: true,
        data: { welcomeWizardCompleted: true },
      }),
    });
    render(<App />);
    await waitFor(() => {
      expect(window.dmig.ping).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('移行元選択 → compose ページが表示される', async () => {
    const user = userEvent.setup();
    window.dmig = makeDmigMock();
    render(<App />);
    await waitFor(() => screen.getByRole('dialog'));
    await user.click(screen.getByRole('button', { name: /移行元の作業をする/ }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    expect(within(nav).getByRole('button', { name: 'プロジェクトを選ぶ' }).closest('.nav-item')).toHaveClass(
      'active',
    );
  });

  it('移行先選択 → import ページが表示される', async () => {
    const user = userEvent.setup();
    window.dmig = makeDmigMock();
    render(<App />);
    await waitFor(() => screen.getByRole('dialog'));
    await user.click(screen.getByRole('button', { name: /移行先の作業をする/ }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    expect(within(nav).getByRole('button', { name: 'パックを読み込む' }).closest('.nav-item')).toHaveClass(
      'active',
    );
  });
});
