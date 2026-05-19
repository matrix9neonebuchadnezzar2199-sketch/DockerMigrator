import React, { useEffect } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DynamicCtaProvider, useDynamicCta } from '../context/DynamicCtaContext.js';
import type { PageKey } from '../App.js';
import { NextStepFooter } from './NextStepFooter.js';

function FooterWithDynamicCta({
  page,
  onNavigate,
  dockerConnected,
  dynamic,
}: {
  page: PageKey;
  onNavigate: (p: PageKey) => void;
  dockerConnected: boolean;
  dynamic: { label: string; targetPage: PageKey } | null;
}) {
  const { setDynamicCta } = useDynamicCta();
  useEffect(() => {
    setDynamicCta(dynamic);
    return () => setDynamicCta(null);
  }, [dynamic, setDynamicCta]);
  return <NextStepFooter page={page} onNavigate={onNavigate} dockerConnected={dockerConnected} />;
}

function renderFooter(ui: React.ReactElement) {
  return render(<DynamicCtaProvider>{ui}</DynamicCtaProvider>);
}

describe('NextStepFooter', () => {
  afterEach(() => cleanup());

  it('source-overview: 説明と CTA、クリックで compose', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderFooter(<NextStepFooter page="source-overview" onNavigate={onNavigate} dockerConnected />);
    expect(screen.getByRole('contentinfo', { name: '次にやること' })).toBeInTheDocument();
    expect(screen.getByText(/プロジェクト一覧を確認/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'プロジェクトを選ぶ' }));
    expect(onNavigate).toHaveBeenCalledWith('compose');
  });

  it('compose: CTA で export へ', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderFooter(<NextStepFooter page="compose" onNavigate={onNavigate} dockerConnected />);
    await user.click(screen.getByRole('button', { name: 'パックを書き出す' }));
    expect(onNavigate).toHaveBeenCalledWith('export');
  });

  it('export: 説明のみ、CTA ボタンなし', () => {
    renderFooter(<NextStepFooter page="export" onNavigate={vi.fn()} dockerConnected />);
    expect(screen.getByText(/USB/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('import: 説明のみ、CTA ボタンなし', () => {
    renderFooter(<NextStepFooter page="import" onNavigate={vi.fn()} dockerConnected />);
    expect(screen.getByText(/取り込みを実行/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('target-overview: CTA で import へ', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderFooter(<NextStepFooter page="target-overview" onNavigate={onNavigate} dockerConnected />);
    await user.click(screen.getByRole('button', { name: 'パックを読み込む' }));
    expect(onNavigate).toHaveBeenCalledWith('import');
  });

  it('resume: 説明のみ', () => {
    renderFooter(<NextStepFooter page="resume" onNavigate={vi.fn()} dockerConnected />);
    expect(screen.getByText(/中断したパック/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Docker 未接続: 接続案内のみ CTA なし', () => {
    renderFooter(<NextStepFooter page="source-overview" onNavigate={vi.fn()} dockerConnected={false} />);
    expect(screen.getByText(/Docker Desktop を起動/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('help: フッター非表示', () => {
    renderFooter(<NextStepFooter page="help" onNavigate={vi.fn()} dockerConnected />);
    expect(screen.queryByRole('contentinfo', { name: '次にやること' })).not.toBeInTheDocument();
  });

  it('export: 動的 CTA が静的より優先', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderFooter(
      <FooterWithDynamicCta
        page="export"
        onNavigate={onNavigate}
        dockerConnected
        dynamic={{ label: 'インポートへ進む', targetPage: 'import' }}
      />,
    );
    const btn = screen.getByRole('button', { name: /インポートへ進む/ });
    expect(btn.className).toContain('next-step-cta-dynamic');
    await user.click(btn);
    expect(onNavigate).toHaveBeenCalledWith('import');
  });

  it('export: 動的 CTA なし時は説明のみ', () => {
    renderFooter(
      <FooterWithDynamicCta page="export" onNavigate={vi.fn()} dockerConnected dynamic={null} />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
