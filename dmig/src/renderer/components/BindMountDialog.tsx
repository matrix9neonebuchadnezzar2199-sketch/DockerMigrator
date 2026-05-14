import React, { useState } from 'react';
import type { ComposeProjectInfo, BindMountChoice, BindMountAction } from '../../shared/types.js';

/**
 * bind mount の処理方法をユーザーに選ばせるダイアログ。
 *
 * Phase 5 確定仕様:
 *   - 同梱 or パス記録のみ を hostPath ごとに選択
 *   - デフォルトは recordPathOnly（同梱は容量・プライバシー影響が大きいため安全側）
 *
 * 呼び出し側は「選択プロジェクトのいずれかに bind mount がある」場合のみ表示すること。
 */
export const BindMountDialog: React.FC<{
  projects: ComposeProjectInfo[];
  onConfirm: (choices: Record<string, BindMountChoice[]>) => void;
  onCancel: () => void;
}> = ({ projects, onConfirm, onCancel }) => {
  const [choices, setChoices] = useState<Record<string, BindMountChoice[]>>(() => {
    const init: Record<string, BindMountChoice[]> = {};
    for (const proj of projects) {
      init[proj.name] = proj.bindMounts.map((bm) => ({
        hostPath: bm.hostPath,
        action: 'recordPathOnly' as BindMountAction,
      }));
    }
    return init;
  });

  const setAction = (projectName: string, hostPath: string, action: BindMountAction) => {
    setChoices((prev) => ({
      ...prev,
      [projectName]: prev[projectName].map((c) => (c.hostPath === hostPath ? { ...c, action } : c)),
    }));
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-header">
          <span style={{ fontSize: 20 }}>📁</span>
          Bind Mount の処理を選択してください
        </div>

        <div className="dialog-body">
          <p className="dialog-intro">
            bind mount のホストディレクトリは、内容を tar 化して同梱するか、
            パスのみ記録するかを選択できます。
            <br />
            <strong>パスのみ記録</strong> を選ぶ場合、インポート先で同じパス（または
            インポート時に指定するパス）にディレクトリを用意してください。
          </p>

          {projects.map((proj) =>
            proj.bindMounts.length > 0 ? (
              <div key={proj.name} className="secret-project">
                <div className="secret-project-name">📁 {proj.name}</div>

                {proj.bindMounts.map((bm, idx) => {
                  const current =
                    choices[proj.name]?.find((c) => c.hostPath === bm.hostPath)?.action ?? 'recordPathOnly';

                  return (
                    <div key={`${bm.hostPath}-${idx}`} className="bind-entry">
                      <div className="bind-entry-path">
                        <code>{bm.hostPath}</code>
                        <span style={{ color: '#a6adc8' }}> → </span>
                        <code>{bm.containerPath}</code>
                        {bm.readOnly && (
                          <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                            ro
                          </span>
                        )}
                      </div>
                      <div className="secret-actions">
                        <label>
                          <input
                            type="radio"
                            name={`bind-${proj.name}-${idx}`}
                            checked={current === 'recordPathOnly'}
                            onChange={() => setAction(proj.name, bm.hostPath, 'recordPathOnly')}
                          />
                          パスのみ記録（推奨）
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`bind-${proj.name}-${idx}`}
                            checked={current === 'packageContent'}
                            onChange={() => setAction(proj.name, bm.hostPath, 'packageContent')}
                          />
                          ディレクトリ内容を同梱する
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null,
          )}
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            中止
          </button>
          <button type="button" className="btn-primary" onClick={() => onConfirm(choices)}>
            この選択で続行
          </button>
        </div>
      </div>
    </div>
  );
};
