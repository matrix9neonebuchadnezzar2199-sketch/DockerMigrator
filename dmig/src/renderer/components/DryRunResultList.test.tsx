import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DryRunFinding } from '../../shared/types.js';
import { DryRunResultList, formatDryRunFindingsTsv } from './DryRunResultList.js';

const SAMPLE: DryRunFinding[] = [
  {
    id: '1',
    severity: 'error',
    category: 'capacity',
    message: '容量不足',
    target: '/out',
  },
  {
    id: '2',
    severity: 'info',
    category: 'bind-mount',
    message: 'bind info',
    target: 'app/web',
  },
  {
    id: '3',
    severity: 'warn',
    category: 'secret',
    message: 'secret warn',
  },
];

describe('DryRunResultList', () => {
  afterEach(() => cleanup());

  it('空結果で「検出された問題はありません」', () => {
    render(<DryRunResultList findings={[]} />);
    expect(screen.getByText('検出された問題はありません')).toBeInTheDocument();
  });

  it('重大度フィルタで error のみ表示', async () => {
    const user = userEvent.setup();
    render(<DryRunResultList findings={SAMPLE} />);
    const group = screen.getByRole('group', { name: '重大度フィルタ' });
    await user.click(within(group).getByLabelText('情報'));
    await user.click(within(group).getByLabelText('警告'));
    expect(screen.getByText(/容量不足/)).toBeInTheDocument();
    expect(screen.queryByText(/bind info/)).not.toBeInTheDocument();
  });

  it('検索で絞り込み', async () => {
    const user = userEvent.setup();
    render(<DryRunResultList findings={SAMPLE} />);
    await user.type(screen.getByLabelText('結果検索'), 'bind');
    expect(screen.getByText(/bind info/)).toBeInTheDocument();
    expect(screen.queryByText(/容量不足/)).not.toBeInTheDocument();
  });

  it('TSV コピー', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    render(<DryRunResultList findings={SAMPLE} />);
    await user.click(screen.getByRole('button', { name: 'TSV コピー' }));
    expect(writeText).toHaveBeenCalledWith(formatDryRunFindingsTsv(SAMPLE));
    vi.unstubAllGlobals();
  });
});
