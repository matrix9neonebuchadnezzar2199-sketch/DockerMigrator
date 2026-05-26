import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobLockProvider } from '../context/JobLockContext.js';
import { Sidebar } from './Sidebar.js';

function wrap(ui: React.ReactElement) {
  return <JobLockProvider>{ui}</JobLockProvider>;
}

describe('Sidebar', () => {
  afterEach(() => cleanup());

  it('3 グループヘッダが表示される', () => {
    render(wrap(<Sidebar page="compose" onChange={vi.fn()} dockerVersion="24.0" />));
    expect(screen.getByRole('heading', { name: /移行元での作業/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /移行先での作業/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /共通/ })).toBeInTheDocument();
  });

  it('中断したパックを再開をクリックすると onChange(resume) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />));
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: '中断したパックを再開' }));
    expect(onChange).toHaveBeenCalledWith('resume');
  });

  it('移行元グループの概要クリックで onChange(source-overview)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />));
    const overviewButtons = screen.getAllByRole('button', { name: '概要' });
    await user.click(overviewButtons[0]!);
    expect(onChange).toHaveBeenCalledWith('source-overview');
  });

  it('移行先グループの概要クリックで onChange(target-overview)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />));
    const overviewButtons = screen.getAllByRole('button', { name: '概要' });
    await user.click(overviewButtons[1]!);
    expect(onChange).toHaveBeenCalledWith('target-overview');
  });

  it('ドライランをクリックすると onChange(dryrun) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />));
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: 'ドライラン' }));
    expect(onChange).toHaveBeenCalledWith('dryrun');
  });

  it('ログをクリックすると onChange(logs) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />));
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: 'ログ' }));
    expect(onChange).toHaveBeenCalledWith('logs');
  });

  it('設定をクリックすると onChange(settings) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />));
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: '設定' }));
    expect(onChange).toHaveBeenCalledWith('settings');
  });

  it('ヘルプ / 用語集をクリックすると onChange(help) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<Sidebar page="compose" onChange={onChange} dockerVersion="24.0" />));
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    await user.click(within(nav).getByRole('button', { name: 'ヘルプ / 用語集' }));
    expect(onChange).toHaveBeenCalledWith('help');
  });

  it('Docker 再確認ボタンで onRetryDocker が呼ばれる', async () => {
    const user = userEvent.setup();
    const onRetryDocker = vi.fn();
    render(
      wrap(
        <Sidebar
          page="compose"
          onChange={vi.fn()}
          dockerVersion="24.0"
          onRetryDocker={onRetryDocker}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Docker 接続を再確認' }));
    expect(onRetryDocker).toHaveBeenCalledTimes(1);
  });

  it('旧ラベルがなく新ラベルが表示される', () => {
    render(wrap(<Sidebar page="export" onChange={vi.fn()} dockerVersion="24.0" />));
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' });
    expect(within(nav).getByRole('button', { name: 'パックを書き出す' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'パックを読み込む' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'プロジェクトを選ぶ' })).toBeInTheDocument();
    expect(screen.queryByText(/イメージ エクスポート/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Compose まるごと/)).not.toBeInTheDocument();
  });
});
