import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';

import { ComposePageStateProvider } from '../context/ComposePageStateContext.js';
import { DynamicCtaProvider } from '../context/DynamicCtaContext.js';
import { JobLockProvider } from '../context/JobLockContext.js';
import { RollbackJobProvider } from '../context/RollbackJobContext.js';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <JobLockProvider>
      <RollbackJobProvider>
        <ComposePageStateProvider>
          <DynamicCtaProvider>{children}</DynamicCtaProvider>
        </ComposePageStateProvider>
      </RollbackJobProvider>
    </JobLockProvider>
  );
}

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: AllProviders, ...options });
}
