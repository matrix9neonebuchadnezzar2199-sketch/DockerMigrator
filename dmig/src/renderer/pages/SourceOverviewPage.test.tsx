import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceOverviewPage } from './SourceOverviewPage.js';

describe('SourceOverviewPage', () => {
  afterEach(() => cleanup());

  it('初期表示: 移行元での作業見出しと 3 セクションが見える', () => {
    render(<SourceOverviewPage onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /移行元での作業 — 概要/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'このグループでできること' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '作業の流れ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'このグループの作業ページ' })).toBeInTheDocument();
  });

  it('プロジェクトを選ぶカード → onNavigate(compose)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SourceOverviewPage onNavigate={onNavigate} />);
    const openButtons = screen.getAllByRole('button', { name: 'このページを開く →' });
    await user.click(openButtons[0]!);
    expect(onNavigate).toHaveBeenCalledWith('compose');
  });

  it('パックを書き出すカード → onNavigate(export)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SourceOverviewPage onNavigate={onNavigate} />);
    const openButtons = screen.getAllByRole('button', { name: 'このページを開く →' });
    await user.click(openButtons[1]!);
    expect(onNavigate).toHaveBeenCalledWith('export');
  });

  it('中断したパックを再開カード → onNavigate(resume)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SourceOverviewPage onNavigate={onNavigate} />);
    const openButtons = screen.getAllByRole('button', { name: 'このページを開く →' });
    await user.click(openButtons[2]!);
    expect(onNavigate).toHaveBeenCalledWith('resume');
  });
});
