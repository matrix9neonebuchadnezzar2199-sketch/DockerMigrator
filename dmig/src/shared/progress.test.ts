import { describe, expect, it } from 'vitest';
import {
  applyProgressScope,
  buildProgressEvent,
  inferProgressScope,
  matchesProgressScope,
  ProgressTaskIds,
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
