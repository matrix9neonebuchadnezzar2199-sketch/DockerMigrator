import React from 'react';
import type { RunRollbackResult } from '../../shared/types.js';
import { countDirectoryNotEmptyWarnings } from '../hooks/useRollback.js';

export const RollbackResultSummary: React.FC<{
  result: RunRollbackResult;
  wasAlreadyExecuted?: boolean;
}> = ({ result, wasAlreadyExecuted = false }) => {
  const dirSkipped = countDirectoryNotEmptyWarnings(result.warnings);
  const showAlreadyExecuted =
    wasAlreadyExecuted || result.warnings.includes('already_executed');
  const isEmpty =
    result.succeeded.length === 0 &&
    result.skipped.length === 0 &&
    result.failed.length === 0 &&
    !showAlreadyExecuted &&
    !result.cancelled;

  return (
    <div className="rollback-result-summary card">
      {result.cancelled ? (
        <p className="rollback-warn" role="status">
          ロールバックは中断されました。ここまで処理された項目の結果を表示しています。
        </p>
      ) : null}
      {isEmpty ? (
        <p className="rollback-warn" role="status">
          ロールバック対象が見つかりませんでした。
        </p>
      ) : null}
      {showAlreadyExecuted ? (
        <p className="rollback-warn" role="status">
          このパックは既にロールバック済みです。新たに削除された項目はありません。
        </p>
      ) : null}
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
