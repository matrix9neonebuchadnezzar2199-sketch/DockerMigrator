import type { WebContents } from 'electron';
import type { ProgressEvent } from '@shared/types.js';
import { applyProgressScope, buildProgressEvent } from '@shared/progress.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import { yieldToRenderer } from './yieldToRenderer.js';

/** invoke 中に Renderer へ進捗を逐次送るリレー。 */
export function createProgressRelay(sender: WebContents) {
  const tracker = new ProgressTracker();

  const send = async (ev: ProgressEvent): Promise<void> => {
    if (sender && !sender.isDestroyed()) {
      sender.send('dmig:progress', applyProgressScope(tracker.enrich(ev)));
    }
    await yieldToRenderer();
  };

  /** EventEmitter 用（fire-and-forget）。 */
  const forwarder = (ev: ProgressEvent): void => {
    void send(ev);
  };

  const emit = async (
    input: Parameters<typeof buildProgressEvent>[0],
  ): Promise<void> => {
    await send(buildProgressEvent(input));
  };

  return { send, forwarder, emit };
}
