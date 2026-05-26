import { describe, expect, it } from 'vitest';

import {
  PROD_RENDERER_CONTENT_SECURITY_POLICY,
  buildDevRendererContentSecurityPolicy,
  buildProdRendererCspMetaTag,
  injectProdRendererCspMeta,
  resolveDevRendererCspConfig,
} from './rendererCsp.js';

describe('renderer CSP strings (hotfix-3 / UPDATE-06)', () => {
  it('prod CSP blocks network from renderer', () => {
    expect(PROD_RENDERER_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(PROD_RENDERER_CONTENT_SECURITY_POLICY).not.toContain('frame-ancestors');
  });

  it('dev CSP allows Vite HMR on port 5173 and IPv6 loopback', () => {
    const dev = buildDevRendererContentSecurityPolicy();
    expect(dev).toContain('ws://localhost:5173');
    expect(dev).toContain('ws://[::1]:5173');
    expect(dev).toContain("'unsafe-eval'");
  });

  it('prod meta injection matches electron-vite build hook', () => {
    const html = '<!doctype html><html><head></head><body></body></html>';
    const out = injectProdRendererCspMeta(html);
    expect(out).toContain(buildProdRendererCspMetaTag());
    expect(out).toContain("connect-src 'none'");
  });

  it('resolveDevRendererCspConfig merges ELECTRON_RENDERER_URL host', () => {
    const config = resolveDevRendererCspConfig({
      ELECTRON_RENDERER_URL: 'http://localhost:5173/',
    });
    expect(config.port).toBe(5173);
    expect(config.hosts).toContain('localhost');
    expect(config.hosts).toContain('[::1]');
  });
});
