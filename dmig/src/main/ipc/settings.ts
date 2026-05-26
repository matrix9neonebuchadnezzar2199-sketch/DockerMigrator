import { ipcMain } from 'electron';
import type { DmigSettings } from '@shared/settings.js';
import { DmigSettingsStore } from '../core/DmigSettingsStore.js';
import { settingsPatchSchema } from '@shared/ipcSchemas.js';
import { toPayload } from './shared.js';
import { parseIpcArgs } from './ipcValidate.js';

const store = new DmigSettingsStore();

export function registerSettingsHandlers(): void {
  ipcMain.handle('dmig:getSettings', async () => {
    try {
      return { ok: true as const, data: await store.load() };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:updateSettings', async (_e, raw: unknown) => {
    let patch: Partial<DmigSettings>;
    try {
      patch = parseIpcArgs(settingsPatchSchema, raw, 'dmig:updateSettings');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    try {
      return { ok: true as const, data: await store.save(patch) };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });
}
