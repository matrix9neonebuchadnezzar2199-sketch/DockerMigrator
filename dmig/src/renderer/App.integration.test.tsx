import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DmigAPI } from '../preload/index.js';
import { DEFAULT_DMIG_SETTINGS } from '../shared/settings.js';
import { App } from './App.js';

function makeDmigMock(): DmigAPI {
  return {
    ping: vi.fn().mockResolvedValue({ ok: true, data: { version: '24.0.0' } }),
    getSettings: vi.fn().mockResolvedValue({ ok: true, data: { ...DEFAULT_DMIG_SETTINGS } }),
    updateSettings: vi.fn().mockResolvedValue({ ok: true, data: { ...DEFAULT_DMIG_SETTINGS } }),
    listImages: vi.fn(),
    exportImages: vi.fn(),
    importImages: vi.fn(),
    readManifest: vi.fn(),
    probePackage: vi.fn(),
    resumeExport: vi.fn(),
    listResumablePackages: vi.fn(),
    onProgress: vi.fn(() => () => {}),
    listComposeProjects: vi.fn(),
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
  } as DmigAPI;
}

describe('App integration', () => {
  beforeEach(() => {
    window.dmig = makeDmigMock();
  });

  it('起動後に移行元概要とフッターが表示される', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /移行元での作業 — 概要/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('contentinfo', { name: '次にやること' })).toBeInTheDocument();
  });

  it('サイドバーから設定ページへ遷移できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: '設定' }));
    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument();
  });
});
