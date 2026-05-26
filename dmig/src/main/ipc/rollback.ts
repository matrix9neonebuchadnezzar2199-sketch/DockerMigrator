import { ipcMain } from 'electron';

import { jobRegistry } from '../core/JobRegistry.js';
import { RollbackManager } from '../core/RollbackManager.js';
import type {
  ListRollbacksRequest,
  RunRollbackRequest,
} from '@shared/types.js';
import {
  listRollbacksRequestSchema,
  packageDirSchema,
  runRollbackRequestSchema,
} from '@shared/ipcSchemas.js';
import type { HandlerDeps } from './shared.js';
import { toPayload } from './shared.js';
import { parseIpcArgs } from './ipcValidate.js';

export function registerRollbackHandlers(deps: HandlerDeps): void {
  const manager = new RollbackManager(deps.docker);

  ipcMain.handle('dmig:listRollbacks', async (_e, raw: unknown) => {
    let req: ListRollbacksRequest;
    try {
      req = parseIpcArgs(listRollbacksRequestSchema, raw, 'dmig:listRollbacks');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    try {
      const data = await manager.listRecords(req);
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:loadRollbackRecord', async (_e, raw: unknown) => {
    let packageDir: string;
    try {
      packageDir = parseIpcArgs(packageDirSchema, raw, 'dmig:loadRollbackRecord');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    try {
      const data = await manager.loadRecord(packageDir);
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:runRollback', async (_e, raw: unknown) => {
    let req: RunRollbackRequest;
    try {
      req = parseIpcArgs(runRollbackRequestSchema, raw, 'dmig:runRollback');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    const controller = jobRegistry.register(req.jobToken);
    try {
      const data = await manager.executeRollback(
        req.packageDir,
        req.entryIds,
        controller.signal,
      );
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    } finally {
      jobRegistry.unregister(req.jobToken);
    }
  });
}
