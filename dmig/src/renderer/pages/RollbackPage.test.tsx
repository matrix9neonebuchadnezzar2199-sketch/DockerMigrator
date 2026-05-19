import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DmigAPI } from '../../preload/index.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { RollbackPage } from './RollbackPage.js';

function makeDmigMock(overrides: Partial<DmigAPI> = {}): DmigAPI {
  return {
    ping: vi.fn(),
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
    runDryRun: vi.fn(),
    saveErrorReport: vi.fn(),
    listSnapshots: vi.fn(),
    deleteSnapshot: vi.fn(),
    computeDiff: vi.fn(),
    composeLifecycle: vi.fn(),
    pruneDanglingImages: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    listRollbacks: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        records: [
          {
            packageDir: 'C:\\usb\\pack.dmig',
            kind: 'import',
            createdAt: '2026-01-01T00:00:00.000Z',
            entryCount: 2,
            supported: true,
          },
        ],
        warnings: [],
      },
    }),
    runRollback: vi.fn().mockResolvedValue({
      ok: true,
      data: { succeeded: ['a'], skipped: [], failed: [], warnings: [] },
    }),
    loadRollbackRecord: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        schemaVersion: 1,
        kind: 'import',
        createdAt: '2026-01-01T00:00:00.000Z',
        packageDir: 'C:\\usb\\pack.dmig',
        entries: [{ id: 'img-001', type: 'docker-image', target: 'sha256:abc', hint: 'x:latest' }],
      },
    }),
    ...overrides,
  } as DmigAPI;
}

describe('RollbackPage', () => {
  afterEach(() => cleanup());

  it('スキャン後にパック一覧を表示', async () => {
    window.dmig = makeDmigMock({
      selectDirectory: vi.fn().mockResolvedValue({ ok: true, data: 'C:\\scan' }),
    });
    const user = userEvent.setup();
    renderWithProviders(<RollbackPage />);
    await user.click(screen.getByRole('button', { name: 'フォルダを選んで探す' }));
    await waitFor(() => {
      expect(screen.getByText('pack.dmig')).toBeInTheDocument();
    });
  });
});
