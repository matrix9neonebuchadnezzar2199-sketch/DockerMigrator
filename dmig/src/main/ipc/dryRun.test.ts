import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { DryRunRequest } from '@shared/types.js';
import {
  makeDockerAdapterMock,
} from '../core/__test-fixtures__/index.js';
import type { IpcInvokeHandler } from '../test-utils/ipcHarness.js';
import { registerDryRunHandlers } from './dryRun.js';

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

describe('registerDryRunHandlers', () => {
  beforeEach(() => {
    ipcHandlers.clear();
  });

  afterEach(() => {
    ipcHandlers.clear();
  });

  async function invokeDryRun(req: DryRunRequest) {
    const docker = makeDockerAdapterMock();
    registerDryRunHandlers({
      win: { webContents: { send: vi.fn() } } as never,
      docker,
    });
    const fn = ipcHandlers.get('dmig:runDryRun');
    expect(fn).toBeDefined();
    return fn!({ sender: {} }, req) as Promise<{ ok: boolean; data?: { findings: unknown[]; warnings: string[] } }>;
  }

  it('compose-project: invalid_request で warnings のみ', async () => {
    const r = await invokeDryRun({ mode: 'compose-project' });
    expect(r.ok).toBe(true);
    expect(r.data?.warnings[0]).toContain('invalid_request');
    expect(r.data?.findings).toEqual([]);
  });

  it('export-pack: packageDir なしで imageNames なしは invalid_request', async () => {
    const r = await invokeDryRun({ mode: 'export-pack', outputDir: '/tmp/out' });
    expect(r.data?.warnings[0]).toContain('invalid_request');
  });

  it('export-pack: 新規は preflight 経由で findings が返る', async () => {
    const r = await invokeDryRun({
      mode: 'export-pack',
      outputDir: process.cwd(),
      imageNames: ['nginx:latest'],
    });
    expect(r.ok).toBe(true);
    expect(r.data?.findings?.length).toBeGreaterThan(0);
  });
});
