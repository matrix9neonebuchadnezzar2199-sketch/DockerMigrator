import React, { useState } from 'react';
import type { DmigErrorPayload, RollbackRecord, RollbackSummary } from '../../shared/types.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { RollbackConfirmDialog } from '../components/RollbackConfirmDialog.js';
import { RollbackResultSummary } from '../components/RollbackResultSummary.js';
import { useJobLock } from '../context/JobLockContext.js';
import { useRollback } from '../hooks/useRollback.js';

function dirBasename(packageDir: string): string {
  const norm = packageDir.replace(/[/\\]+$/, '');
  const i = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  return i >= 0 ? norm.slice(i + 1) : norm;
}

function kindLabel(kind: RollbackSummary['kind']): string {
  return kind === 'import' ? 'Import' : 'Export';
}

export const RollbackPage: React.FC = () => {
  const [rootDir, setRootDir] = useState('');
  const [scanned, setScanned] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RollbackRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ipcError, setIpcError] = useState<DmigErrorPayload | null>(null);

  const { tryBegin, end, blockedMessage } = useJobLock();
  const {
    status,
    records,
    listWarnings,
    lastResult,
    error,
    wasAlreadyExecuted,
    listRecords,
    runRollback,
    reset,
  } = useRollback();

  const scanning = status === 'loading';
  const running = status === 'running';

  const pickFolderAndScan = async () => {
    setIpcError(null);
    reset();
    try {
      const picked = await window.dmig.selectDirectory({
        title: 'ロールバック対象を探すフォルダを選択',
        defaultPath: rootDir || undefined,
      });
      if (!picked.ok) {
        setIpcError(picked.error);
        return;
      }
      if (!picked.data) {
        return;
      }
      setRootDir(picked.data);
      setScanned(false);
      await listRecords({ rootDir: picked.data, maxDepth: 2 });
    } finally {
      setScanned(true);
    }
  };

  const openRollbackDialog = async (summary: RollbackSummary) => {
    if (!summary.supported || summary.executedAt) {
      return;
    }
    setIpcError(null);
    reset();
    const r = await window.dmig.loadRollbackRecord(summary.packageDir);
    if (!r.ok) {
      setIpcError(r.error);
      return;
    }
    if (!r.data) {
      return;
    }
    setSelectedRecord(r.data);
    setDialogOpen(true);
  };

  const onConfirmRollback = async () => {
    if (!selectedRecord) {
      return;
    }
    if (!tryBegin('rollback')) {
      return;
    }
    let r;
    try {
      r = await runRollback(selectedRecord.packageDir);
    } finally {
      end('rollback');
    }
    if (!r.ok) {
      return;
    }
    setDialogOpen(false);
    if (rootDir) {
      await listRecords({ rootDir, maxDepth: 2 });
    }
    const refreshed = await window.dmig.loadRollbackRecord(selectedRecord.packageDir);
    if (refreshed.ok) {
      setSelectedRecord(refreshed.data);
    }
  };

  const supportedRecords = records.filter((r) => r.supported && !r.executedAt);

  return (
    <div className="page-shell rollback-page">
      <h2>ロールバック</h2>
      <p className="page-lead">
        直近のインポート・エクスポートを取り消します。Compose インポートで作成したディレクトリは、空の場合のみ削除されます。
      </p>

      <div className="card">
        <button type="button" onClick={() => void pickFolderAndScan()} disabled={scanning || running}>
          {scanning ? '検索中…' : 'フォルダを選んで探す'}
        </button>
        {rootDir ? (
          <p className="rollback-scan-root">
            検索先: <code>{rootDir}</code>
          </p>
        ) : null}
      </div>

      {listWarnings.length > 0 ? (
        <div className="card rollback-warnings">
          <p>スキャン時の注意 ({listWarnings.length} 件)</p>
          <ul>
            {listWarnings.map((w) => (
              <li key={w}>
                <code>{w}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scanned && !scanning && records.length === 0 ? (
        <div className="card rollback-empty">
          このフォルダに .dmig パック（manifest.json）は見つかりませんでした。
        </div>
      ) : null}
      {scanned && !scanning && records.length > 0 && supportedRecords.length === 0 ? (
        <p className="rollback-warn card">
          ロールバック可能なパックはありません（M10 以前・実行済み・非対応）。下の一覧で状態を確認してください。
        </p>
      ) : null}

      {records.map((summary) => (
        <div className="card rollback-package-card" key={summary.packageDir}>
          <div className="rollback-package-title">
            <strong>{dirBasename(summary.packageDir)}</strong>
            <span className={`rollback-kind-badge rollback-kind-${summary.kind}`}>
              {kindLabel(summary.kind)}
            </span>
          </div>
          <div className="rollback-package-path">{summary.packageDir}</div>
          {!summary.supported ? (
            <p className="rollback-unsupported">M10 以前のパック（rollback.json なし）</p>
          ) : null}
          {summary.executedAt ? (
            <p className="rollback-warn">ロールバック済み: {summary.executedAt}</p>
          ) : null}
          {summary.supported ? (
            <table className="guide-table rollback-meta-table">
              <tbody>
                <tr>
                  <th scope="row">記録日時</th>
                  <td>{summary.createdAt || '—'}</td>
                </tr>
                <tr>
                  <th scope="row">エントリ数</th>
                  <td>{summary.entryCount}</td>
                </tr>
              </tbody>
            </table>
          ) : null}
          <button
            type="button"
            className="btn-danger"
            style={{ marginTop: 12 }}
            onClick={() => void openRollbackDialog(summary)}
            disabled={!summary.supported || Boolean(summary.executedAt) || running}
          >
            ロールバック…
          </button>
        </div>
      ))}

      {blockedMessage ? (
        <p className="rollback-warn card" role="status">
          {blockedMessage}
        </p>
      ) : null}
      <ErrorBox error={ipcError ?? (error ? { code: 'ROLLBACK', message: error } : null)} />
      {lastResult ? (
        <RollbackResultSummary result={lastResult} wasAlreadyExecuted={wasAlreadyExecuted} />
      ) : null}

      {dialogOpen && selectedRecord ? (
        <RollbackConfirmDialog
          packageDir={selectedRecord.packageDir}
          kind={selectedRecord.kind}
          createdAt={selectedRecord.createdAt}
          entries={selectedRecord.entries}
          busy={running}
          errorMessage={error}
          onConfirm={() => void onConfirmRollback()}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </div>
  );
};
