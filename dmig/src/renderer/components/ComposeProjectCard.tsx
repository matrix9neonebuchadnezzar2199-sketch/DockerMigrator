import React from 'react';
import type { ComposeLifecycleAction, ComposeProjectInfo } from '../../shared/types.js';
import { formatGbFromBytes } from '../utils/formatTransfer.js';

/**
 * Compose プロジェクト1件のカード表示。
 * チェックボックスで選択可、サービス・ボリューム・bind mount の概要を展開表示する。
 */
export const ComposeProjectCard: React.FC<{
  project: ComposeProjectInfo;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** ワンクリック用: このプロジェクトに対する compose stop/pull */
  onComposeLifecycle?: (action: ComposeLifecycleAction) => void;
  /** このカードの操作が実行中 */
  composeLifecycleBusy?: boolean;
  /** 他プロジェクトの操作などで全カードのボタンを止める */
  composeOpsLocked?: boolean;
}> = ({
  project,
  selected,
  onToggle,
  disabled,
  onComposeLifecycle,
  composeLifecycleBusy,
  composeOpsLocked,
}) => {
  const bindMounts = project.bindMounts ?? [];
  const runningCount = project.services.filter((s) => s.state === 'running').length;
  const buildContexts = project.services.filter((s) => s.buildContextPath).length;

  return (
    <div className={`compose-card ${selected ? 'selected' : ''}`}>
      <div className="compose-card-header">
        <input type="checkbox" checked={selected} onChange={onToggle} disabled={disabled} />
        <div className="compose-card-title">
          <strong>{project.name}</strong>
          <span className="compose-card-meta">
            {project.services.length} services
            {runningCount > 0 ? ` (${runningCount} 稼働中)` : ''}
            {' · '}
            {project.volumeNames.length} volumes
            {bindMounts.length > 0 ? ` · ${bindMounts.length} bind mounts` : ''}
            {buildContexts > 0 ? ` · ${buildContexts} build` : ''}
          </span>
          <div className="compose-card-size-row">
            <span className="compose-card-size-label">
              📦 推定パックサイズ（圧縮目安）: <strong>{formatGbFromBytes(project.estimatedSize ?? 0)}</strong>
            </span>
          </div>
          {onComposeLifecycle && (
            <div className="compose-card-quick-actions">
              <button
                type="button"
                className="btn-compact"
                disabled={disabled || composeOpsLocked || composeLifecycleBusy}
                onClick={() => onComposeLifecycle('stop')}
              >
                ⏹ compose stop
              </button>
              <button
                type="button"
                className="btn-compact"
                disabled={disabled || composeOpsLocked || composeLifecycleBusy}
                onClick={() => onComposeLifecycle('pull')}
              >
                ⬇ compose pull
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="compose-card-body">
        {project.services.length > 0 && (
          <div className="compose-card-section">
            <div className="compose-card-section-title">🧩 Services</div>
            {project.services.map((svc) => (
              <div key={svc.name} className="compose-card-item">
                <span className="badge">{svc.state}</span>
                <span className="compose-card-svc-name">{svc.name}</span>
                <span className="compose-card-svc-image">{svc.image}</span>
              </div>
            ))}
          </div>
        )}

        {project.volumeNames.length > 0 && (
          <div className="compose-card-section">
            <div className="compose-card-section-title">💾 Volumes</div>
            <div className="compose-card-volumes">{project.volumeNames.join(', ')}</div>
          </div>
        )}

        {bindMounts.length > 0 && (
          <div className="compose-card-section">
            <div className="compose-card-section-title">🔗 Bind Mounts</div>
            {bindMounts.map((bm, idx) => (
              <div key={`${bm.hostPath}-${idx}`} className="compose-card-item">
                <span className="compose-card-bind">
                  {bm.hostPath} → {bm.containerPath}
                </span>
                {bm.readOnly && <span className="badge badge-warning">ro</span>}
              </div>
            ))}
          </div>
        )}

        {project.configFiles.length > 0 && (
          <div className="compose-card-section">
            <div className="compose-card-section-title">📄 Compose File</div>
            <div className="compose-card-cfg">{project.configFiles.join(', ')}</div>
          </div>
        )}
      </div>
    </div>
  );
};
