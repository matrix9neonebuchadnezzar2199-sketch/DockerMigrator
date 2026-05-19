import React, { useEffect, useRef } from 'react';

/**
 * 初回起動時の「移行元 / 移行先」選択モーダル。
 * Escape・背景クリックでは閉じない（明示的スキップのみ）。
 */
export const WelcomeWizard: React.FC<{
  onSelectSource: () => void;
  onSelectTarget: () => void;
  onSkip: () => void;
  onComplete: () => void | Promise<void>;
}> = ({ onSelectSource, onSelectTarget, onSkip, onComplete }) => {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const finish = async (afterChoice: () => void) => {
    afterChoice();
    await onComplete();
  };

  return (
    <div
      className="welcome-wizard-overlay dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="welcome-wizard-panel dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-wizard-title"
      >
        <h2
          id="welcome-wizard-title"
          className="welcome-wizard-title"
          ref={titleRef}
          tabIndex={-1}
        >
          DockerMigrator へようこそ
        </h2>
        <p className="welcome-wizard-intro dialog-intro">
          これから何の作業をしますか？ あとから変更できます。
        </p>
        <div className="welcome-wizard-choices">
          <button
            type="button"
            className="welcome-wizard-choice"
            aria-label="移行元の作業をする。Docker プロジェクトを別のマシンに持っていくため、パックを書き出します。"
            onClick={() => void finish(onSelectSource)}
          >
            <span className="welcome-wizard-choice-icon" aria-hidden="true">
              📤
            </span>
            <span className="welcome-wizard-choice-label">移行元の作業をする</span>
            <span className="welcome-wizard-choice-desc">
              Docker プロジェクトを別のマシンに持っていくため、パックを書き出します。
            </span>
          </button>
          <button
            type="button"
            className="welcome-wizard-choice"
            aria-label="移行先の作業をする。他のマシンから持ってきたパックを、このマシンに取り込みます。"
            onClick={() => void finish(onSelectTarget)}
          >
            <span className="welcome-wizard-choice-icon" aria-hidden="true">
              📥
            </span>
            <span className="welcome-wizard-choice-label">移行先の作業をする</span>
            <span className="welcome-wizard-choice-desc">
              他のマシンから持ってきたパックを、このマシンに取り込みます。
            </span>
          </button>
        </div>
        <div className="welcome-wizard-footer">
          <button type="button" className="welcome-wizard-skip" onClick={() => void finish(onSkip)}>
            あとで決める
          </button>
        </div>
      </div>
    </div>
  );
};
