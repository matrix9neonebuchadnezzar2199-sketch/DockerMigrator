import { ipcMain, BrowserWindow, dialog } from 'electron';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { DockerAdapter } from './core/DockerAdapter.js';
import { Exporter } from './core/Exporter.js';
import { Importer } from './core/Importer.js';
import { ComposeExporter } from './core/ComposeExporter.js';
import { ComposeImporter } from './core/ComposeImporter.js';
import { VolumeExporter } from './core/VolumeExporter.js';
import { SecretScanner } from './core/SecretScanner.js';
import { jobRegistry } from './core/JobRegistry.js';
import { DmigError } from './core/errors/DmigError.js';
import { ErrorCodes, ErrorMessages } from './core/errors/codes.js';
import type {
  ExportRequest,
  ImportRequest,
  ProgressEvent,
  DmigErrorPayload,
  DmigManifest,
  ComposeExportRequest,
  ComposeImportRequest,
  ComposeProjectInfo,
  SecretScanResult,
  JobToken,
  CancelResult,
  PreflightRequest,
  ErrorReportRequest,
} from '@shared/types.js';
import { SpaceChecker } from './core/SpaceChecker.js';
import { SizeEstimator } from './core/SizeEstimator.js';
import { ErrorReporter } from './core/ErrorReporter.js';
import { ProgressTracker } from './core/ProgressTracker.js';

/**
 * Renderer ↔ Main の通信定義。
 */
export function registerIpcHandlers(win: BrowserWindow) {
  const docker = new DockerAdapter();

  ipcMain.handle('dmig:ping', async () => {
    try {
      return { ok: true as const, data: await docker.ping() };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:listImages', async () => {
    try {
      return { ok: true as const, data: await docker.listImages() };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:cancel', async (_e, jobToken: JobToken) => {
    try {
      const result: CancelResult = jobRegistry.cancel(jobToken);
      return { ok: true as const, data: result };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:export', async (_e, req: ExportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const exporter = new Exporter(docker);
    const tracker = new ProgressTracker();
    const onProg = (ev: ProgressEvent) => {
      win.webContents.send('dmig:progress', tracker.enrich(ev));
    };
    exporter.on('progress', onProg);
    try {
      const manifest = await exporter.exportImages(req, controller.signal);
      return { ok: true as const, data: manifest };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    } finally {
      exporter.off('progress', onProg);
      jobRegistry.unregister(req.jobToken);
    }
  });

  ipcMain.handle('dmig:import', async (_e, req: ImportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const importer = new Importer(docker);
    const tracker = new ProgressTracker();
    const onProg = (ev: ProgressEvent) => {
      win.webContents.send('dmig:progress', tracker.enrich(ev));
    };
    importer.on('progress', onProg);
    try {
      await importer.importImages(req, controller.signal);
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

  // ─────────────────────────────────────────────────────────────
  // Phase 5: Compose プロジェクト関連
  // ─────────────────────────────────────────────────────────────

  ipcMain.handle('dmig:listComposeProjects', async () => {
    try {
      const projects = await docker.listComposeProjects();
      return { ok: true as const, data: projects };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle(
    'dmig:scanSecrets',
    async (_e, projects: ComposeProjectInfo[]) => {
      try {
        const scanner = new SecretScanner();
        const result: Record<string, SecretScanResult[]> = {};

        for (const proj of projects) {
          const scans: SecretScanResult[] = [];
          for (const env of proj.envFiles) {
            let exists = false;
            try {
              await fsp.access(env.path);
              exists = true;
            } catch {
              /* ファイルなし */
            }
            if (!exists) continue;

            const scan = await scanner.scanFile(env.path);
            if (scan.findings.length > 0) {
              scans.push(scan);
            }
          }
          if (scans.length > 0) {
            result[proj.name] = scans;
          }
        }
        return { ok: true as const, data: result };
      } catch (e) {
        return { ok: false as const, error: toPayload(e) };
      }
    },
  );

  ipcMain.handle('dmig:listVolumes', async () => {
    try {
      return { ok: true as const, data: await docker.listVolumes() };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:exportCompose', async (_e, req: ComposeExportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const exporter = new Exporter(docker);
    const volumeExporter = new VolumeExporter(docker);
    const composeExporter = new ComposeExporter(docker, exporter, volumeExporter);

    const tracker = new ProgressTracker();
    const progressForwarder = (ev: ProgressEvent) => {
      win.webContents.send('dmig:progress', tracker.enrich(ev));
    };
    composeExporter.on('progress', progressForwarder);
    exporter.on('progress', progressForwarder);
    volumeExporter.on('progress', progressForwarder);

    try {
      const allProjects = await docker.listComposeProjects();
      const targets = allProjects.filter((p) => req.projectNames.includes(p.name));
      if (targets.length === 0) {
        return {
          ok: false as const,
          error: {
            code: ErrorCodes.COMPOSE_NOT_FOUND,
            message: ErrorMessages[ErrorCodes.COMPOSE_NOT_FOUND],
            detail: `projectNames=${req.projectNames.join(',')}`,
          },
        };
      }

      try {
        await fsp.access(req.outputDir);
      } catch {
        return {
          ok: false as const,
          error: {
            code: ErrorCodes.USB_PATH_NOT_FOUND,
            message: ErrorMessages[ErrorCodes.USB_PATH_NOT_FOUND],
            detail: `path=${req.outputDir}`,
          },
        };
      }

      const packName =
        req.packName ??
        `dmig-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
      const packDir = join(req.outputDir, `${packName}.dmig`);
      await fsp.mkdir(packDir, { recursive: true });

      const result = await composeExporter.exportProjects(req, packDir, targets, controller.signal);

      const ping = await docker.ping().catch(() => ({ version: 'unknown' }));
      const manifest: DmigManifest = {
        dmigVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        source: {
          os: process.platform,
          arch: process.arch,
          dockerVersion: ping.version,
          appVersion: '0.1.0-poc',
        },
        contents: {
          images: result.imageEntries,
          volumes: result.volumeEntries,
          composeProjects: result.composeEntries,
        },
        totalSize:
          result.imageEntries.reduce((s, e) => s + e.compressedSize, 0) +
          result.volumeEntries.reduce((s, e) => s + e.compressedSize, 0),
      };

      await fsp.writeFile(join(packDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

      const checksumLines: string[] = [];
      for (const img of result.imageEntries) {
        checksumLines.push(`${img.sha256}  ${img.filename}`);
      }
      for (const vol of result.volumeEntries) {
        checksumLines.push(`${vol.sha256}  ${vol.filename}`);
      }
      await fsp.writeFile(join(packDir, 'checksums.sha256'), `${checksumLines.join('\n')}\n`, 'utf-8');

      return { ok: true as const, data: { manifest, packDir } };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    } finally {
      composeExporter.off('progress', progressForwarder);
      exporter.off('progress', progressForwarder);
      volumeExporter.off('progress', progressForwarder);
      jobRegistry.unregister(req.jobToken);
    }
  });

  ipcMain.handle('dmig:importCompose', async (_e, req: ComposeImportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const importer = new Importer(docker);
    const volumeExporter = new VolumeExporter(docker);
    const composeImporter = new ComposeImporter(docker, importer, volumeExporter);

    const tracker = new ProgressTracker();
    const progressForwarder = (ev: ProgressEvent) => {
      win.webContents.send('dmig:progress', tracker.enrich(ev));
    };
    composeImporter.on('progress', progressForwarder);
    importer.on('progress', progressForwarder);
    volumeExporter.on('progress', progressForwarder);

    try {
      const manifestPath = join(req.packageDir, 'manifest.json');
      const txt = await fsp.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(txt) as DmigManifest;

      await composeImporter.importProjects(req, manifest, controller.signal);
      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    } finally {
      composeImporter.off('progress', progressForwarder);
      importer.off('progress', progressForwarder);
      volumeExporter.off('progress', progressForwarder);
      jobRegistry.unregister(req.jobToken);
    }
  });

  ipcMain.handle('dmig:preflight', async (_e, req: PreflightRequest) => {
    try {
      try {
        await fsp.access(req.outputDir);
      } catch {
        return {
          ok: false as const,
          error: {
            code: ErrorCodes.USB_PATH_NOT_FOUND,
            message: ErrorMessages[ErrorCodes.USB_PATH_NOT_FOUND],
            detail: `path=${req.outputDir}`,
          },
        };
      }

      const estimator = new SizeEstimator(docker);
      const checker = new SpaceChecker();

      let estimate: Awaited<ReturnType<SizeEstimator['estimateForCompose']>>;

      if (req.projectNames && req.projectNames.length > 0) {
        const allProjects = await docker.listComposeProjects();
        const targets = allProjects.filter((p) => req.projectNames!.includes(p.name));
        if (targets.length === 0) {
          return {
            ok: false as const,
            error: {
              code: ErrorCodes.COMPOSE_NOT_FOUND,
              message: ErrorMessages[ErrorCodes.COMPOSE_NOT_FOUND],
              detail: `projectNames=${req.projectNames.join(',')}`,
            },
          };
        }
        estimate = await estimator.estimateForCompose(targets);
      } else if (req.imageNames && req.imageNames.length > 0) {
        estimate = await estimator.estimateForImages(req.imageNames);
      } else {
        return {
          ok: false as const,
          error: {
            code: ErrorCodes.PREFLIGHT_FAILED,
            message: ErrorMessages[ErrorCodes.PREFLIGHT_FAILED],
            detail: 'projectNames または imageNames を指定してください',
          },
        };
      }

      const space = await checker.check(req.outputDir, estimate.totalEstimated);

      const warnings: string[] = [];
      if (space.status === 'warning') {
        warnings.push(ErrorMessages[ErrorCodes.DISK_SPACE_WARNING]);
      }

      return { ok: true as const, data: { estimate, space, warnings } };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:saveErrorReport', async (_e, req: ErrorReportRequest) => {
    try {
      const reporter = new ErrorReporter();
      const result = await reporter.generate(req);
      return { ok: true as const, data: result };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle(
    'dmig:selectDirectory',
    async (_e, options: { title?: string; defaultPath?: string }) => {
      try {
        const dlgResult = await dialog.showOpenDialog(win, {
          title: options?.title ?? 'フォルダを選択',
          defaultPath: options?.defaultPath,
          properties: ['openDirectory', 'createDirectory'],
        });
        if (dlgResult.canceled || dlgResult.filePaths.length === 0) {
          return { ok: true as const, data: null };
        }
        return { ok: true as const, data: dlgResult.filePaths[0] };
      } catch (e) {
        return { ok: false as const, error: toPayload(e) };
      }
    },
  );
}

function toPayload(e: unknown): DmigErrorPayload {
  if (e instanceof DmigError) return e.toPayload();
  return {
    code: ErrorCodes.UNKNOWN_ERROR,
    message: ErrorMessages[ErrorCodes.UNKNOWN_ERROR],
    detail: e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e),
  };
}
