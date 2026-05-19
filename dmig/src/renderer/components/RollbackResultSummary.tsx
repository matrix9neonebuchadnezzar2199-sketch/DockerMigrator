import React from 'react';
import type { RunRollbackResult } from '../../shared/types.js';
import { countDirectoryNotEmptyWarnings } from '../hooks/useRollback.js';

export const RollbackResultSummary: React.FC<{ result: RunRollbackResult }> = ({ result }) => {
  const dirSkipped = countDirectoryNotEmptyWarnings(result.warnings);
  return (
    <div className="rollback-result-summary card">
      <p>
        成功: <strong>{result.succeeded.length}</strong> / スキップ:{' '}
        <strong>{result.skipped.length}</strong> / 失敗: <strong>{result.failed.length}</strong>
      </p>
      {dirSkipped > 0 ? (
        <p className="rollback-directory-warn" role="status">
          {dirSkipped} 件のディレクトリは中身があるため削除されませんでした。Compose Import
          直後は配置先にファイルが残るため、このスキップが既定動作です。不要なデータはホスト上で手動削除してください。
        </p>
      ) : null}
      {result.warnings.includes('already_executed') ? (
        <p className="rollback-warn">このパッケージは既にロールバック済みです。</p>
      ) : null}
      {result.failed.length > 0 ? (
        <ul className="rollback-failed-list">
          {result.failed.map((f) => (
            <li key={f.id}>
              {f.id}: {f.error}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
