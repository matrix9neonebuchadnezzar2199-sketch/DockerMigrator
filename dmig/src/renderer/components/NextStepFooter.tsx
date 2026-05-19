import React from 'react';
import type { PageKey } from '../App.js';
import { getNextStepForPage } from '../data/nextSteps.js';

export const NextStepFooter: React.FC<{
  page: PageKey;
  onNavigate: (page: PageKey) => void;
}> = ({ page, onNavigate }) => {
  const step = getNextStepForPage(page);
  if (!step) return null;

  return (
    <footer className="next-step-footer" role="contentinfo" aria-label="次にやること">
      <div className="next-step-footer-inner">
        <p className="next-step-description">{step.description}</p>
        {step.ctaLabel && step.ctaTarget ? (
          <button
            type="button"
            className="next-step-cta"
            onClick={() => onNavigate(step.ctaTarget!)}
          >
            {step.ctaLabel}
          </button>
        ) : null}
      </div>
    </footer>
  );
};
