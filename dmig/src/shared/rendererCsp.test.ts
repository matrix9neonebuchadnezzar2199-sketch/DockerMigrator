import { describe, expect, it } from 'vitest';

import {
  PROD_RENDERER_CONTENT_SECURITY_POLICY,
  buildDevRendererContentSecurityPolicy,
} from './rendererCsp.js';

describe('renderer CSP strings (hotfix-3)', () => {
  it('prod CSP blocks network from renderer', () => {
    expect(PROD_RENDERER_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(PROD_RENDERER_CONTENT_SECURITY_POLICY).not.toContain('frame-ancestors');
  });

  it('dev CSP allows Vite HMR on port 5173', () => {
    const dev = buildDevRendererContentSecurityPolicy();
    expect(dev).toContain('ws://localhost:5173');
    expect(dev).toContain("'unsafe-eval'");
  });
});
