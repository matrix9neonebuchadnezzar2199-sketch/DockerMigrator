import { ipcMain, BrowserWindow, dialog } from 'electron';
import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { DockerAdapter } from './core/DockerAdapter.js';
import { Exporter } from './core/Exporter.js';
import { Importer } from './core/Importer.js';
import { ComposeExporter } from './core/ComposeExporter.js';
import { ComposeImporter } from './core/ComposeImporter.js';
import { VolumeExporter } from './core/VolumeExporter.js';
import { SecretScanner } from './core/SecretScanner.js';
import { jobRegistry } from './core/JobRegistry.js';
import { DmigError, wrapError } from './core/errors/DmigError.js';
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
  ComposeLifecycleRequest,
  SecretScanResult,
  JobToken,
  CancelResult,
  PreflightRequest,
  ErrorReportRequest,
  DiffPreviewRequest,
  ProbeSummary,
} from '@shared/types.js';
import type { Snapshot } from '@shared/snapshot-types.js';
import { SnapshotStore } from './core/snapshot/SnapshotStore.js';
import { Snapshotter } from './core/snapshot/Snapshotter.js';
import { DiffEngine } from './core/diff/DiffEngine.js';
import { DiffPreview } from './core/diff/DiffPreview.js';
import { SpaceChecker } from './core/SpaceChecker.js';
import { SizeEstimator } from './core/SizeEstimator.js';
import { ErrorReporter } from './core/ErrorReporter.js';
import { ProgressTracker } from './core/ProgressTracker.js';

const execFile = promisify(execFileCb);

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
    let exportReq: ExportRequest = req;
    let baseSnap: Snapshot | null = null;
    let currentSnap: Snapshot | null = null;
    try {
      if (req.diffMode === 'delta') {
        const store = SnapshotStore.getInstance();
        baseSnap = req.baseSnapshotId
          ? await store.loadById(req.baseSnapshotId)
          : await store.loadLatest();
        if (!baseSnap) {
          return {
            ok: false as const,
            error: {
              code: ErrorCodes.NO_BASE_SNAPSHOT,
              message: ErrorMessages[ErrorCodes.NO_BASE_SNAPSHOT],
            },
          };
        }
        const snapshotter = new Snapshotter(docker);
        snapshotter.on('progress', onProg);
        try {
          currentSnap = await snapshotter.capture({
            volumeStrategy: req.volumeDiffStrategy ?? 'fast',
            signal: controller.signal,
            jobToken: req.jobToken,
          });
        } finally {
          snapshotter.off('progress', onProg);
        }
        const diff = new DiffEngine().compute(
          baseSnap,
          currentSnap,
          req.volumeDiffStrategy ?? 'fast',
        );
        const deltaRefs = new Set(
          diff.images.filter((e) => e.kind !== 'removed').map((e) => e.repoTags[0] ?? e.imageId),
        );
        const filtered = req.imageNames.filter((n) => deltaRefs.has(n));
        exportReq = {
          ...req,
          imageNames: filtered.length > 0 ? filtered : [...deltaRefs],
        };
        if (exportReq.imageNames.length === 0) {
          return {
            ok: false as const,
            error: {
              code: ErrorCodes.DIFF_COMPUTATION_FAILED,
              message: ErrorMessages[ErrorCodes.DIFF_COMPUTATION_FAILED],
              detail: '差分に該当するイメージがありません',
            },
          };
        }
      }

      const { manifest, packDir } = await exporter.exportImages(exportReq, controller.signal);

      if (req.diffMode === 'delta' && baseSnap && currentSnap) {
        applyDeltaManifestInPlace(manifest, baseSnap);
        try {
          await fsp.writeFile(join(packDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
        } catch (e) {
          console.warn('[ipc] delta manifest rewrite failed:', e);
        }
        if (req.autoSaveSnapshot !== false) {
          try {
            const store = SnapshotStore.getInstance();
            await store.save(currentSnap);
            await store.pruneOld();
          } catch (e) {
            console.warn('[ipc] snapshot auto-save failed:', e);
          }
        }
      }

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

  ipcMain.handle('dmig:probePackage', async (_e, packageDir: string) => {
    try {
      const importer = new Importer(docker);
      const summary: ProbeSummary = await importer.probe(packageDir);
      return { ok: true as const, data: summary };
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
      const estimator = new SizeEstimator(docker);
      const data: ComposeProjectInfo[] = await Promise.all(
        projects.map(async (proj) => {
          try {
            const est = await estimator.estimateForCompose([proj]);
            return { ...proj, estimatedSize: est.totalEstimated };
          } catch {
            return { ...proj, estimatedSize: proj.estimatedSize };
          }
        }),
      );
      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:composeLifecycle', async (_e, req: ComposeLifecycleRequest) => {
    try {
      const all = await docker.listComposeProjects();
      const proj = all.find((p) => p.name === req.projectName);
      if (!proj) {
        return {
          ok: false as const,
          error: {
            code: ErrorCodes.COMPOSE_NOT_FOUND,
            message: ErrorMessages[ErrorCodes.COMPOSE_NOT_FOUND],
            detail: req.projectName,
          },
        };
      }
      if (proj.configFiles.length === 0) {
        return {
          ok: false as const,
          error: {
            code: ErrorCodes.COMPOSE_CONFIG_READ_FAILED,
            message: ErrorMessages[ErrorCodes.COMPOSE_CONFIG_READ_FAILED],
            detail: 'config_files が空です',
          },
        };
      }
      const args = ['compose'];
      for (const f of proj.configFiles) {
        args.push('-f', f);
      }
      args.push(req.action === 'stop' ? 'stop' : 'pull');
      const cwd =
        proj.workingDir?.trim() ||
        dirname(proj.configFiles[0]!) ||
        process.cwd();
      await execFile('docker', args, {
        cwd,
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      });
      return { ok: true as const, data: undefined };
    } catch (e) {
      return {
        ok: false as const,
        error: toPayload(wrapError(e, ErrorCodes.COMPOSE_CLI_FAILED, 'composeLifecycle')),
      };
    }
  });

  ipcMain.handle('dmig:pruneDanglingImages', async () => {
    const answer = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['キャンセル', '実行'],
      defaultId: 0,
      cancelId: 0,
      title: '未使用イメージの削除',
      message:
        'docker image prune -f を実行します。dangling（タグ無し）イメージのみが削除されます。実行中のコンテナが使っているレイヤは残ります。',
    });
    if (answer.response !== 1) {
      return { ok: true as const, data: { skipped: true as const } };
    }
    try {
      const { stdout } = await execFile('docker', ['image', 'prune', '-f'], {
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      });
      return { ok: true as const, data: { skipped: false as const, stdout } };
    } catch (e) {
      return {
        ok: false as const,
        error: toPayload(wrapError(e, ErrorCodes.IMAGE_PRUNE_FAILED, 'pruneDanglingImages')),
      };
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

    let baseSnapshotForDelta: Snapshot | null = null;
    let currentSnapshotForDelta: Snapshot | null = null;

    try {
      const allProjects = await docker.listComposeProjects();
      let effectiveProjectNames = req.projectNames;

      if (req.diffMode === 'delta') {
        const store = SnapshotStore.getInstance();
        baseSnapshotForDelta = req.baseSnapshotId
          ? await store.loadById(req.baseSnapshotId)
          : await store.loadLatest();
        if (!baseSnapshotForDelta) {
          return {
            ok: false as const,
            error: {
              code: ErrorCodes.NO_BASE_SNAPSHOT,
              message: ErrorMessages[ErrorCodes.NO_BASE_SNAPSHOT],
            },
          };
        }
        const snapshotter = new Snapshotter(docker);
        snapshotter.on('progress', progressForwarder);
        try {
          currentSnapshotForDelta = await snapshotter.capture({
            volumeStrategy: req.volumeDiffStrategy ?? 'fast',
            signal: controller.signal,
            jobToken: req.jobToken,
          });
        } finally {
          snapshotter.off('progress', progressForwarder);
        }
        const diff = new DiffEngine().compute(
          baseSnapshotForDelta,
          currentSnapshotForDelta,
          req.volumeDiffStrategy ?? 'fast',
        );
        const allowed = new Set(
          diff.composeProjects.filter((c) => c.kind !== 'removed').map((c) => c.projectName),
        );
        effectiveProjectNames = req.projectNames.filter((n) => allowed.has(n));
        if (effectiveProjectNames.length === 0) {
          return {
            ok: false as const,
            error: {
              code: ErrorCodes.DIFF_COMPUTATION_FAILED,
              message: ErrorMessages[ErrorCodes.DIFF_COMPUTATION_FAILED],
              detail: '差分に該当する Compose プロジェクトがありません',
            },
          };
        }
      }

      const targets = allProjects.filter((p) => effectiveProjectNames.includes(p.name));
      if (targets.length === 0) {
        return {
          ok: false as const,
          error: {
            code: ErrorCodes.COMPOSE_NOT_FOUND,
            message: ErrorMessages[ErrorCodes.COMPOSE_NOT_FOUND],
            detail: `projectNames=${effectiveProjectNames.join(',')}`,
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

      const exportReq: ComposeExportRequest = {
        ...req,
        projectNames: effectiveProjectNames,
      };

      const result = await composeExporter.exportProjects(
        exportReq,
        packDir,
        targets,
        controller.signal,
      );

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

      if (req.diffMode === 'delta' && baseSnapshotForDelta && currentSnapshotForDelta) {
        applyDeltaManifestInPlace(manifest, baseSnapshotForDelta);
      }

      await fsp.writeFile(join(packDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

      const checksumLines: string[] = [];
      for (const img of result.imageEntries) {
        checksumLines.push(`${img.sha256}  ${img.filename}`);
      }
      for (const vol of result.volumeEntries) {
        checksumLines.push(`${vol.sha256}  ${vol.filename}`);
      }
      await fsp.writeFile(join(packDir, 'checksums.sha256'), `${checksumLines.join('\n')}\n`, 'utf-8');

      if (req.diffMode === 'delta' && baseSnapshotForDelta && currentSnapshotForDelta) {
        if (req.autoSaveSnapshot !== false) {
          try {
            const snapStore = SnapshotStore.getInstance();
            await snapStore.save(currentSnapshotForDelta);
            await snapStore.pruneOld();
          } catch (e) {
            console.warn('[ipc] snapshot auto-save failed:', e);
          }
        }
      }

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

  ipcMain.handle('dmig:listSnapshots', async () => {
    try {
      const store = SnapshotStore.getInstance();
      const list = await store.list();
      return { ok: true as const, data: list };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:deleteSnapshot', async (_evt, id: string) => {
    try {
      const store = SnapshotStore.getInstance();
      await store.delete(id);
      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle(
    'dmig:computeDiff',
    async (evt, req: DiffPreviewRequest) => {
      const senderWin = BrowserWindow.fromWebContents(evt.sender);
      const controller = jobRegistry.register(req.jobToken);
      const tracker = new ProgressTracker();
      const onProgress = (ev: ProgressEvent): void => {
        senderWin?.webContents.send('dmig:progress', tracker.enrich(ev));
      };

      try {
        const store = SnapshotStore.getInstance();
        const base = req.baseSnapshotId
          ? await store.loadById(req.baseSnapshotId)
          : await store.loadLatest();

        if (!base) {
          return {
            ok: false as const,
            error: {
              code: ErrorCodes.NO_BASE_SNAPSHOT,
              message: ErrorMessages[ErrorCodes.NO_BASE_SNAPSHOT],
            },
          };
        }

        const snapshotter = new Snapshotter(docker);
        snapshotter.on('progress', onProgress);
        let current: Snapshot;
        try {
          current = await snapshotter.capture({
            volumeStrategy: req.volumeStrategy ?? 'fast',
            signal: controller.signal,
            jobToken: req.jobToken,
          });
        } finally {
          snapshotter.off('progress', onProgress);
        }

        const diff = new DiffEngine().compute(base, current, req.volumeStrategy ?? 'fast');
        const preview = new DiffPreview().build(diff);
        return { ok: true as const, data: preview };
      } catch (e) {
        return { ok: false as const, error: toPayload(e) };
      } finally {
        jobRegistry.unregister(req.jobToken);
      }
    },
  );

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

function applyDeltaManifestInPlace(manifest: DmigManifest, base: Snapshot): void {
  manifest.schemaVersion = '1.1';
  manifest.previousPackage = { id: base.id, createdAt: base.createdAt };
  manifest.baseRef = base.id;
  for (const img of manifest.contents.images) {
    img.kind = 'delta';
    img.baseRef = base.id;
  }
  if (manifest.contents.volumes) {
    for (const vol of manifest.contents.volumes) {
      vol.kind = 'delta';
      vol.baseRef = base.id;
    }
  }
  if (manifest.contents.composeProjects) {
    for (const cp of manifest.contents.composeProjects) {
      cp.kind = 'delta';
      cp.baseRef = base.id;
    }
  }
}

function toPayload(e: unknown): DmigErrorPayload {
  if (e instanceof DmigError) return e.toPayload();
  return {
    code: ErrorCodes.UNKNOWN_ERROR,
    message: ErrorMessages[ErrorCodes.UNKNOWN_ERROR],
    detail: e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e),
  };
}
