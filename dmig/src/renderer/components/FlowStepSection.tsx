import React, { useId } from 'react';

export type FlowStepStatus = 'locked' | 'active' | 'done';

export type FlowStepSectionProps = {
  /** 手順番号（1 始まり） */
  step: number;
  title: string;
  /** 折りたたみ時にヘッダーに表示する要約（色だけに頼らない） */
  summary?: string;
  status: FlowStepStatus;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

/**
 * 縦型ウィザード用の折りたたみ手順ブロック（ユニバーサルデザイン: 番号・文言・展開状態を明示）。
 */
export const FlowStepSection: React.FC<FlowStepSectionProps> = ({
  step,
  title,
  summary,
  status,
  expanded,
  onToggle,
  children,
}) => {
  const panelId = useId();
  const locked = status === 'locked';
  const done = status === 'done';

  const statusText =
    status === 'locked' ? '（未着手）' : status === 'active' ? '（いまここ）' : '（完了）';

  return (
    <section
      className={`flow-step flow-step--${status}`}
      aria-labelledby={`${panelId}-heading`}
      data-step={step}
    >
      <h3 className="flow-step-heading" id={`${panelId}-heading`}>
        <button
          type="button"
          className="flow-step-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          disabled={locked}
        >
          <span className="flow-step-badge" aria-hidden="true">
            {done ? '✓' : step}
          </span>
          <span className="flow-step-title-wrap">
            <span className="flow-step-title">{title}</span>
            <span className="flow-step-status-label">{statusText}</span>
            {!expanded && summary ? (
              <span className="flow-step-summary">{summary}</span>
            ) : null}
          </span>
          <span className="flow-step-chevron" aria-hidden="true">
            {expanded ? '▼' : '▲'}
          </span>
        </button>
      </h3>
      {expanded && !locked ? (
        <div className="flow-step-body" id={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  );
};
