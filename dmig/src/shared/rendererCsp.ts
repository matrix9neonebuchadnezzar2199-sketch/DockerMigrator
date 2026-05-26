/** electron-vite 既定の Vite dev server ポート（変更時は resolveDevRendererCspConfig のフォールバックと同期） */
export const DEV_RENDERER_PORT = 5173;

const DEFAULT_DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

/** 開発時 CSP / webRequest フィルタの解決結果 */
export interface DevRendererCspConfig {
  port: number;
  hosts: readonly string[];
  /** Vite 応答のスキーム（通常 http） */
  httpScheme: 'http' | 'https';
}

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

function originUrl(host: string, port: number, scheme: 'http' | 'https'): string {
  return `${scheme}://${host}:${port}`;
}

function wsOriginUrl(host: string, port: number, scheme: 'http' | 'https'): string {
  return scheme === 'https' ? `wss://${host}:${port}` : `ws://${host}:${port}`;
}

/** `ELECTRON_RENDERER_URL` があれば host/port を反映。未設定時は 5173 + ループバック群。 */
export function resolveDevRendererCspConfig(
  env: NodeJS.ProcessEnv = process.env,
): DevRendererCspConfig {
  const raw = env.ELECTRON_RENDERER_URL?.trim();
  if (!raw) {
    return {
      port: DEV_RENDERER_PORT,
      hosts: DEFAULT_DEV_HOSTS,
      httpScheme: 'http',
    };
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        port: DEV_RENDERER_PORT,
        hosts: DEFAULT_DEV_HOSTS,
        httpScheme: 'http',
      };
    }

    const httpScheme: 'http' | 'https' = parsed.protocol === 'https:' ? 'https' : 'http';
    const port = parsed.port
      ? Number(parsed.port)
      : httpScheme === 'https'
        ? 443
        : 80;
    const hosts = new Set<string>(DEFAULT_DEV_HOSTS);
    if (parsed.hostname) {
      hosts.add(parsed.hostname);
    }

    return { port, hosts: [...hosts], httpScheme };
  } catch {
    return {
      port: DEV_RENDERER_PORT,
      hosts: DEFAULT_DEV_HOSTS,
      httpScheme: 'http',
    };
  }
}

/** 開発サーバー応答向けの http / ws オリジン一覧 */
export function listDevRendererOrigins(config: DevRendererCspConfig): {
  httpOrigins: string[];
  connectOrigins: string[];
} {
  const httpOrigins: string[] = [];
  const connectOrigins: string[] = ["'self'"];

  for (const host of config.hosts) {
    const http = originUrl(host, config.port, config.httpScheme);
    const ws = wsOriginUrl(host, config.port, config.httpScheme);
    httpOrigins.push(http);
    connectOrigins.push(http, ws);
  }

  return { httpOrigins, connectOrigins };
}

/** Electron `webRequest` の `filter.urls` 用パターン */
export function buildDevWebRequestFilterUrls(config: DevRendererCspConfig): string[] {
  const patterns = new Set<string>();
  for (const host of config.hosts) {
    patterns.add(`${config.httpScheme}://${host}:${config.port}/*`);
    const wsScheme = config.httpScheme === 'https' ? 'wss' : 'ws';
    patterns.add(`${wsScheme}://${host}:${config.port}/*`);
  }
  return [...patterns];
}

/** Vite HMR / React Refresh 用の開発 CSP */
export function buildDevRendererContentSecurityPolicy(
  config: DevRendererCspConfig = resolveDevRendererCspConfig(),
): string {
  const { httpOrigins, connectOrigins } = listDevRendererOrigins(config);
  const httpList = httpOrigins.join(' ');
  const connect = connectOrigins.join(' ');

  return [
    `default-src 'self' ${httpList}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${httpList}`,
    `style-src 'self' 'unsafe-inline' ${httpList}`,
    `img-src 'self' data: ${httpList}`,
    `font-src 'self' ${httpList}`,
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** 本番ビルドの index.html に注入する meta タグ（electron.vite.config と同一） */
export function buildProdRendererCspMetaTag(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${PROD_RENDERER_CONTENT_SECURITY_POLICY}" />`;
}

/** 本番ビルド向け index.html 変換（Vite transformIndexHtml と同じ置換） */
export function injectProdRendererCspMeta(html: string): string {
  return html.replace('<head>', `<head>\n    ${buildProdRendererCspMetaTag()}`);
}
