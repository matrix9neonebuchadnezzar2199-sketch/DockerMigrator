import { ipcMain } from 'electron';
import type { DmigSettings } from '@shared/settings.js';
import { DmigSettingsStore } from '../core/DmigSettingsStore.js';
import { toPayload } from './shared.js';

const store = new DmigSettingsStore();

export function registerSettingsHandlers(): void {
  ipcMain.handle('dmig:getSettings', async () => {
    try {
      return { ok: true as const, data: await store.load() };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:updateSettings', async (_e, patch: Partial<DmigSettings>) => {
    try {
      return { ok: true as const, data: await store.save(patch) };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });
}
