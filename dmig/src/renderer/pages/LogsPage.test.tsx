import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogEntry } from '../hooks/useLogBuffer.js';
import { LogsPage } from './LogsPage.js';

vi.mock('../hooks/useLogBuffer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useLogBuffer.js')>();
  return {
    ...actual,
    useLogBuffer: vi.fn(),
  };
});

import { useLogBuffer } from '../hooks/useLogBuffer.js';

const mockUseLogBuffer = vi.mocked(useLogBuffer);

function sampleEntries(): LogEntry[] {
  return [
    {
      id: '1',
      timestamp: new Date('2026-05-19T10:00:00Z'),
      level: 'info',
      source: 'transfer',
      message: '書き込み中',
    },
    {
      id: '2',
      timestamp: new Date('2026-05-19T10:00:01Z'),
      level: 'error',
      source: 'scan',
      message: '検証エラー',
    },
  ];
}

describe('LogsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    const entries = sampleEntries();
    mockUseLogBuffer.mockReturnValue({
      entries,
      clear: vi.fn(),
      filter: ({ levels, query }) => {
        let list = entries;
        if (levels && levels.length > 0) {
          list = list.filter((e) => levels.includes(e.level));
        }
        if (query?.trim()) {
          const q = query.trim().toLowerCase();
          list = list.filter((e) => e.message.toLowerCase().includes(q));
        }
        return list;
      },
    });
  });

  it('バッファ上限を LOG_BUFFER_MAX で表示', () => {
    render(<LogsPage />);
    expect(screen.getByText(/1,000 件/)).toBeInTheDocument();
  });

  it('ログ一覧を表示する', () => {
    render(<LogsPage />);
    expect(screen.getByRole('log', { name: '操作ログ' })).toBeInTheDocument();
    expect(screen.getByText('書き込み中')).toBeInTheDocument();
    expect(screen.getByText('検証エラー')).toBeInTheDocument();
  });

  it('検索で絞り込む', async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.type(screen.getByRole('searchbox', { name: 'ログ検索' }), '検証');
    expect(screen.getByText('検証エラー')).toBeInTheDocument();
    expect(screen.queryByText('書き込み中')).not.toBeInTheDocument();
  });

  it('フィルタで info を外すと info 行が消える', async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(screen.getByRole('checkbox', { name: /info/i }));
    expect(screen.queryByText('書き込み中')).not.toBeInTheDocument();
    expect(screen.getByText('検証エラー')).toBeInTheDocument();
  });

  it('空結果メッセージ', async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.type(screen.getByRole('searchbox', { name: 'ログ検索' }), '存在しない語');
    expect(screen.getByText('表示するログがありません。')).toBeInTheDocument();
  });
});
