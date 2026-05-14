import React, { useState } from 'react';
import type { DmigErrorPayload } from '../../shared/types.js';

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

  return (
    <div className="error-box">
      <div className="code">
        [{error.code}] {error.message}
      </div>
      {error.detail && <div className="detail">詳細: {error.detail}</div>}
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
