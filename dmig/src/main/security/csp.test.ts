import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildDevRendererContentSecurityPolicy,
  buildDevWebRequestFilterUrls,
  resolveDevRendererCspConfig,
} from '@shared/rendererCsp.js';

const onHeadersReceived = vi.fn();

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived,
      },
    },
  },
}));

describe('installContentSecurityPolicy', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('packaged では webRequest を登録しない', async () => {
    const { installContentSecurityPolicy } = await import('./csp.js');
    installContentSecurityPolicy(true);
    expect(onHeadersReceived).not.toHaveBeenCalled();
  });

  it('dev では filter.urls 付きで onHeadersReceived を登録する', async () => {
    const { installContentSecurityPolicy } = await import('./csp.js');
    installContentSecurityPolicy(false);

    expect(onHeadersReceived).toHaveBeenCalledTimes(1);
    const [filter] = onHeadersReceived.mock.calls[0] as [{ urls: string[] }];
    expect(filter.urls).toContain('http://localhost:5173/*');
    expect(filter.urls).toContain('http://[::1]:5173/*');
    expect(filter.urls).toContain('ws://localhost:5173/*');
  });

  it('コールバックで Content-Security-Policy を上書きする', async () => {
    const { installContentSecurityPolicy } = await import('./csp.js');
    installContentSecurityPolicy(false);

    const handler = onHeadersReceived.mock.calls[0][1] as (
      details: { responseHeaders: Record<string, string[]> },
      callback: (result: { responseHeaders: Record<string, string | string[]> }) => void,
    ) => void;

    const callback = vi.fn();
    handler(
      {
        responseHeaders: {
          'content-type': ['text/html'],
          'content-security-policy': ['old'],
        },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        'Content-Security-Policy': [buildDevRendererContentSecurityPolicy()],
      }),
    });
    const headers = callback.mock.calls[0][0].responseHeaders;
    expect(headers['content-security-policy']).toBeUndefined();
  });
});

describe('resolveDevRendererCspConfig', () => {
  it('ELECTRON_RENDERER_URL の host/port を反映する', () => {
    const config = resolveDevRendererCspConfig({
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5199/',
    });
    expect(config.port).toBe(5199);
    expect(config.hosts).toContain('127.0.0.1');
    expect(buildDevWebRequestFilterUrls(config)).toContain('http://127.0.0.1:5199/*');
    expect(buildDevRendererContentSecurityPolicy(config)).toContain('http://127.0.0.1:5199');
  });

  it('不正 URL は既定ポート 5173 にフォールバックする', () => {
    const config = resolveDevRendererCspConfig({
      ELECTRON_RENDERER_URL: 'not-a-url',
    });
    expect(config.port).toBe(5173);
    expect(config.hosts).toContain('[::1]');
  });
});
