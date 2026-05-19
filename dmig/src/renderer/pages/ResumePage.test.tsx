import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DmigAPI } from '../../preload/index.js';
import type { ProbeSummary } from '../../shared/types.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { ResumePage } from './ResumePage.js';

function partialSummary(over: Partial<ProbeSummary> = {}): ProbeSummary {
  return {
    packageDir: 'C:\\usb\\pack-a.dmig',
    status: 'ok_partial',
    manifestPresent: true,
    pendingChunkCount: 2,
    lastUpdatedAt: '2026-01-02T00:00:00.000Z',
    interruptionReason: 'user-cancel',
    ...over,
  };
}

function makeDmigMock(overrides: Partial<DmigAPI> = {}): DmigAPI {
  return {
    ping: vi.fn(),
    listImages: vi.fn(),
    exportImages: vi.fn(),
    importImages: vi.fn(),
    readManifest: vi.fn(),
    probePackage: vi.fn(),
    resumeExport: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
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
    ...overrides,
  } as DmigAPI;
}

describe('ResumePage', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000099' });
  });

  afterEach(() => {
    cleanup();
  });

  function mountWithDmig(overrides: Partial<DmigAPI> = {}) {
    window.dmig = makeDmigMock(overrides);
    return renderWithProviders(<ResumePage />);
  }

  it('空配列 → 空状態文言', async () => {
    mountWithDmig({
      selectDirectory: vi.fn().mockResolvedValue({ ok: true, data: 'C:\\scan' }),
      listResumablePackages: vi.fn().mockResolvedValue({
        ok: true,
        data: { packages: [], warnings: [] },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'フォルダを選んで探す' }));

    await waitFor(() => {
      expect(screen.getByText('このフォルダに中断中のパックはありません。')).toBeInTheDocument();
    });
  });

  it('2 件返却 → カード2枚と翻訳表示', async () => {
    const pkgs = [
      partialSummary({ packageDir: 'C:\\a.dmig', pendingChunkCount: 1, interruptionReason: 'error' }),
      partialSummary({ packageDir: 'C:\\b.dmig', pendingChunkCount: 3, interruptionReason: 'user-cancel' }),
    ];
    mountWithDmig({
      selectDirectory: vi.fn().mockResolvedValue({ ok: true, data: 'C:\\scan' }),
      listResumablePackages: vi.fn().mockResolvedValue({ ok: true, data: { packages: pkgs, warnings: [] } }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'フォルダを選んで探す' }));

    await waitFor(() => {
      expect(screen.getByText('a.dmig')).toBeInTheDocument();
      expect(screen.getByText('b.dmig')).toBeInTheDocument();
      expect(screen.getByText('エラーで中断')).toBeInTheDocument();
      expect(screen.getByText('ユーザー操作で中止')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: '再開する' })).toHaveLength(2);
  });

  it('再開するクリック → ResumeConfirmDialog が開く', async () => {
    mountWithDmig({
      selectDirectory: vi.fn().mockResolvedValue({ ok: true, data: 'C:\\scan' }),
      listResumablePackages: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { packages: [partialSummary()], warnings: [] } }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'フォルダを選んで探す' }));
    await waitFor(() => screen.getByRole('button', { name: '再開する' }));
    await user.click(screen.getAllByRole('button', { name: '再開する' })[0]!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('パッケージが未完了です')).toBeInTheDocument();
  });

  it('ダイアログ確定 → resumeExport が jobToken 付きで呼ばれる', async () => {
    const resumeExport = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    mountWithDmig({
      selectDirectory: vi.fn().mockResolvedValue({ ok: true, data: 'C:\\scan' }),
      listResumablePackages: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { packages: [partialSummary()], warnings: [] } }),
      resumeExport,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'フォルダを選んで探す' }));
    await waitFor(() => screen.getAllByRole('button', { name: '再開する' }).length >= 1);
    await user.click(screen.getAllByRole('button', { name: '再開する' })[0]!);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '再開する' }));

    await waitFor(() => {
      expect(resumeExport).toHaveBeenCalledWith({
        packageDir: 'C:\\usb\\pack-a.dmig',
        jobToken: '00000000-0000-4000-8000-000000000099',
        compressionLevel: 3,
      });
    });
  });

  it('truncated_at_50 警告の翻訳', async () => {
    mountWithDmig({
      selectDirectory: vi.fn().mockResolvedValue({ ok: true, data: 'C:\\scan' }),
      listResumablePackages: vi.fn().mockResolvedValue({
        ok: true,
        data: { packages: [], warnings: ['truncated_at_50'] },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'フォルダを選んで探す' }));

    await waitFor(() => {
      expect(screen.getByText(/50件で打ち切りました/)).toBeInTheDocument();
    });
  });
});
