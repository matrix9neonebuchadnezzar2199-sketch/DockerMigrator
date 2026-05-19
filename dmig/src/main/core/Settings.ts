import { app } from 'electron';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import writeFileAtomic from 'write-file-atomic';

import type { DmigSettings } from '@shared/types.js';

const SETTINGS_FILE = 'dmig-settings.json';

/**
 * `userData/dmig-settings.json` の読み書き。
 * 単一 Main プロセスからの利用を前提とする。
 */
export class SettingsStore {
  private cache: DmigSettings | null = null;

  private constructor(private readonly userDataDir: string) {}

  /** テスト用: 任意の userData ディレクトリでインスタンスを作る。 */
  static forDirectory(userDataDir: string): SettingsStore {
    return new SettingsStore(userDataDir);
  }

  private filePath(): string {
    return join(this.userDataDir, SETTINGS_FILE);
  }

  /**
   * 設定を読み込む。ファイル不在・JSON 不正時は空オブジェクトを返す。
   */
  async read(): Promise<DmigSettings> {
    if (this.cache !== null) {
      return { ...this.cache };
    }
    try {
      const raw = await fsp.readFile(this.filePath(), 'utf8');
      const parsed = JSON.parse(raw) as DmigSettings;
      this.cache = parsed;
      return { ...parsed };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('[SettingsStore] read failed, using defaults:', e);
      }
      this.cache = {};
      return {};
    }
  }

  /**
   * 設定をマージして保存する。
   *
   * Returns:
   *   保存後の設定全体。
   */
  async update(patch: Partial<DmigSettings>): Promise<DmigSettings> {
    const current = await this.read();
    const next: DmigSettings = { ...current, ...patch };
    const json = JSON.stringify(next, null, 2);
    await writeFileAtomic(this.filePath(), json, { encoding: 'utf8' });
    this.cache = next;
    return { ...next };
  }
}

let singleton: SettingsStore | null = null;

/** 本番用シングルトン（Electron userData）。 */
export function getSettingsStore(): SettingsStore {
  if (!singleton) {
    singleton = SettingsStore.forDirectory(app.getPath('userData'));
  }
  return singleton;
}
