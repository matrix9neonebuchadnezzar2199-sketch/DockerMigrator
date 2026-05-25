import React from 'react';
import type { PageKey } from '../App.js';
import { getFlowIndicatorForPage, getPageForFlowStep } from '../data/flowSteps.js';

function stepState(
  stepIndex: number,
  currentIndex: number,
): 'complete' | 'current' | 'upcoming' {
  if (stepIndex < currentIndex) return 'complete';
  if (stepIndex === currentIndex) return 'current';
  return 'upcoming';
}

export const StepIndicator: React.FC<{
  page: PageKey;
  onNavigate?: (page: PageKey) => void;
}> = ({ page, onNavigate }) => {
  const flow = getFlowIndicatorForPage(page);
  if (!flow) return null;

  return (
    <nav className="step-indicator" aria-label={flow.groupLabel}>
      <ol className="step-indicator-list">
        {flow.steps.map((step, i) => {
          const state = stepState(step.index, flow.currentIndex);
          const isCurrent = state === 'current';
          const targetPage = onNavigate ? getPageForFlowStep(flow.group, step.index) : null;
          const canNavigate = Boolean(targetPage && onNavigate) && !isCurrent;

          return (
            <li
              key={step.index}
              className={`step-indicator-item step-indicator-item--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {canNavigate ? (
                <button
                  type="button"
                  className="step-indicator-step-btn"
                  onClick={() => onNavigate!(targetPage!)}
                  title={`${step.label}へ移動`}
                >
                  <span className="step-indicator-num" aria-hidden="true">
                    {step.index}
                  </span>
                  <span className="step-indicator-label">{step.label}</span>
                </button>
              ) : (
                <>
                  <span className="step-indicator-num" aria-hidden="true">
                    {step.index}
                  </span>
                  <span className="step-indicator-label">{step.label}</span>
                </>
              )}
              {i < flow.steps.length - 1 ? (
                <span className="step-indicator-connector" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
