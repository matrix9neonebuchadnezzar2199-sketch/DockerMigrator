import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

import { ErrorCodes } from '@shared/codes.js';
import type { ComposeImportRequest, DmigManifest } from '@shared/types.js';
import { ComposeImporter } from '../core/ComposeImporter.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  makeTempDirManager,
  writePackageManifest,
} from '../core/__test-fixtures__/index.js';
import { registerComposeHandlers } from './compose.js';
import type { IpcInvokeHandler } from '../test-utils/ipcHarness.js';

type ImportComposeResult =
  | { ok: true; data: undefined }
  | { ok: false; error: { code: string; detail?: string } };

const { ipcHandlers } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, IpcInvokeHandler>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, fn: IpcInvokeHandler) {
      ipcHandlers.set(channel, fn);
    },
    removeHandler(channel: string) {
      ipcHandlers.delete(channel);
    },
  },
}));

function makeImportReq(packageDir: string): ComposeImportRequest {
  return {
    packageDir,
    selectedProjects: ['proj1'],
    destinationDirs: { proj1: packageDir },
    jobToken: randomUUID(),
  };
}

describe('dmig:importCompose (U6-01)', () => {
  const tmp = makeTempDirManager();
  let importProjectsSpy: { mock: { calls: unknown[][] } };

  const fakeWin = {
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow;

  beforeEach(() => {
    ipcHandlers.clear();
    registerComposeHandlers({ win: fakeWin, docker: makeDockerAdapterMock() });
    importProjectsSpy = vi.spyOn(ComposeImporter.prototype, 'importProjects').mockResolvedValue(
      undefined,
    ) as unknown as { mock: { calls: unknown[][] } };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    ipcHandlers.clear();
    await tmp.cleanupAll();
  });

  async function invoke(packageDir: string): Promise<ImportComposeResult> {
    const fn = ipcHandlers.get('dmig:importCompose');
    if (!fn) {
      throw new Error('dmig:importCompose handler not registered');
    }
    const event = {
      sender: {
        isDestroyed: () => false,
        send: vi.fn(),
      },
    };
    return fn(event, makeImportReq(packageDir)) as Promise<ImportComposeResult>;
  }

  it('正常 manifest (1.x) → openAsBase 経由で importProjects 成功', async () => {
    const pkgDir = await tmp.create('dmig-import-compose-');
    const manifest: DmigManifest = makeManifest({ dmigVersion: '1.1' });
    await writePackageManifest(pkgDir, manifest);

    const res = await invoke(pkgDir);

    expect(res.ok).toBe(true);
    expect(importProjectsSpy).toHaveBeenCalledOnce();
    const passedManifest = importProjectsSpy.mock.calls[0][1] as DmigManifest;
    expect(passedManifest.dmigVersion).toBe('1.1');
  });

  it('旧 manifest (0.2.0-poc) → E5002、importProjects は呼ばれない', async () => {
    const pkgDir = await tmp.create('dmig-import-compose-legacy-');
    await writePackageManifest(pkgDir, makeManifest({ dmigVersion: '0.2.0-poc' }));

    const res = await invoke(pkgDir);

    expect(res.ok).toBe(false);
    if (res.ok) {
      throw new Error('expected failure');
    }
    expect(res.error.code).toBe(ErrorCodes.PACK_VERSION_INCOMPATIBLE);
    expect(importProjectsSpy).not.toHaveBeenCalled();
  });

  it('manifest 不在 → PACK_FORMAT_INVALID、importProjects は呼ばれない', async () => {
    const pkgDir = await tmp.create('dmig-import-compose-nomanifest-');

    const res = await invoke(pkgDir);

    expect(res.ok).toBe(false);
    if (res.ok) {
      throw new Error('expected failure');
    }
    expect(res.error.code).toBe(ErrorCodes.PACK_FORMAT_INVALID);
    expect(importProjectsSpy).not.toHaveBeenCalled();
  });
});
