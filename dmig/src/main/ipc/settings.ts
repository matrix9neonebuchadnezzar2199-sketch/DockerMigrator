import { ipcMain } from 'electron';

import { getSettingsStore } from '../core/Settings.js';
import type { DmigSettings } from '@shared/types.js';
import { toPayload } from './shared.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle('dmig:getSettings', async () => {
    try {
      const data = await getSettingsStore().read();
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:updateSettings', async (_evt, patch: Partial<DmigSettings>) => {
    try {
      const data = await getSettingsStore().update(patch);
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });
}
