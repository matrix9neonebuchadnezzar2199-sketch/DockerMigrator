import React, { useMemo, useState } from 'react';
import type { LogLevel } from '../hooks/useLogBuffer.js';
import { formatLogEntriesTsv, LOG_BUFFER_MAX, useLogBuffer } from '../hooks/useLogBuffer.js';

const ALL_LEVELS: LogLevel[] = ['info', 'warn', 'error'];

function formatTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export const LogsPage: React.FC = () => {
  const { entries, clear, filter } = useLogBuffer();
  const [levels, setLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [query, setQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const visible = useMemo(
    () => filter({ levels: [...levels], query }),
    [filter, levels, query],
  );

  const toggleLevel = (level: LogLevel) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const onCopy = async () => {
    const text = formatLogEntriesTsv(visible);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('コピーしました');
    } catch {
      setCopyStatus('コピーに失敗しました');
    }
    window.setTimeout(() => setCopyStatus(null), 2000);
  };

  return (
    <div className="page-shell logs-page">
      <h2>ログ</h2>
      <p className="page-lead">
        進行中操作の進捗メッセージを表示します（最大 {entries.length > 0 ? `${entries.length} / ` : ''}
        {LOG_BUFFER_MAX.toLocaleString('ja-JP')} 件、超過分は古い順に破棄）。
      </p>

      <div className="logs-toolbar card">
        <div className="logs-level-filters" role="group" aria-label="ログレベル">
          {ALL_LEVELS.map((level) => (
            <label key={level} className="logs-level-label">
              <input
                type="checkbox"
                checked={levels.has(level)}
                onChange={() => toggleLevel(level)}
              />
              {level}
            </label>
          ))}
        </div>
        <input
          type="search"
          className="logs-search"
          placeholder="検索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="ログ検索"
        />
        <button type="button" onClick={() => void onCopy()} disabled={visible.length === 0}>
          コピー
        </button>
        <button type="button" onClick={clear} disabled={entries.length === 0}>
          クリア
        </button>
        {copyStatus ? <span className="logs-copy-status">{copyStatus}</span> : null}
      </div>

      <div className="logs-list card" role="log" aria-live="polite" aria-label="操作ログ">
        {visible.length === 0 ? (
          <p className="logs-empty">表示するログがありません。</p>
        ) : (
          <ul className="logs-entries">
            {visible.map((e) => (
              <li key={e.id} className={`logs-entry log-${e.level}`}>
                <span className="logs-time">{formatTime(e.timestamp)}</span>
                <span className="logs-level">{e.level}</span>
                <span className="logs-source">{e.source}</span>
                <span className="logs-message">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
