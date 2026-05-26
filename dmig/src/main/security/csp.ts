import { session } from 'electron';

import {
  DEV_RENDERER_PORT,
  PROD_RENDERER_CONTENT_SECURITY_POLICY,
  buildDevRendererContentSecurityPolicy,
} from '@shared/rendererCsp.js';

export { DEV_RENDERER_PORT };

const DEV_LOCALHOST = `http://localhost:${DEV_RENDERER_PORT}`;
const DEV_LOOPBACK = `http://127.0.0.1:${DEV_RENDERER_PORT}`;

/** 本番 CSP 文字列（@shared/rendererCsp と同一） */
export const PROD_CONTENT_SECURITY_POLICY = PROD_RENDERER_CONTENT_SECURITY_POLICY;

/** @deprecated buildDevRendererContentSecurityPolicy を使用 */
export function buildDevContentSecurityPolicy(): string {
  return buildDevRendererContentSecurityPolicy();
}

function isDevRendererUrl(url: string): boolean {
  return (
    url.startsWith(`${DEV_LOCALHOST}/`) ||
    url === DEV_LOCALHOST ||
    url.startsWith(`${DEV_LOOPBACK}/`) ||
    url === DEV_LOOPBACK
  );
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

  const devCsp = buildDevRendererContentSecurityPolicy();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isDevRendererUrl(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [devCsp];
    callback({ responseHeaders: headers });
  });
}
