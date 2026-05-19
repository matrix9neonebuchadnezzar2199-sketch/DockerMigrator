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

  it('移行先パイプラインは 2 ステップ', () => {
    expect(TARGET_FLOW_PIPELINE).toHaveLength(2);
  });

  it('compose は currentIndex 1', () => {
    expect(getFlowIndicatorForPage('compose')?.currentIndex).toBe(1);
  });

  it('source-overview は null、target-overview は step 1', () => {
    expect(getFlowIndicatorForPage('source-overview')).toBeNull();
    expect(getFlowIndicatorForPage('target-overview')?.currentIndex).toBe(1);
  });

  it('import は target step 2', () => {
    expect(getFlowIndicatorForPage('import')?.currentIndex).toBe(2);
  });
});
