import React, { useState } from 'react';
import type { SecretScanResult, SecretAction } from '../../shared/types.js';

/**
 * シークレット警告ダイアログ。
 *
 * Phase 5 確定仕様:
 *   - 3択 (同梱/マスク/除外)、デフォルトは「除外」
 *   - プロジェクトごとに選択できる
 */
export const SecretWarningDialog: React.FC<{
  /** プロジェクト名 → スキャン結果配列 */
  scanResults: Record<string, SecretScanResult[]>;
  onConfirm: (actions: Record<string, SecretAction>) => void;
  onCancel: () => void;
}> = ({ scanResults, onConfirm, onCancel }) => {
  const projectNames = Object.keys(scanResults);
  const [actions, setActions] = useState<Record<string, SecretAction>>(() =>
    Object.fromEntries(projectNames.map((n) => [n, 'exclude' as SecretAction])),
  );

  if (projectNames.length === 0) return null;

  const setAction = (projectName: string, action: SecretAction) => {
    setActions((prev) => ({ ...prev, [projectName]: action }));
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog dialog-warning">
        <div className="dialog-header">
          <span style={{ fontSize: 20 }}>⚠</span>
          シークレット検出 — 取り扱いを選択してください
        </div>

        <div className="dialog-body">
          <p className="dialog-intro">
            以下のプロジェクトに機密情報が含まれている可能性があります。
            USBを紛失した場合、これらの情報が漏洩する可能性があります。
          </p>

          {projectNames.map((projectName) => (
            <div key={projectName} className="secret-project">
              <div className="secret-project-name">📁 {projectName}</div>

              {scanResults[projectName].map((scan, i) => (
                <div key={i} className="secret-file">
                  <div className="secret-file-path">{scan.filePath}</div>
                  <ul className="secret-findings">
                    {scan.findings.map((f, j) => (
                      <li key={j}>
                        <span className={`severity severity-${f.severity}`}>{f.severity}</span>
                        <code>{f.key}</code> = {f.preview}
                        <span className="rule-name">[{f.ruleName}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="secret-actions">
                <label>
                  <input
                    type="radio"
                    name={`action-${projectName}`}
                    checked={actions[projectName] === 'exclude'}
                    onChange={() => setAction(projectName, 'exclude')}
                  />
                  同梱せず .env は除外する <strong>（推奨）</strong>
                </label>
                <label>
                  <input
                    type="radio"
                    name={`action-${projectName}`}
                    checked={actions[projectName] === 'mask'}
                    onChange={() => setAction(projectName, 'mask')}
                  />
                  マスクして同梱する（値は ***MASKED*** に置換）
                </label>
                <label>
                  <input
                    type="radio"
                    name={`action-${projectName}`}
                    checked={actions[projectName] === 'include'}
                    onChange={() => setAction(projectName, 'include')}
                  />
                  そのまま同梱する（リスクを理解した）
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            中止
          </button>
          <button type="button" className="btn-primary" onClick={() => onConfirm(actions)}>
            この選択で続行
          </button>
        </div>
      </div>
    </div>
  );
};
