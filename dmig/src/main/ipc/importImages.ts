import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { Importer } from '../core/Importer.js';
import { jobRegistry } from '../core/JobRegistry.js';
import { ResumableScanner } from '../core/ResumableScanner.js';
import type {
  ImportRequest,
  ListResumablePackagesRequest,
  ProbeSummary,
} from '@shared/types.js';
import { ProgressTaskIds } from '@shared/progress.js';
import { createProgressRelay } from '../utils/progressIpc.js';
import {
  importRequestSchema,
  listResumablePackagesRequestSchema,
  packageDirSchema,
} from '@shared/ipcSchemas.js';
import type { HandlerDeps } from './shared.js';
import { toPayload } from './shared.js';
import { parseIpcArgs } from './ipcValidate.js';

export function registerImageImportHandlers(deps: HandlerDeps): void {
  const { docker } = deps;

  ipcMain.handle('dmig:import', async (event: IpcMainInvokeEvent, raw: unknown) => {
    let req: ImportRequest;
    try {
      req = parseIpcArgs(importRequestSchema, raw, 'dmig:import');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    const controller = jobRegistry.register(req.jobToken);
    const importer = new Importer(docker);
    const relay = createProgressRelay(event.sender);
    const onProg = relay.forwarder;
    importer.on('progress', onProg);
    try {
      const opened = await importer.openAsBase(req.packageDir);
      await importer.importImages(opened, req.selectedImages, controller.signal);
      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    } finally {
      importer.off('progress', onProg);
      jobRegistry.unregister(req.jobToken);
    }
  });

  ipcMain.handle('dmig:readManifest', async (_e, raw: unknown) => {
    let packageDir: string;
    try {
      packageDir = parseIpcArgs(packageDirSchema, raw, 'dmig:readManifest');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    try {
      const importer = new Importer(docker);
      return { ok: true as const, data: await importer.readManifest(packageDir) };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:probePackage', async (event: IpcMainInvokeEvent, raw: unknown) => {
    let packageDir: string;
    try {
      packageDir = parseIpcArgs(packageDirSchema, raw, 'dmig:probePackage');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    const relay = createProgressRelay(event.sender);
    try {
      await relay.emit({
        taskId: ProgressTaskIds.PROBE_PACKAGE,
        phase: 'discover',
        scope: 'scan',
        current: 0,
        total: 100,
        message: 'パッケージを検証しています…',
      });
      const importer = new Importer(docker);
      const summary: ProbeSummary = await importer.probe(packageDir);
      await relay.emit({
        taskId: ProgressTaskIds.PROBE_PACKAGE,
        phase: 'discover',
        scope: 'scan',
        current: 100,
        total: 100,
        message: 'パッケージの検証が完了しました',
      });
      return { ok: true as const, data: summary };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle(
    'dmig:listResumablePackages',
    async (event: IpcMainInvokeEvent, raw: unknown) => {
      let req: ListResumablePackagesRequest;
      try {
        req = parseIpcArgs(listResumablePackagesRequestSchema, raw, 'dmig:listResumablePackages');
      } catch (e) {
        return { ok: false as const, error: toPayload(e) };
      }
      const relay = createProgressRelay(event.sender);
      try {
        await relay.emit({
          taskId: ProgressTaskIds.RESUMABLE_SCAN,
          phase: 'discover',
          scope: 'scan',
          current: 0,
          total: 100,
          message: '中断パックを検索しています…',
        });
        const importer = new Importer(docker);
        const scanner = new ResumableScanner((packageDir) => importer.probe(packageDir));
        const data = await scanner.scan(req, async (info) => {
          const pct =
            info.total > 0 ? Math.min(99, Math.floor((info.current / info.total) * 100)) : 5;
          await relay.emit({
            taskId: ProgressTaskIds.RESUMABLE_SCAN,
            phase: 'discover',
            scope: 'scan',
            current: pct,
            total: 100,
            message: info.message,
          });
        });
        await relay.emit({
          taskId: ProgressTaskIds.RESUMABLE_SCAN,
          phase: 'discover',
          scope: 'scan',
          current: 100,
          total: 100,
          message:
            data.packages.length > 0
              ? `検索完了: 中断パック ${data.packages.length} 件`
              : '中断パックは見つかりませんでした',
        });
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: toPayload(e) };
      }
    },
  );
}
