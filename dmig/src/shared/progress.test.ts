import { describe, expect, it } from 'vitest';
import {
  applyProgressScope,
  buildProgressEvent,
  computeProgressPercentage,
  inferProgressScope,
  matchesProgressScope,
  ProgressTaskIds,
  resolveDisplayPercentage,
} from './progress.js';

describe('progress helpers', () => {
  it('inferProgressScope: compose-discover → discover', () => {
    const ev = buildProgressEvent({
      taskId: ProgressTaskIds.COMPOSE_DISCOVER,
      phase: 'discover',
      current: 1,
      total: 10,
      message: 'test',
    });
    expect(inferProgressScope(ev)).toBe('discover');
  });

  it('inferProgressScope: save phase → transfer', () => {
    const ev = buildProgressEvent({
      taskId: 'my-image',
      phase: 'save',
      current: 1,
      total: 10,
      message: 'test',
    });
    expect(inferProgressScope(ev)).toBe('transfer');
  });

  it('resolveDisplayPercentage: percentage 0 でも current/total から算出', () => {
    const ev = buildProgressEvent({
      taskId: 'img',
      phase: 'compress',
      current: 50,
      total: 100,
      message: 'test',
    });
    const legacy = { ...ev, percentage: 0 };
    expect(resolveDisplayPercentage(legacy)).toBe(50);
  });

  it('computeProgressPercentage', () => {
    expect(computeProgressPercentage(25, 100)).toBe(25);
    expect(computeProgressPercentage(0, 0)).toBe(0);
  });

  it('matchesProgressScope filters by scope', () => {
    const ev = applyProgressScope(
      buildProgressEvent({
        taskId: ProgressTaskIds.RESUMABLE_SCAN,
        phase: 'discover',
        current: 5,
        total: 10,
        message: 'scan',
      }),
    );
    expect(matchesProgressScope(ev, 'scan')).toBe(true);
    expect(matchesProgressScope(ev, 'transfer')).toBe(false);
  });
});
