import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DmigAPI } from '../../preload/index.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { ExportPage } from './ExportPage.js';

function makeDmigMock(overrides: Partial<DmigAPI> = {}): DmigAPI {
  return {
    ping: vi.fn(),
    listImages: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ id: '1', repoTags: ['alpine:latest'], size: 1024, created: 0 }],
    }),
    exportImages: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        packDir: 'E:\\out\\pack.dmig',
        manifest: { contents: { images: [{ name: 'alpine:latest' }] }, totalSize: 1024 },
      },
    }),
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
    runDryRun: vi.fn(),
    saveErrorReport: vi.fn(),
    listSnapshots: vi.fn(),
    deleteSnapshot: vi.fn(),
    computeDiff: vi.fn(),
    composeLifecycle: vi.fn(),
    pruneDanglingImages: vi.fn(),
    listRollbacks: vi.fn().mockResolvedValue({ ok: true, data: { records: [], warnings: [] } }),
    runRollback: vi.fn(),
    loadRollbackRecord: vi.fn().mockResolvedValue({ ok: true, data: null }),
    getSettings: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    saveSettings: vi.fn(),
    ...overrides,
  } as DmigAPI;
}

describe('ExportPage B-37', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000099' });
    window.dmig = makeDmigMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('完了後はエクスポート開始ボタンを非表示にする', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportPage />);

    await waitFor(() => {
      expect(screen.queryByText(/一覧を取得しています/)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('image-export-start'));

    await waitFor(() => {
      expect(screen.getByText(/件のイメージを書き出しました/)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('image-export-start')).not.toBeInTheDocument();
    expect(screen.getByTestId('image-export-reset')).toBeInTheDocument();
  });

  it('新しい書き出しを開始でエクスポートボタンが再表示される', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('image-export-start'));

    await waitFor(() => {
      expect(screen.getByTestId('image-export-reset')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('image-export-reset'));

    expect(screen.getByTestId('image-export-start')).toBeInTheDocument();
  });
});
