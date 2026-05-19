import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeDockerAdapterMock, makeTempDirManager } from '../core/__test-fixtures__/index.js';
import { RollbackManager } from '../core/RollbackManager.js';
import { createRollbackRecord } from '../core/rollbackRecordBuilder.js';
import type { IpcInvokeHandler } from '../test-utils/ipcHarness.js';
import { registerRollbackHandlers } from './rollback.js';

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

describe('registerRollbackHandlers', () => {
  const tmp = makeTempDirManager();

  beforeEach(() => {
    ipcHandlers.clear();
    registerRollbackHandlers({
      win: { webContents: { send: vi.fn() } } as never,
      docker: makeDockerAdapterMock(),
    });
  });

  afterEach(() => {
    ipcHandlers.clear();
  });

  it('listRollbacks: 正常応答', async () => {
    const root = await tmp.create('ipc-rb-list-');
    const fn = ipcHandlers.get('dmig:listRollbacks');
    const r = (await fn!({ sender: {} }, { rootDir: root, maxDepth: 1 })) as {
      ok: boolean;
      data?: { records: unknown[] };
    };
    expect(r.ok).toBe(true);
    expect(r.data?.records).toEqual([]);
  });

  it('loadRollbackRecord + runRollback', async () => {
    const pack = await tmp.create('ipc-rb-pack-');
    await writeFile(join(pack, 'manifest.json'), '{"dmigVersion":"1.0.0"}', 'utf-8');
    const mgr = new RollbackManager(makeDockerAdapterMock());
    await mgr.saveRecord(pack, createRollbackRecord(pack, 'export', []));

    const loadFn = ipcHandlers.get('dmig:loadRollbackRecord');
    const loaded = (await loadFn!({ sender: {} }, pack)) as {
      ok: boolean;
      data?: { kind: string };
    };
    expect(loaded.ok).toBe(true);
    expect(loaded.data?.kind).toBe('export');

    const runFn = ipcHandlers.get('dmig:runRollback');
    const ran = (await runFn!({ sender: {} }, { packageDir: pack })) as {
      ok: boolean;
      data?: { warnings: string[] };
    };
    expect(ran.ok).toBe(true);
    expect(ran.data?.warnings).not.toContain('already_executed');
  });
});
