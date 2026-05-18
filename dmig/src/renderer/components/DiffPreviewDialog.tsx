/**
 * Phase 6: 差分プレビュー表示ダイアログ。
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { DiffPreviewResult, DmigErrorPayload, DiffEntryKind } from '../../shared/types.js';

export interface DiffPreviewDialogProps {
  open: boolean;
  preview: DiffPreviewResult | null;
  loading: boolean;
  error: DmigErrorPayload | null;
  onConfirm: (excludedKeys: Set<string>) => void;
  onFallbackToFull: () => void;
  onCancel: () => void;
}

type TabId = 'images' | 'volumes' | 'compose';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function kindLabel(kind: DiffEntryKind): string {
  switch (kind) {
    case 'added':
      return '追加';
    case 'modified':
      return '変更';
    case 'removed':
      return '削除';
  }
}

export const DiffPreviewDialog: React.FC<DiffPreviewDialogProps> = ({
  open,
  preview,
  loading,
  error,
  onConfirm,
  onFallbackToFull,
  onCancel,
}) => {
  const [tab, setTab] = useState<TabId>('images');
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) {
      setExcluded(new Set());
      setTab('images');
    }
  }, [open]);

  const toggleExclude = (key: string): void => {
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExcluded(next);
  };

  const totalChanges = useMemo(() => {
    if (!preview) return 0;
    const { summary } = preview;
    return (
      summary.images.added +
      summary.images.modified +
      summary.volumes.added +
      summary.volumes.modified +
      summary.composeProjects.added +
      summary.composeProjects.modified
    );
  }, [preview]);

  if (!open) return null;

  return (
    <div className="diff-preview-dialog-overlay" role="dialog" aria-modal="true">
      <div className="diff-preview-dialog">
        <header className="diff-preview-header">
          <h2>差分エクスポート プレビュー</h2>
          <button type="button" className="dialog-close" onClick={onCancel} aria-label="閉じる">
            ×
          </button>
        </header>

        {loading && <div className="diff-loading">差分を計算中...</div>}

        {error && (
          <div className="diff-error">
            <strong>[{error.code}]</strong> {error.message}
          </div>
        )}

        {preview && !loading && (
          <>
            <div className="diff-preview-tabs">
              <button
                type="button"
                className={tab === 'images' ? 'active' : ''}
                onClick={() => setTab('images')}
              >
                イメージ (
                {preview.summary.images.added + preview.summary.images.modified + preview.summary.images.removed})
              </button>
              <button
                type="button"
                className={tab === 'volumes' ? 'active' : ''}
                onClick={() => setTab('volumes')}
              >
                ボリューム (
                {preview.summary.volumes.added + preview.summary.volumes.modified + preview.summary.volumes.removed})
              </button>
              <button
                type="button"
                className={tab === 'compose' ? 'active' : ''}
                onClick={() => setTab('compose')}
              >
                Compose (
                {preview.summary.composeProjects.added +
                  preview.summary.composeProjects.modified +
                  preview.summary.composeProjects.removed}
                )
              </button>
            </div>

            <div className="diff-preview-body">
              {tab === 'images' && (
                <ul className="diff-entry-list">
                  {preview.diff.images.map((e) => {
                    const key = `image:${e.imageId}`;
                    return (
                      <li key={key} className={`diff-entry diff-${e.kind}`}>
                        {e.kind === 'removed' ? (
                          <span className="diff-entry-spacer" aria-hidden />
                        ) : (
                          <input
                            type="checkbox"
                            checked={!excluded.has(key)}
                            onChange={() => toggleExclude(key)}
                            aria-label={`${key} を同梱`}
                          />
                        )}
                        <span className="diff-kind">[{kindLabel(e.kind)}]</span>
                        <span className="diff-name">
                          {e.repoTags[0] ?? e.imageId.slice(7, 19)}
                        </span>
                        <span className="diff-size">{formatBytes(e.size)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {tab === 'volumes' && (
                <ul className="diff-entry-list">
                  {preview.diff.volumes.map((e) => {
                    const key = `volume:${e.name}`;
                    return (
                      <li key={key} className={`diff-entry diff-${e.kind}`}>
                        {e.kind === 'removed' ? (
                          <span className="diff-entry-spacer" aria-hidden />
                        ) : (
                          <input
                            type="checkbox"
                            checked={!excluded.has(key)}
                            onChange={() => toggleExclude(key)}
                            aria-label={`${key} を同梱`}
                          />
                        )}
                        <span className="diff-kind">[{kindLabel(e.kind)}]</span>
                        <span className="diff-name">{e.name}</span>
                        <span className="diff-size">{formatBytes(e.size)}</span>
                        {e.reason && <span className="diff-reason">({e.reason})</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {tab === 'compose' && (
                <ul className="diff-entry-list">
                  {preview.diff.composeProjects.map((e) => {
                    const key = `compose:${e.projectName}`;
                    return (
                      <li key={key} className={`diff-entry diff-${e.kind}`}>
                        {e.kind === 'removed' ? (
                          <span className="diff-entry-spacer" aria-hidden />
                        ) : (
                          <input
                            type="checkbox"
                            checked={!excluded.has(key)}
                            onChange={() => toggleExclude(key)}
                            aria-label={`${key} を同梱`}
                          />
                        )}
                        <span className="diff-kind">[{kindLabel(e.kind)}]</span>
                        <span className="diff-name">{e.projectName}</span>
                        {e.reason && <span className="diff-reason">({e.reason})</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="diff-preview-footer">
              <div className="diff-summary">
                変更件数: {totalChanges} 件 / 推定転送: {formatBytes(preview.estimatedSizeRaw)}（生） /{' '}
                {formatBytes(preview.estimatedSizeCompressed)}（圧縮後）
              </div>
              <div className="diff-actions">
                <button type="button" onClick={onCancel}>
                  キャンセル
                </button>
                <button type="button" onClick={onFallbackToFull}>
                  フルエクスポートに切替
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={totalChanges === 0}
                  onClick={() => onConfirm(excluded)}
                >
                  差分エクスポート実行
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};
