import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TargetOverviewPage } from './TargetOverviewPage.js';

describe('TargetOverviewPage', () => {
  afterEach(() => cleanup());

  it('初期表示: 移行先での作業見出しとセクション・カードが見える', () => {
    render(<TargetOverviewPage onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /移行先での作業 — 概要/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'このグループでできること' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '作業の流れ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'このグループの作業ページ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /パックを読み込む/ })).toBeInTheDocument();
  });

  it('パックを読み込むカード → onNavigate(import)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TargetOverviewPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: 'このページを開く →' }));
    expect(onNavigate).toHaveBeenCalledWith('import');
  });
});
