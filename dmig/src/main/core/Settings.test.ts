import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsStore } from './Settings.js';

vi.mock('write-file-atomic', () => ({
  default: vi.fn(async (path: string, data: string) => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, data, 'utf8');
  }),
}));

describe('SettingsStore', () => {
  let dir: string;

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  async function freshStore(): Promise<SettingsStore> {
    dir = await mkdtemp(join(tmpdir(), 'dmig-settings-'));
    return SettingsStore.forDirectory(dir);
  }

  it('ファイル不在時の read() → 空オブジェクト', async () => {
    const store = await freshStore();
    await expect(store.read()).resolves.toEqual({});
  });

  it('JSON 不正時の read() → 空オブジェクト', async () => {
    const store = await freshStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'dmig-settings.json'), '{not json', 'utf8');
    await expect(store.read()).resolves.toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it('update() → 既存フィールドを保持しつつ patch をマージ', async () => {
    const store = await freshStore();
    await store.update({ welcomeWizardCompleted: true });
    const next = await store.update({ welcomeWizardLastShownAt: '2026-05-19T00:00:00.000Z' });
    expect(next).toEqual({
      welcomeWizardCompleted: true,
      welcomeWizardLastShownAt: '2026-05-19T00:00:00.000Z',
    });
    const raw = await readFile(join(dir, 'dmig-settings.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(next);
  });

  it('write-file-atomic 経由で書き込む', async () => {
    const store = await freshStore();
    const atomic = vi.mocked((await import('write-file-atomic')).default);
    await store.update({ welcomeWizardCompleted: true });
    expect(atomic).toHaveBeenCalled();
  });
});
