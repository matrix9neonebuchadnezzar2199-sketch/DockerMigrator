import React from 'react';
import type { PageKey } from '../App.js';
import { useDynamicCta } from '../context/DynamicCtaContext.js';
import { getNextStepForPage } from '../data/nextSteps.js';

const DOCKER_DISCONNECTED_DESC =
  'Docker に接続できません。Docker Desktop を起動してから作業を続けてください。';

export const NextStepFooter: React.FC<{
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  dockerConnected: boolean;
}> = ({ page, onNavigate, dockerConnected }) => {
  const step = getNextStepForPage(page);
  const { dynamicCta } = useDynamicCta();
  if (!step) return null;

  const description = dockerConnected ? step.description : DOCKER_DISCONNECTED_DESC;

  const staticCta =
    dockerConnected && step.ctaLabel && step.ctaTarget
      ? { label: step.ctaLabel, targetPage: step.ctaTarget, dynamic: false as const }
      : null;
  const activeCta = dockerConnected
    ? dynamicCta
      ? { label: dynamicCta.label, targetPage: dynamicCta.targetPage, dynamic: true as const }
      : staticCta
    : null;

  return (
    <footer className="next-step-footer" role="contentinfo" aria-label="次にやること">
      <div className="next-step-footer-inner">
        <p className="next-step-description">{description}</p>
        {activeCta ? (
          <button
            type="button"
            className={activeCta.dynamic ? 'next-step-cta next-step-cta-dynamic' : 'next-step-cta'}
            onClick={() => onNavigate(activeCta.targetPage)}
          >
            {activeCta.dynamic ? `✓ ${activeCta.label}` : activeCta.label}
          </button>
        ) : null}
      </div>
    </footer>
  );
};
