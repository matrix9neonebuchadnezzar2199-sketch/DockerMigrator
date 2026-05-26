/** electron-vite 既定の Vite dev server ポート（変更時は main/security/csp.ts と同期） */
export const DEV_RENDERER_PORT = 5173;

/**
 * 本番 Renderer（file://）向け CSP。
 * connect-src は Renderer が HTTP を使わない前提で none。
 * frame-ancestors は meta では無効のため含めない（HTTP ヘッダ専用なら main 側で追加可）。
 */
export const PROD_RENDERER_CONTENT_SECURITY_POLICY = [
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
].join('; ');

/** Vite HMR / React Refresh 用の開発 CSP（localhost:5173 のみ） */
export function buildDevRendererContentSecurityPolicy(): string {
  const port = DEV_RENDERER_PORT;
  const devLocalhost = `http://localhost:${port}`;
  const devLoopback = `http://127.0.0.1:${port}`;
  const wsLocalhost = `ws://localhost:${port}`;
  const wsLoopback = `ws://127.0.0.1:${port}`;
  const httpOrigins = [devLocalhost, devLoopback].join(' ');
  const connect = ["'self'", devLocalhost, devLoopback, wsLocalhost, wsLoopback].join(' ');

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
