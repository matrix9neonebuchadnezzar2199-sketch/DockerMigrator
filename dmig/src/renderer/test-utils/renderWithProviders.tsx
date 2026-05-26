import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';

import { ComposePageStateProvider } from '../context/ComposePageStateContext.js';
import { DynamicCtaProvider } from '../context/DynamicCtaContext.js';
import { JobLockProvider } from '../context/JobLockContext.js';
import { ProgressBusProvider } from '../context/ProgressBusContext.js';
import { RollbackJobProvider } from '../context/RollbackJobContext.js';
import { LogBufferProvider } from '../hooks/useLogBuffer.js';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProgressBusProvider>
      <LogBufferProvider>
        <JobLockProvider>
          <RollbackJobProvider>
            <ComposePageStateProvider>
              <DynamicCtaProvider>{children}</DynamicCtaProvider>
            </ComposePageStateProvider>
          </RollbackJobProvider>
        </JobLockProvider>
      </LogBufferProvider>
    </ProgressBusProvider>
  );
}

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: AllProviders, ...options });
}
