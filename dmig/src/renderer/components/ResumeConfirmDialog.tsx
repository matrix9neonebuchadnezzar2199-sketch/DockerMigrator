import React from 'react';
import type { ProbeSummary, ProgressEvent } from '../../shared/types.js';
import { ProgressBar } from './ProgressBar.js';

/**
 * 中断パッケージ (`ok_partial`) のエクスポート再開確認。
 *
 * 実行中は `window.dmig.cancel(jobToken)` のみがジョブ中止。ダイアログを閉じる操作とは分離する。
 */
export const ResumeConfirmDialog: React.FC<{
  summary: ProbeSummary;
  /** 再開 IPC 実行中 */
  busy: boolean;
  /** 再開中の進捗（任意） */
  progress: ProgressEvent | null;
  jobToken: string | null;
  onConfirmResume: () => void;
  /** 未実行時: ダイアログを閉じる */
  onClose: () => void;
  /** 実行中: Main 側ジョブを中止 */
  onCancelJob: () => void;
}> = ({ summary, busy, progress, jobToken, onConfirmResume, onClose, onCancelJob }) => {
  const reasonLabel =
    summary.interruptionReason === 'user-cancel'
      ? 'ユーザー中止'
      : summary.interruptionReason === 'error'
        ? 'エラー'
        : summary.interruptionReason === 'crash'
          ? '異常終了'
          : '不明';

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-dialog-title">
      <div className="dialog dialog-warning">
        <div className="dialog-header" id="resume-dialog-title">
          <span style={{ fontSize: 20 }}>⏸</span>
          パッケージが未完了です
        </div>
        <div className="dialog-body">
          <p className="dialog-intro">
            このパッケージはエクスポートが途中までです。同じ端末上でエクスポートを再開できます。
            完了後、再度「読み込み」からマニフェストを確認してからインポートに進んでください。
          </p>
          <table className="guide-table" style={{ marginTop: 8 }}>
            <tbody>
              <tr>
                <th scope="row">中断理由</th>
                <td>{reasonLabel}</td>
              </tr>
              <tr>
                <th scope="row">未完了チャンク数</th>
                <td>
                  <strong>{summary.pendingChunkCount}</strong>
                </td>
              </tr>
              {summary.lastUpdatedAt && (
                <tr>
                  <th scope="row">最終更新</th>
                  <td>{summary.lastUpdatedAt}</td>
                </tr>
              )}
            </tbody>
          </table>
          {summary.pendingChunksPreview && summary.pendingChunksPreview.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <strong>先頭プレビュー</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>
                {summary.pendingChunksPreview.map((c, i) => (
                  <li key={`${c.contentKind}-${c.contentId}-${c.chunkIndex}-${i}`}>
                    <code>
                      {c.contentKind}:{c.contentId} #{c.chunkIndex}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {busy && (
            <div style={{ marginTop: 12 }}>
              <ProgressBar variant="inline" progress={progress} />
            </div>
          )}
        </div>
        <div className="dialog-footer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!busy ? (
            <>
              <button type="button" className="btn-primary" onClick={onConfirmResume}>
                再開する
              </button>
              <button type="button" onClick={onClose}>
                閉じる
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled>
                閉じる（実行中）
              </button>
              {jobToken && (
                <button type="button" className="btn-danger" onClick={onCancelJob}>
                  中止（ジョブ取消）
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
