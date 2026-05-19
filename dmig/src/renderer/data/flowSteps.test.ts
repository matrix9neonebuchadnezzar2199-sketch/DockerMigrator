import { describe, expect, it } from 'vitest';

import {
  getFlowIndicatorForPage,
  SOURCE_FLOW_PIPELINE,
  TARGET_FLOW_PIPELINE,
} from './flowSteps.js';

describe('flowSteps', () => {
  it('移行元パイプラインは 3 ステップ', () => {
    expect(SOURCE_FLOW_PIPELINE).toHaveLength(3);
  });

  it('移行先パイプラインは 1 ステップ', () => {
    expect(TARGET_FLOW_PIPELINE).toHaveLength(1);
  });

  it('compose は currentIndex 1', () => {
    expect(getFlowIndicatorForPage('compose')?.currentIndex).toBe(1);
  });

  it('overview は null', () => {
    expect(getFlowIndicatorForPage('source-overview')).toBeNull();
    expect(getFlowIndicatorForPage('target-overview')).toBeNull();
  });
});
