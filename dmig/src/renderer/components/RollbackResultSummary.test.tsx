import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RollbackResultSummary } from './RollbackResultSummary.js';

describe('RollbackResultSummary', () => {
  it('成功・スキップ・失敗がすべて 0 件のとき空状態メッセージ', () => {
    render(
      <RollbackResultSummary
        result={{ succeeded: [], skipped: [], failed: [], warnings: [] }}
      />,
    );
    expect(screen.getByText(/ロールバック対象が見つかりませんでした/)).toBeInTheDocument();
  });

  it('cancelled 時に中断メッセージを表示する', () => {
    render(
      <RollbackResultSummary
        result={{
          succeeded: ['a'],
          skipped: [],
          failed: [],
          warnings: [],
          cancelled: true,
        }}
      />,
    );
    expect(screen.getByText(/ロールバックは中断されました/)).toBeInTheDocument();
  });
});
