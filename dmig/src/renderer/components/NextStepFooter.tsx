import React from 'react';
import type { PageKey } from '../App.js';
import { getNextStepForPage } from '../data/nextSteps.js';

const DOCKER_DISCONNECTED_DESC =
  'Docker に接続できません。Docker Desktop を起動してから作業を続けてください。';

export const NextStepFooter: React.FC<{
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  dockerConnected: boolean;
}> = ({ page, onNavigate, dockerConnected }) => {
  const step = getNextStepForPage(page);
  if (!step) return null;

  const description = dockerConnected ? step.description : DOCKER_DISCONNECTED_DESC;
  const showCta = dockerConnected && step.ctaLabel && step.ctaTarget;

  return (
    <footer className="next-step-footer" role="contentinfo" aria-label="次にやること">
      <div className="next-step-footer-inner">
        <p className="next-step-description">{description}</p>
        {showCta ? (
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
