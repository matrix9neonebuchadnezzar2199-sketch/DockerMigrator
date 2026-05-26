import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProgressEvent } from '../../shared/types.js';
import { ProgressBusProvider, useProgressBus } from './ProgressBusContext.js';

function CaptureProgress({
  scope,
  label,
}: {
  scope?: ProgressEvent['scope'];
  label: string;
}) {
  const { subscribe } = useProgressBus();
  const [message, setMessage] = React.useState('');

  useEffect(() => {
    return subscribe(scope, (ev) => setMessage(`${label}:${ev.message}`));
  }, [subscribe, scope, label]);

  return <div data-testid={label}>{message}</div>;
}

describe('ProgressBusContext', () => {
  it('単一購読で scope フィルタする', async () => {
    const listeners: Array<(ev: ProgressEvent) => void> = [];
    window.dmig = {
      ...window.dmig,
      onProgress: vi.fn((cb) => {
        listeners.push(cb);
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      }),
    } as typeof window.dmig;

    render(
      <ProgressBusProvider>
        <CaptureProgress scope="transfer" label="transfer" />
        <CaptureProgress scope="discover" label="discover" />
      </ProgressBusProvider>,
    );

    listeners[0]?.({
      taskId: 'img1',
      phase: 'save',
      scope: 'transfer',
      current: 1,
      total: 2,
      message: '転送中',
      percentage: 50,
    });

    await waitFor(() => {
      expect(screen.getByTestId('transfer')).toHaveTextContent('transfer:転送中');
      expect(screen.getByTestId('discover')).toHaveTextContent('');
    });
  });

  it('unsubscribe 後は通知を受け取らない', async () => {
    const listeners: Array<(ev: ProgressEvent) => void> = [];
    window.dmig = {
      ...window.dmig,
      onProgress: vi.fn((cb) => {
        listeners.push(cb);
        return () => listeners.splice(0, listeners.length);
      }),
    } as typeof window.dmig;

    function MountOnce() {
      const { subscribe } = useProgressBus();
      useEffect(() => {
        const unsub = subscribe('scan', () => {});
        unsub();
      }, [subscribe]);
      return null;
    }

    render(
      <ProgressBusProvider>
        <MountOnce />
        <CaptureProgress scope="scan" label="active" />
      </ProgressBusProvider>,
    );

    listeners[0]?.({
      taskId: 'probe',
      phase: 'discover',
      scope: 'scan',
      current: 0,
      total: 1,
      message: 'scan-msg',
      percentage: 0,
    });

    await waitFor(() => {
      expect(screen.getByTestId('active')).toHaveTextContent('active:scan-msg');
    });
  });
});
