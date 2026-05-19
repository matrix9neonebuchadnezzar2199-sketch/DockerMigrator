import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NextStepFooter } from './NextStepFooter.js';

describe('NextStepFooter', () => {
  afterEach(() => cleanup());

  it('source-overview: 説明と CTA、クリックで compose', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NextStepFooter page="source-overview" onNavigate={onNavigate} />);
    expect(screen.getByRole('contentinfo', { name: '次にやること' })).toBeInTheDocument();
    expect(screen.getByText(/プロジェクト一覧を確認/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'プロジェクトを選ぶ' }));
    expect(onNavigate).toHaveBeenCalledWith('compose');
  });

  it('compose: CTA で export へ', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NextStepFooter page="compose" onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: 'パックを書き出す' }));
    expect(onNavigate).toHaveBeenCalledWith('export');
  });

  it('export: 説明のみ、CTA ボタンなし', () => {
    render(<NextStepFooter page="export" onNavigate={vi.fn()} />);
    expect(screen.getByText(/USB/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('import: 説明のみ、CTA ボタンなし', () => {
    render(<NextStepFooter page="import" onNavigate={vi.fn()} />);
    expect(screen.getByText(/取り込みを実行/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('target-overview: CTA で import へ', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NextStepFooter page="target-overview" onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: 'パックを読み込む' }));
    expect(onNavigate).toHaveBeenCalledWith('import');
  });

  it('resume: 説明のみ', () => {
    render(<NextStepFooter page="resume" onNavigate={vi.fn()} />);
    expect(screen.getByText(/中断したパック/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('help: フッター非表示', () => {
    render(<NextStepFooter page="help" onNavigate={vi.fn()} />);
    expect(screen.queryByRole('contentinfo', { name: '次にやること' })).not.toBeInTheDocument();
  });
});
