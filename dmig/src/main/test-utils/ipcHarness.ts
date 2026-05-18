import type { BrowserWindow } from 'electron';

import type { DockerAdapter } from '../core/DockerAdapter.js';
import { registerImageExportHandlers } from '../ipc/exportImages.js';
import type { HandlerDeps } from '../ipc/shared.js';

/** `ipcMain.handle` に渡すコールバックと同一シグネチャ（第 1 引数は invoke 側で `{}` を渡す）。 */
export type IpcInvokeHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

export interface IpcHarness {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  captureProgress(): Array<{ channel: string; payload: unknown }>;
  cleanup(): void;
}

/**
 * `vi.mock('electron')` で ipcMain.handle を Map に記録する前提で `registerImageExportHandlers` を登録する。
 *
 * テスト側で `handlers` と同一の Map を `ipcMain.handle` のモックから参照すること。
 */
export function setupImageExportIpcHarness(opts: {
  handlers: Map<string, IpcInvokeHandler>;
  docker: DockerAdapter;
}): IpcHarness {
  const progressRows: Array<{ channel: string; payload: unknown }> = [];

  const win = {
    webContents: {
      send: (channel: string, payload: unknown) => {
        progressRows.push({ channel, payload });
      },
    },
  } as unknown as BrowserWindow;

  const deps: HandlerDeps = { win, docker: opts.docker };
  registerImageExportHandlers(deps);

  return {
    async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      const fn = opts.handlers.get(channel);
      if (!fn) {
        throw new Error(`ipc handler not registered: ${channel}`);
      }
      return fn({}, ...args) as Promise<T>;
    },
    captureProgress: () => [...progressRows],
    cleanup: () => {
      progressRows.length = 0;
      opts.handlers.clear();
    },
  };
}
