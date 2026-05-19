import { BrowserWindow } from 'electron';
import { DockerAdapter } from './core/DockerAdapter.js';
import { registerSystemHandlers } from './ipc/system.js';
import { registerImageExportHandlers } from './ipc/exportImages.js';
import { registerImageImportHandlers } from './ipc/importImages.js';
import { registerComposeHandlers } from './ipc/compose.js';
import { registerPreflightHandlers } from './ipc/preflight.js';
import { registerDryRunHandlers } from './ipc/dryRun.js';
import { registerSnapshotHandlers } from './ipc/snapshot.js';
import { registerSettingsHandlers } from './ipc/settings.js';

/**
 * Renderer ↔ Main の通信定義。
 */
export function registerIpcHandlers(win: BrowserWindow): void {
  const docker = new DockerAdapter();
  const deps = { win, docker };

  registerSystemHandlers(deps);
  registerImageExportHandlers(deps);
  registerImageImportHandlers(deps);
  registerComposeHandlers(deps);
  registerPreflightHandlers(deps);
  registerDryRunHandlers(deps);
  registerSnapshotHandlers(deps);
  registerSettingsHandlers();
}
