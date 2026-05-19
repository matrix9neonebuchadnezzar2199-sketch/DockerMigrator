import React, { useMemo } from 'react';
import type { RollbackEntry, RollbackKind } from '../../shared/types.js';

function countByType(entries: RollbackEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

const TYPE_LABEL: Record<string, string> = {
  'docker-image': 'Docker イメージ',
  'docker-volume': 'Docker ボリューム',
  'docker-network': 'Docker ネットワーク',
  file: 'ファイル',
  directory: 'ディレクトリ',
};

export const RollbackConfirmDialog: React.FC<{
  packageDir: string;
  kind: RollbackKind;
  createdAt: string;
  entries: RollbackEntry[];
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ packageDir, kind, createdAt, entries, busy, onConfirm, onClose }) => {
  const byType = useMemo(() => countByType(entries), [entries]);
  const dirCount = byType.directory ?? 0;

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="rollback-dialog-title">
      <div className="dialog dialog-warning rollback-confirm-dialog">
        <div className="dialog-header" id="rollback-dialog-title">
          ロールバックの確認
        </div>
        <div className="dialog-body">
          <p className="dialog-intro">
            {kind === 'import'
              ? 'インポートで作成されたリソースを取り消します。'
              : 'エクスポートしたパックを削除します。'}
            この操作は元に戻せません。
          </p>
          <table className="guide-table" style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <th scope="row">パッケージ</th>
                <td><code>{packageDir}</code></td>
              </tr>
              <tr>
                <th scope="row">種別</th>
                <td>{kind === 'import' ? 'Import' : 'Export'}</td>
              </tr>
              <tr>
                <th scope="row">記録日時</th>
                <td>{createdAt}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <strong>取り消し対象（{entries.length} 件）</strong>
            <ul className="rollback-entry-breakdown">
              {Object.entries(byType).map(([type, count]) => (
                <li key={type} className={type === 'directory' ? 'rollback-entry-breakdown-warn' : undefined}>
                  {TYPE_LABEL[type] ?? type}: <strong>{count}</strong> 件
                  {type === 'directory' ? ' — ホスト上のファイルが削除される場合があります' : null}
                </li>
              ))}
            </ul>
            {dirCount > 0 ? (
              <p className="rollback-directory-warn" role="alert">
                ディレクトリ {dirCount} 件: 中身がある場合は削除されずスキップされます（手動確認推奨）。
              </p>
            ) : null}
          </div>
        </div>
        <div className="dialog-footer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? '実行中…' : 'ロールバック実行'}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>キャンセル</button>
        </div>
      </div>
    </div>
  );
};
