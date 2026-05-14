import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { registerIpcHandlers } from './ipc.js';
import { SnapshotStore } from './core/snapshot/SnapshotStore.js';
import './phase-core-entry.js';

const mainDir = dirname(fileURLToPath(import.meta.url));

function resolvePreload(): string {
  const candidates = ['index.mjs', 'index.js', 'index.cjs'].map((f) => join(mainDir, '../preload', f));
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`preload bundle not found under ${join(mainDir, '../preload')}`);
  }
  return found;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'dmig - Docker Migration Tool',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(mainDir, '../renderer/index.html'));
  }

  registerIpcHandlers(win);

  if (!app.isPackaged) {
    win.webContents.openDevTools();
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
