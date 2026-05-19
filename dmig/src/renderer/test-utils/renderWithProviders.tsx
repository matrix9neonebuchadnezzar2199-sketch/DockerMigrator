import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';

import { DynamicCtaProvider } from '../context/DynamicCtaContext.js';

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(<DynamicCtaProvider>{ui}</DynamicCtaProvider>, options);
}
