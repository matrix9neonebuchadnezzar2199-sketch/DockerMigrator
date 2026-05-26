import { describe, expect, it } from 'vitest';

import { PROD_CONTENT_SECURITY_POLICY, buildDevContentSecurityPolicy } from './csp.js';

describe('content security policy strings (hotfix-3)', () => {
  it('prod CSP blocks network from renderer and allows bundled assets', () => {
    expect(PROD_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(PROD_CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(PROD_CONTENT_SECURITY_POLICY).toContain("worker-src 'self'");
    expect(PROD_CONTENT_SECURITY_POLICY).toContain("manifest-src 'self'");
  });

  it('dev CSP allows Vite HMR on port 5173', () => {
    const dev = buildDevContentSecurityPolicy();
    expect(dev).toContain('ws://localhost:5173');
    expect(dev).toContain("'unsafe-eval'");
  });
});
