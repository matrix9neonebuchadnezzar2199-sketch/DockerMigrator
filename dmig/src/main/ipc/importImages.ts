import { ipcMain } from 'electron';
import { Importer } from '../core/Importer.js';
import { jobRegistry } from '../core/JobRegistry.js';
import { ResumableScanner } from '../core/ResumableScanner.js';
import type {
  ImportRequest,
  ListResumablePackagesRequest,
  ProgressEvent,
  ProbeSummary,
} from '@shared/types.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import type { HandlerDeps } from './shared.js';
import { toPayload } from './shared.js';

export function registerImageImportHandlers(deps: HandlerDeps): void {
  const { win, docker } = deps;

  ipcMain.handle('dmig:import', async (_e, req: ImportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const importer = new Importer(docker);
    const tracker = new ProgressTracker();
    const onProg = (ev: ProgressEvent) => {
      win.webContents.send('dmig:progress', tracker.enrich(ev));
    };
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

  ipcMain.handle('dmig:readManifest', async (_e, packageDir: string) => {
    try {
      const importer = new Importer(docker);
      return { ok: true as const, data: await importer.readManifest(packageDir) };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:probePackage', async (_e, packageDir: string) => {
    try {
      const importer = new Importer(docker);
      const summary: ProbeSummary = await importer.probe(packageDir);
      return { ok: true as const, data: summary };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:listResumablePackages', async (_e, req: ListResumablePackagesRequest) => {
    try {
      const importer = new Importer(docker);
      const scanner = new ResumableScanner((packageDir) => importer.probe(packageDir));
      const data = await scanner.scan(req);
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });
}
