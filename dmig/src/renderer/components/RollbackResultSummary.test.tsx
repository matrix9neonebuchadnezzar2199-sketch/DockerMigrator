import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RollbackResultSummary } from './RollbackResultSummary.js';

describe('RollbackResultSummary', () => {
  afterEach(() => cleanup());

  it('wasAlreadyExecuted でメッセージを表示', () => {
    render(
      <RollbackResultSummary
        result={{ succeeded: [], skipped: [], failed: [], warnings: [] }}
        wasAlreadyExecuted
      />,
    );
    expect(screen.getByText(/既にロールバック済みです/)).toBeInTheDocument();
  });

  it('directory_not_empty 件数を表示', () => {
    render(
      <RollbackResultSummary
        result={{
          succeeded: [],
          skipped: ['dir-001'],
          failed: [],
          warnings: ['directory_not_empty:dir-001', 'directory_not_empty:dir-002'],
        }}
      />,
    );
    expect(screen.getByText(/2 件のディレクトリは中身があるため削除されませんでした/)).toBeInTheDocument();
    expect(screen.getByText(/Compose Import 直後は配置先にファイルが残る/)).toBeInTheDocument();
  });
});
