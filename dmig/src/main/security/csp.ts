import { session } from 'electron';

/** electron-vite 既定の Vite dev server ポート（vite.config で変更したらここも更新） */
export const DEV_RENDERER_PORT = 5173;

const DEV_LOCALHOST = `http://localhost:${DEV_RENDERER_PORT}`;
const DEV_LOOPBACK = `http://127.0.0.1:${DEV_RENDERER_PORT}`;
const DEV_WS_LOCALHOST = `ws://localhost:${DEV_RENDERER_PORT}`;
const DEV_WS_LOOPBACK = `ws://127.0.0.1:${DEV_RENDERER_PORT}`;

/**
 * 本番（file://）向け CSP。`renderer/index.html` の meta と同一内容を維持すること。
 * connect-src は Renderer が HTTP を使わない前提で none。
 */
export const PROD_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Vite HMR / React Refresh 用の開発 CSP（localhost:5173 のみ） */
export function buildDevContentSecurityPolicy(): string {
  const httpOrigins = [DEV_LOCALHOST, DEV_LOOPBACK].join(' ');
  const connect = ["'self'", DEV_LOCALHOST, DEV_LOOPBACK, DEV_WS_LOCALHOST, DEV_WS_LOOPBACK].join(
    ' ',
  );
  return [
    `default-src 'self' ${httpOrigins}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${httpOrigins}`,
    `style-src 'self' 'unsafe-inline' ${httpOrigins}`,
    `img-src 'self' data: ${httpOrigins}`,
    `font-src 'self' ${httpOrigins}`,
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
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
 * 開発時のみ Vite 応答に CSP ヘッダを付与する。本番は index.html meta に委ねる。
 * `app.whenReady()` より前に呼ぶこと。
 */
export function installContentSecurityPolicy(isPackaged: boolean): void {
  if (isPackaged) {
    return;
  }

  const devCsp = buildDevContentSecurityPolicy();

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
