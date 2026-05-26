import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ProgressEvent } from '../../shared/types.js';

/** ログ FIFO の上限（LogsPage 表示とも共有）。 */
export const LOG_BUFFER_MAX = 1000;

/** @deprecated 互換 alias — 新規コードは LOG_BUFFER_MAX を使用 */
export const MAX_LOG_ENTRIES = LOG_BUFFER_MAX;

export type LogLevel = 'info' | 'warn' | 'error';

export type LogEntry = {
  id: string;
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
};

export type LogFilter = {
  levels?: LogLevel[];
  query?: string;
};

export function inferLogLevel(message: string): LogLevel {
  if (/エラー|失敗|error/i.test(message)) return 'error';
  if (/警告|warn/i.test(message)) return 'warn';
  return 'info';
}

export function progressEventToLogEntry(ev: ProgressEvent): LogEntry {
  return {
    id: `${ev.taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(),
    level: inferLogLevel(ev.message),
    source: ev.scope ?? ev.taskId,
    message: ev.message,
  };
}

export function appendLogEntry(
  entries: LogEntry[],
  entry: LogEntry,
  max: number = LOG_BUFFER_MAX,
): LogEntry[] {
  const next = [...entries, entry];
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

export function filterLogEntries(entries: LogEntry[], filter: LogFilter): LogEntry[] {
  const levels = filter.levels;
  const q = filter.query?.trim().toLowerCase();
  return entries.filter((e) => {
    if (levels && levels.length > 0 && !levels.includes(e.level)) return false;
    if (!q) return true;
    const hay = `${e.message} ${e.source} ${e.level}`.toLowerCase();
    return hay.includes(q);
  });
}

export function formatLogEntriesTsv(entries: LogEntry[]): string {
  return entries
    .map((e) => {
      const ts = e.timestamp.toISOString().replace('T', ' ').slice(0, 19);
      return `${ts}\t${e.level.toUpperCase()}\t${e.source}\t${e.message}`;
    })
    .join('\n');
}

type LogBufferContextValue = {
  entries: LogEntry[];
  clear: () => void;
  filter: (filter: LogFilter) => LogEntry[];
};

const LogBufferContext = createContext<LogBufferContextValue | null>(null);

export const LogBufferProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    return window.dmig.onProgress((ev) => {
      const entry = progressEventToLogEntry(ev);
      setEntries((prev) => appendLogEntry(prev, entry));
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const filter = useCallback((f: LogFilter) => filterLogEntries(entries, f), [entries]);

  const value = useMemo(() => ({ entries, clear, filter }), [entries, clear, filter]);

  return <LogBufferContext.Provider value={value}>{children}</LogBufferContext.Provider>;
};

export function useLogBuffer(): LogBufferContextValue {
  const ctx = useContext(LogBufferContext);
  if (!ctx) {
    throw new Error('useLogBuffer must be used within LogBufferProvider');
  }
  return ctx;
}
