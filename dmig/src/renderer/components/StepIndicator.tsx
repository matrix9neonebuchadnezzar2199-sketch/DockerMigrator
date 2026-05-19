import React from 'react';
import type { PageKey } from '../App.js';
import { getFlowIndicatorForPage } from '../data/flowSteps.js';

function stepState(
  stepIndex: number,
  currentIndex: number,
): 'complete' | 'current' | 'upcoming' {
  if (stepIndex < currentIndex) return 'complete';
  if (stepIndex === currentIndex) return 'current';
  return 'upcoming';
}

export const StepIndicator: React.FC<{ page: PageKey }> = ({ page }) => {
  const flow = getFlowIndicatorForPage(page);
  if (!flow) return null;

  return (
    <nav className="step-indicator" aria-label={flow.groupLabel}>
      <ol className="step-indicator-list">
        {flow.steps.map((step, i) => {
          const state = stepState(step.index, flow.currentIndex);
          return (
            <li
              key={step.index}
              className={`step-indicator-item step-indicator-item--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="step-indicator-num" aria-hidden="true">
                {step.index}
              </span>
              <span className="step-indicator-label">{step.label}</span>
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
