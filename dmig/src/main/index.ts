import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { registerIpcHandlers } from './ipc.js';
import { SnapshotStore } from './core/snapshot/SnapshotStore.js';
import { installContentSecurityPolicy } from './security/csp.js';
import { attachNavigationGuards } from './security/navigationGuards.js';
import './phase-core-entry.js';

installContentSecurityPolicy(app.isPackaged);

const mainDir = dirname(fileURLToPath(import.meta.url));

function resolvePreload(): string {
  // CJS ビルドは index.js / index.cjs。古い index.mjs が残っていても拾わないよう .js を先にする
  const candidates = ['index.js', 'index.cjs', 'index.mjs'].map((f) => join(mainDir, '../preload', f));
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`preload bundle not found under ${join(mainDir, '../preload')}`);
  }
  return found;
}

function createWindow() {
  const isDev = !app.isPackaged;

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'dmig - Docker Migration Tool',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachNavigationGuards(win, isDev);

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(mainDir, '../renderer/index.html'));
  }

  registerIpcHandlers(win);

  // 同ウィンドウにドックすると幅が狭い環境でレンダラーが 0px 付近になり「紺一色」に見えることがあるため detach
  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

void app.whenReady().then(async () => {
  try {
    await SnapshotStore.initialize(app.getPath('userData'));
    // eslint-disable-next-line no-console -- Phase 6: 起動時の初期化確認（DevTools）
    console.log('[main] SnapshotStore initialized');
  } catch (err) {
    console.error('[main] SnapshotStore initialization failed:', err);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
