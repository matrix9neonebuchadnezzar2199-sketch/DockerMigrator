import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HelpPage } from './HelpPage.js';

describe('HelpPage', () => {
  const scrollIntoViewMock = vi.fn();

  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    location.hash = '';
  });

  afterEach(() => {
    cleanup();
    location.hash = '';
  });

  it('初期表示: 使い方ガイドタブが選択され移行元セクションが見える', () => {
    render(<HelpPage />);
    const guideTab = screen.getByRole('tab', { name: '使い方ガイド' });
    expect(guideTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: '移行元での作業' })).toBeInTheDocument();
  });

  it('タブ切替: 用語集クリックで glossary リストが見える', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);
    await user.click(screen.getByRole('tab', { name: '用語集' }));
    expect(screen.getByRole('tab', { name: '用語集' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('manifest（manifest.json）')).toBeInTheDocument();
  });

  it('フィルタ: manifest 入力で manifest を含むエントリのみ', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);
    await user.click(screen.getByRole('tab', { name: '用語集' }));
    await user.type(screen.getByRole('searchbox', { name: '用語を検索' }), 'manifest');
    expect(screen.getByText('manifest（manifest.json）')).toBeInTheDocument();
    expect(screen.queryByText('Docker イメージ（repository:tag）')).not.toBeInTheDocument();
  });

  it('フィルタ空結果: 存在しない文字列で空状態メッセージ', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);
    await user.click(screen.getByRole('tab', { name: '用語集' }));
    await user.type(screen.getByRole('searchbox', { name: '用語を検索' }), 'zzzznotermzzzz');
    expect(screen.getByText('該当する用語がありません')).toBeInTheDocument();
  });

  it('hash: #partial-state で用語集タブと該当 article が DOM に存在', async () => {
    location.hash = '#partial-state';
    render(<HelpPage />);
    expect(screen.getByRole('tab', { name: '用語集' })).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById('partial-state')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('関連ページボタンで onNavigate が呼ばれる', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<HelpPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole('tab', { name: '用語集' }));
    const exportArticle = document.getElementById('export');
    expect(exportArticle).not.toBeNull();
    await user.click(
      within(exportArticle as HTMLElement).getByRole('button', {
        name: '関連ページ: パックを書き出す',
      }),
    );
    expect(onNavigate).toHaveBeenCalledWith('export');
  });
});
