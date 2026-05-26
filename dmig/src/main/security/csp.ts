import { session } from 'electron';

import {
  buildDevRendererContentSecurityPolicy,
  buildDevWebRequestFilterUrls,
  resolveDevRendererCspConfig,
  PROD_RENDERER_CONTENT_SECURITY_POLICY,
} from '@shared/rendererCsp.js';

export { DEV_RENDERER_PORT } from '@shared/rendererCsp.js';
export { PROD_RENDERER_CONTENT_SECURITY_POLICY as PROD_CONTENT_SECURITY_POLICY };

/** @deprecated buildDevRendererContentSecurityPolicy を使用 */
export function buildDevContentSecurityPolicy(): string {
  return buildDevRendererContentSecurityPolicy();
}

function mergeCspResponseHeaders(
  responseHeaders: Record<string, string | string[] | undefined>,
  cspValue: string,
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(responseHeaders)) {
    if (value === undefined) {
      continue;
    }
    if (key.toLowerCase() === 'content-security-policy') {
      continue;
    }
    headers[key] = value;
  }
  headers['Content-Security-Policy'] = [cspValue];
  return headers;
}

/**
 * 開発時は Vite 応答に dev CSP ヘッダを付与する。
 * 本番（packaged）は renderer ビルド時に index.html へ注入した meta に委ねる。
 * `app.whenReady()` 内で `createWindow()` より前に 1 回だけ呼ぶこと。
 */
export function installContentSecurityPolicy(isPackaged: boolean): void {
  if (isPackaged) {
    return;
  }

  const config = resolveDevRendererCspConfig();
  const devCsp = buildDevRendererContentSecurityPolicy(config);
  const filter = { urls: buildDevWebRequestFilterUrls(config) };

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    callback({
      responseHeaders: mergeCspResponseHeaders(details.responseHeaders ?? {}, devCsp),
    });
  });
}
