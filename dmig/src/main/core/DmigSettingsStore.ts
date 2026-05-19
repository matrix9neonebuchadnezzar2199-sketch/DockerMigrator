import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_DMIG_SETTINGS, type DmigSettings } from '@shared/settings.js';

/**
 * userData 配下の dmig-settings.json を読み書きする。
 */
export class DmigSettingsStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'dmig-settings.json');
  }

  async load(): Promise<DmigSettings> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DmigSettings>;
      return { ...DEFAULT_DMIG_SETTINGS, ...parsed };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return { ...DEFAULT_DMIG_SETTINGS };
      throw e;
    }
  }

  async save(patch: Partial<DmigSettings>): Promise<DmigSettings> {
    const current = await this.load();
    const next: DmigSettings = { ...current, ...patch };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}
