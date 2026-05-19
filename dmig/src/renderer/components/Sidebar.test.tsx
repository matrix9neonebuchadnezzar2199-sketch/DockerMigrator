import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from './Sidebar.js';

describe('Sidebar', () => {
  afterEach(() => cleanup());

  it('3 グループヘッダが表示される', () => {
    render(<Sidebar page="compose" onChange={vi.fn()} dockerVersion="24.0" />);
    expect(screen.getByRole('heading', { name: /移行元での作業/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /移行先での作業/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /共通/ })).toBeInTheDocument();
  });

  it('中断したパックを再開をクリックすると onChange(resume) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />);
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: '中断したパックを再開' }));
    expect(onChange).toHaveBeenCalledWith('resume');
  });

  it('ヘルプ / 用語集をクリックすると onChange(help) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />);
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: 'ヘルプ / 用語集' }));
    expect(onChange).toHaveBeenCalledWith('help');
  });

  it('旧ラベルがなく新ラベルが表示される', () => {
    render(<Sidebar page="export" onChange={vi.fn()} dockerVersion="24.0" />);
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    expect(within(nav).getByRole('button', { name: 'パックを書き出す' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'パックを読み込む' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'プロジェクトを選ぶ' })).toBeInTheDocument();
    expect(screen.queryByText(/イメージ エクスポート/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Compose まるごと/)).not.toBeInTheDocument();
  });
});
