import React, { useState } from 'react';
import type { DmigErrorPayload } from '../../shared/types.js';
import { lookupErrorMessage } from '../lib/i18n/errorMessages.js';

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

function GenericErrorBody({ error }: { error: DmigErrorPayload }): React.ReactElement {
  const body = formatErrorBody(error);
  const isLong = body.length > COLLAPSE_THRESHOLD;

  if (isLong) {
    return (
      <details className="error-box-details">
        <summary className="code">
          [{error.code}] {error.message}
          <span className="error-box-expand-hint"> …全文を表示</span>
        </summary>
        <pre className="error-box-long">{body}</pre>
      </details>
    );
  }

  return (
    <>
      <div className="code">
        [{error.code}] {error.message}
      </div>
      {error.detail && <div className="detail">詳細: {error.detail}</div>}
      {error.phase && <div className="detail">フェーズ: {error.phase}</div>}
    </>
  );
}

function CodeSpecificErrorBody({
  error,
  entry,
}: {
  error: DmigErrorPayload;
  entry: NonNullable<ReturnType<typeof lookupErrorMessage>>;
}): React.ReactElement {
  return (
    <>
      <div className="error-box-title">{entry.title}</div>
      <p className="error-box-description">{entry.description}</p>
      <p className="error-box-suggestion">
        <strong>対処:</strong> {entry.suggestion}
      </p>
      <div className="error-box-code-ref code">[{error.code}]</div>
      {(error.detail || error.phase) && (
        <details className="error-box-details error-box-tech-details">
          <summary className="error-box-tech-summary">技術情報を表示</summary>
          {error.detail && <div className="detail">詳細: {error.detail}</div>}
          {error.phase && <div className="detail">フェーズ: {error.phase}</div>}
          <div className="detail">メッセージ: {error.message}</div>
        </details>
      )}
    </>
  );
}

/**
 * エラー表示ボックス。Phase 5.1 第3回: エラーレポート ZIP 保存。
 * UPDATE-04: 登録済み E コードはユーザー向け 3 段構成で表示。
 */
export const ErrorBox: React.FC<{
  error: DmigErrorPayload | null;
  lastAction?: string;
}> = ({ error, lastAction }) => {
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  if (!error) return null;

  const entry = lookupErrorMessage(error.code);

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
      {entry ? <CodeSpecificErrorBody error={error} entry={entry} /> : <GenericErrorBody error={error} />}
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
