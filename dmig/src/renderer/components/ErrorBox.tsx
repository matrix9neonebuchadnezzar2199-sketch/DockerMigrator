import React, { useState } from 'react';
import type { DmigErrorPayload } from '../../shared/types.js';

const COLLAPSE_THRESHOLD = 400;

function formatErrorBody(error: DmigErrorPayload): string {
  const parts = [`[${error.code}] ${error.message}`];
  if (error.detail) {
    parts.push(`詳細: ${error.detail}`);
  }
  if (error.phase) {
    parts.push(`フェーズ: ${error.phase}`);
  }
  return parts.join('\n');
}

/**
 * エラー表示ボックス。Phase 5.1 第3回: エラーレポート ZIP 保存。
 */
export const ErrorBox: React.FC<{
  error: DmigErrorPayload | null;
  lastAction?: string;
}> = ({ error, lastAction }) => {
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  if (!error) return null;

  const onSaveReport = async () => {
    setSaving(true);
    setSavedPath(null);
    setReportError(null);
    try {
      const dir = await window.dmig.selectDirectory({
        title: 'エラーレポートの保存先を選択',
      });
      if (!dir.ok) {
        setReportError(`[${dir.error.code}] ${dir.error.message}`);
        return;
      }
      if (dir.data == null || dir.data === '') {
        return;
      }

      const r = await window.dmig.saveErrorReport({
        outputDir: dir.data,
        error,
        lastAction,
      });
      if (r.ok) {
        setSavedPath(r.data.zipPath);
      } else {
        setReportError(`[${r.error.code}] ${r.error.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const body = formatErrorBody(error);
  const isLong = body.length > COLLAPSE_THRESHOLD;

  return (
    <div className="error-box">
      {isLong ? (
        <details className="error-box-details">
          <summary className="code">
            [{error.code}] {error.message}
            <span className="error-box-expand-hint"> …全文を表示</span>
          </summary>
          <pre className="error-box-long">{body}</pre>
        </details>
      ) : (
        <>
          <div className="code">
            [{error.code}] {error.message}
          </div>
          {error.detail && <div className="detail">詳細: {error.detail}</div>}
        </>
      )}
      {reportError && (
        <div className="detail" style={{ marginTop: 6 }}>
          レポート保存: {reportError}
        </div>
      )}
      <div className="error-actions">
        <button type="button" className="btn-secondary" onClick={() => void onSaveReport()} disabled={saving}>
          {saving ? '保存中...' : 'エラー報告を保存'}
        </button>
        {savedPath && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#a6adc8' }}>保存しました: {savedPath}</span>
        )}
      </div>
    </div>
  );
};
