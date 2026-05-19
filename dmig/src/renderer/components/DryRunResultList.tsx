import React, { useMemo, useState } from 'react';
import type { DryRunFinding, DryRunSeverity } from '../../shared/types.js';

const ALL_SEVERITIES: DryRunSeverity[] = ['info', 'warn', 'error'];

export function formatDryRunFindingsTsv(findings: DryRunFinding[]): string {
  const header = 'severity\tcategory\ttarget\tmessage\thint';
  const rows = findings.map(
    (f) =>
      `${f.severity}\t${f.category}\t${f.target ?? ''}\t${f.message}\t${f.hint ?? ''}`,
  );
  return [header, ...rows].join('\n');
}

const SEVERITY_LABEL: Record<DryRunSeverity, string> = {
  info: '情報',
  warn: '警告',
  error: 'エラー',
};

export interface DryRunResultListProps {
  findings: DryRunFinding[];
  warnings?: string[];
}

export const DryRunResultList: React.FC<DryRunResultListProps> = ({
  findings,
  warnings = [],
}) => {
  const [levels, setLevels] = useState<Set<DryRunSeverity>>(new Set(ALL_SEVERITIES));
  const [query, setQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [expandedHints, setExpandedHints] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter((f) => {
      if (!levels.has(f.severity)) {
        return false;
      }
      if (!q) {
        return true;
      }
      const hay = `${f.category} ${f.target ?? ''} ${f.message} ${f.hint ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [findings, levels, query]);

  const toggleLevel = (level: DryRunSeverity) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const toggleHint = (id: string) => {
    setExpandedHints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatDryRunFindingsTsv(visible));
      setCopyStatus('コピーしました');
    } catch {
      setCopyStatus('コピーに失敗しました');
    }
    window.setTimeout(() => setCopyStatus(null), 2000);
  };

  return (
    <div className="dryrun-result-root">
      {warnings.length > 0 ? (
        <ul className="dryrun-warnings" aria-label="検査警告">
          {warnings.map((w, i) => (
            <li key={`${i}-${w}`}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="dryrun-toolbar card">
        <div className="dryrun-level-filters" role="group" aria-label="重大度フィルタ">
          {ALL_SEVERITIES.map((level) => (
            <label key={level} className="dryrun-level-label">
              <input
                type="checkbox"
                checked={levels.has(level)}
                onChange={() => toggleLevel(level)}
              />
              {SEVERITY_LABEL[level]}
            </label>
          ))}
        </div>
        <input
          type="search"
          className="dryrun-search"
          placeholder="検索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="結果検索"
        />
        <button type="button" onClick={() => void onCopy()} disabled={visible.length === 0}>
          TSV コピー
        </button>
        {copyStatus ? <span className="dryrun-copy-status">{copyStatus}</span> : null}
      </div>

      <div className="dryrun-list card" role="list" aria-label="ドライラン結果">
        {visible.length === 0 ? (
          <p className="dryrun-empty">
            {findings.length === 0
              ? '検出された問題はありません'
              : 'フィルタに一致する結果がありません'}
          </p>
        ) : (
          visible.map((f) => (
            <div
              key={f.id}
              className={`dryrun-finding dryrun-finding-${f.severity}`}
              role="listitem"
            >
              <span className={`dryrun-finding-badge dryrun-badge-${f.severity}`}>
                {SEVERITY_LABEL[f.severity]}
              </span>
              <span className="dryrun-finding-category">{f.category}</span>
              {f.target ? <span className="dryrun-finding-target">{f.target}</span> : null}
              <span className="dryrun-finding-message">— {f.message}</span>
              {f.hint ? (
                <div className="dryrun-finding-hint-wrap">
                  <button
                    type="button"
                    className="dryrun-hint-toggle"
                    onClick={() => toggleHint(f.id)}
                    aria-expanded={expandedHints.has(f.id)}
                  >
                    補足
                  </button>
                  {expandedHints.has(f.id) ? (
                    <p className="dryrun-finding-hint">{f.hint}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
};