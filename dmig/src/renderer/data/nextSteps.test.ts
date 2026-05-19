import { describe, expect, it } from 'vitest';

import { getNextStepForPage, NEXT_STEPS_BY_PAGE } from './nextSteps.js';

describe('nextSteps', () => {
  it('全 PageKey にエントリがある', () => {
    const keys = [
      'source-overview',
      'compose',
      'export',
      'resume',
      'target-overview',
      'import',
      'help',
    ] as const;
    for (const key of keys) {
      expect(NEXT_STEPS_BY_PAGE[key]).toBeDefined();
    }
  });

  it('help は getNextStepForPage が null', () => {
    expect(getNextStepForPage('help')).toBeNull();
  });

  it('compose に flowStep source index 1', () => {
    expect(getNextStepForPage('compose')?.flowStep).toEqual({ group: 'source', index: 1 });
  });
});
