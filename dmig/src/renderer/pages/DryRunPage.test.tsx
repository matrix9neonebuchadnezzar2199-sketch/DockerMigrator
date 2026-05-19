import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DryRunPage } from './DryRunPage.js';

describe('DryRunPage', () => {
  beforeEach(() => {
    window.dmig = {
      ...window.dmig,
      listComposeProjects: vi.fn().mockResolvedValue({
        ok: true,
        data: [{ name: 'demo', configFiles: [], workingDir: '/w', services: [], volumeNames: [], bindMounts: [], envFiles: [], estimatedSize: 0 }],
      }),
      selectDirectory: vi.fn().mockResolvedValue({ ok: true, data: '/out' }),
      runDryRun: vi.fn().mockResolvedValue({
        ok: true,
        data: { findings: [], startedAt: '', finishedAt: '', warnings: [] },
      }),
    } as typeof window.dmig;
  });

  afterEach(() => cleanup());

  it('Compose モードでプロジェクト一覧が表示される', async () => {
    render(<DryRunPage />);
    expect(await screen.findByText('demo')).toBeInTheDocument();
  });

  it('モード切替で Export パック UI', async () => {
    const user = userEvent.setup();
    render(<DryRunPage />);
    await user.click(screen.getByLabelText('Export パック'));
    expect(screen.getByText(/既存パッケージ/)).toBeInTheDocument();
  });

  it('実行成功で空結果メッセージ', async () => {
    const user = userEvent.setup();
    render(<DryRunPage />);
    await screen.findByText('demo');
    const outInput = screen.getAllByRole('textbox')[0]!;
    await user.type(outInput, '/tmp/out');
    await user.click(screen.getByLabelText('demo'));
    await user.click(screen.getByRole('button', { name: 'ドライラン実行' }));
    expect(await screen.findByText('検出された問題はありません')).toBeInTheDocument();
    expect(window.dmig.runDryRun).toHaveBeenCalled();
  });

  it('IPC エラー表示', async () => {
    vi.mocked(window.dmig.runDryRun).mockResolvedValue({
      ok: false,
      error: { code: 'X', message: 'IPC 失敗' },
    });
    const user = userEvent.setup();
    render(<DryRunPage />);
    await screen.findByText('demo');
    await user.click(screen.getByLabelText('demo'));
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0]!, '/out');
    await user.click(screen.getByRole('button', { name: 'ドライラン実行' }));
    expect(await screen.findByText('IPC 失敗')).toBeInTheDocument();
  });
});
