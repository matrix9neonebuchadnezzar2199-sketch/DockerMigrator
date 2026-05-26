import type { BrowserWindow } from 'electron';

import { DEV_RENDERER_PORT } from './csp.js';

function isAllowedMainNavigation(url: string, isDev: boolean): boolean {
  if (url === 'about:blank') {
    return true;
  }

  if (isDev) {
    const devHttpPrefix = [`http://localhost:${DEV_RENDERER_PORT}`, `http://127.0.0.1:${DEV_RENDERER_PORT}`];
    return devHttpPrefix.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
  }

  return url.startsWith('file://');
}

/**
 * 外部 URL への遷移と子ウィンドウ生成を拒否する。
 * `loadURL` / `loadFile` の前に呼ぶこと。
 */
export function attachNavigationGuards(win: BrowserWindow, isDev: boolean): void {
  const wc = win.webContents;

  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  wc.on('will-navigate', (event, url) => {
    if (!isAllowedMainNavigation(url, isDev)) {
      event.preventDefault();
    }
  });

  wc.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}
