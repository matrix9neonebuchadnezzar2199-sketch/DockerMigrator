import { describe, expect, it } from 'vitest';

import {
  appendLogEntry,
  filterLogEntries,
  inferLogLevel,
  LOG_BUFFER_MAX,
  progressEventToLogEntry,
  type LogEntry,
} from './useLogBuffer.js';

function entry(id: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): LogEntry {
  return {
    id,
    timestamp: new Date('2026-05-19T10:00:00Z'),
    level,
    source: 'transfer',
    message,
  };
}

describe('useLogBuffer helpers', () => {
  it('inferLogLevel: エラー文言は error', () => {
    expect(inferLogLevel('書き出しに失敗しました')).toBe('error');
    expect(inferLogLevel('通常の進捗')).toBe('info');
    expect(inferLogLevel('警告: 容量が少ない')).toBe('warn');
  });

  it('progressEventToLogEntry: scope を source に使う', () => {
    const log = progressEventToLogEntry({
      taskId: 't1',
      phase: 'write',
      scope: 'transfer',
      current: 1,
      total: 10,
      message: '書き込み中',
      percentage: 10,
    });
    expect(log.source).toBe('transfer');
    expect(log.message).toBe('書き込み中');
  });

  it('appendLogEntry: 1000 件超で FIFO', () => {
    let list: LogEntry[] = [];
    for (let i = 0; i < LOG_BUFFER_MAX + 5; i++) {
      list = appendLogEntry(list, entry(`e${i}`, `m${i}`));
    }
    expect(list).toHaveLength(LOG_BUFFER_MAX);
    expect(list[0]?.id).toBe('e5');
    expect(list[list.length - 1]?.id).toBe(`e${LOG_BUFFER_MAX + 4}`);
  });

  it('filterLogEntries: level と query', () => {
    const entries = [
      entry('1', 'alpha', 'info'),
      entry('2', 'beta error', 'error'),
      entry('3', 'gamma', 'warn'),
    ];
    expect(filterLogEntries(entries, { levels: ['error'] })).toHaveLength(1);
    expect(filterLogEntries(entries, { query: 'alpha' })).toHaveLength(1);
  });
});
