import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProgressEvent } from '../../shared/types.js';
import { ProgressBusProvider } from '../context/ProgressBusContext.js';
import { useDoneProgressNotice } from './useDoneProgressNotice.js';

function Probe() {
  const { cancelRequestedOnDone } = useDoneProgressNotice('transfer');
  return <span data-testid="flag">{cancelRequestedOnDone ? 'yes' : 'no'}</span>;
}

describe('useDoneProgressNotice', () => {
  it('taskId=done の cancelRequested を拾う', async () => {
    const listeners: Array<(ev: ProgressEvent) => void> = [];
    window.dmig = {
      ...window.dmig,
      onProgress: vi.fn((cb) => {
        listeners.push(cb);
        return () => listeners.splice(0, listeners.length);
      }),
    } as typeof window.dmig;

    render(
      <ProgressBusProvider>
        <Probe />
      </ProgressBusProvider>,
    );

    listeners[0]?.({
      taskId: 'done',
      phase: 'write',
      scope: 'transfer',
      current: 1,
      total: 1,
      message: '完了',
      percentage: 100,
      cancelRequested: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId('flag')).toHaveTextContent('yes');
    });
  });
});
