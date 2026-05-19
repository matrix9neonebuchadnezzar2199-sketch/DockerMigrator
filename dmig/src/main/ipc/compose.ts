import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { Exporter } from '../core/Exporter.js';
import { Importer } from '../core/Importer.js';
import { ComposeExporter } from '../core/ComposeExporter.js';
import { ComposeExportManifestSession } from '../core/manifest/composeExportManifestSession.js';
import { RollbackManager } from '../core/RollbackManager.js';
import { buildExportPackDirectoryEntry, createRollbackRecord } from '../core/rollbackRecordBuilder.js';
import { ComposeImporter } from '../core/ComposeImporter.js';
import { VolumeExporter } from '../core/VolumeExporter.js';
import { SecretScanner } from '../core/SecretScanner.js';
import { jobRegistry } from '../core/JobRegistry.js';
import { wrapError } from '../core/errors/DmigError.js';
import { ErrorCodes, ErrorMessages } from '../core/errors/codes.js';
import type {
  ComposeExportRequest,
  ComposeImportRequest,
  ComposeProjectInfo,
  ComposeLifecycleRequest,
  SecretScanResult,
  DmigManifest,
} from '@shared/types.js';
import type { Snapshot } from '@shared/snapshot-types.js';
import { SnapshotStore } from '../core/snapshot/SnapshotStore.js';
import { Snapshotter } from '../core/snapshot/Snapshotter.js';
import { DiffEngine } from '../core/diff/DiffEngine.js';
import { SizeEstimator } from '../core/SizeEstimator.js';
import { ProgressTaskIds } from '@shared/progress.js';
import { createProgressRelay } from '../utils/progressIpc.js';
import type { HandlerDeps } from './shared.js';
import { applyDeltaManifestInPlace, toPayload } from './shared.js';

const execFile = promisify(execFileCb);

export function registerComposeHandlers(deps: HandlerDeps): void {
  const { docker } = deps;

  ipcMain.handle('dmig:listComposeProjects', async (event: IpcMainInvokeEvent) => {
    const relay = createProgressRelay(event.sender);
    const emitDiscover = async (percentage: number, message: string) => {
      const pct = Math.min(100, Math.max(0, percentage));
      await relay.send({
        taskId: ProgressTaskIds.COMPOSE_DISCOVER,
        phase: 'discover',
        scope: 'discover',
        current: pct,
        total: 100,
        percentage: pct,
        message,
      });
    };

    try {
      await emitDiscover(5, 'Compose プロジェクトを検索しています…');

      const projects = await docker.listComposeProjects(async (info) => {
        if (info.total > 0) {
          const pct = 10 + Math.floor((50 * info.discovered) / info.total);
          await emitDiscover(pct, info.message);
        } else {
          await emitDiscover(8, info.message);
        }
      });

      const estimator = new SizeEstimator(docker);
      const total = projects.length;
      const data: ComposeProjectInfo[] = [];
      for (let i = 0; i < projects.length; i++) {
        const proj = projects[i]!;
        const pct =
          total > 0 ? 60 + Math.floor((35 * i) / total) : 60;
        await emitDiscover(
          pct,
          total > 0
            ? `サイズを見積もり中: ${proj.name} (${i + 1}/${total})`
            : 'サイズを見積もり中…',
        );
        try {
          const est = await estimator.estimateForCompose([proj]);
          data.push({ ...proj, estimatedSize: est.totalEstimated });
        } catch {
          data.push({ ...proj, estimatedSize: proj.estimatedSize });
        }
      }

      await emitDiscover(100, total > 0 ? `一覧の取得が完了しました（${total} 件）` : 'Compose プロジェクトは見つかりませんでした');

      return { ok: true as const, data };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:composeLifecycle', async (event: IpcMainInvokeEvent, req: ComposeLifecycleRequest) => {
    const relay = createProgressRelay(event.sender);
    const actionLabel = req.action === 'stop' ? '停止' : 'イメージ取得';
    try {
      await relay.emit({
        taskId: ProgressTaskIds.COMPOSE_LIFECYCLE,
        phase: 'discover',
        scope: 'system',
        current: 0,
        total: 100,
        message: `${req.projectName} を${actionLabel}しています…`,
      });
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
      await relay.emit({
        taskId: ProgressTaskIds.COMPOSE_LIFECYCLE,
        phase: 'discover',
        scope: 'system',
        current: 100,
        total: 100,
        message: `${req.projectName} の${actionLabel}が完了しました`,
      });
      return { ok: true as const, data: undefined };
    } catch (e) {
      return {
        ok: false as const,
        error: toPayload(wrapError(e, ErrorCodes.COMPOSE_CLI_FAILED, 'composeLifecycle')),
      };
    }
  });

  ipcMain.handle(
    'dmig:scanSecrets',
    async (event: IpcMainInvokeEvent, projects: ComposeProjectInfo[]) => {
      const relay = createProgressRelay(event.sender);
      try {
        const scanner = new SecretScanner();
        const result: Record<string, SecretScanResult[]> = {};
        const total = projects.length;

        for (let i = 0; i < projects.length; i++) {
          const proj = projects[i]!;
          await relay.emit({
            taskId: ProgressTaskIds.SECRET_SCAN,
            phase: 'discover',
            scope: 'scan',
            current: i,
            total: total > 0 ? total : 1,
            message: `シークレットをスキャン中: ${proj.name} (${i + 1}/${total || '?'})`,
          });
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

  ipcMain.handle('dmig:exportCompose', async (event: IpcMainInvokeEvent, req: ComposeExportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const exporter = new Exporter(docker);
    const volumeExporter = new VolumeExporter(docker);
    const composeExporter = new ComposeExporter(docker, exporter, volumeExporter);

    const relay = createProgressRelay(event.sender);
    const progressForwarder = relay.forwarder;
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

      const session = await ComposeExportManifestSession.create(packDir, exportReq, targets, docker);
      await session.writeInitial();

      await composeExporter.exportProjects(
        exportReq,
        packDir,
        targets,
        controller.signal,
        session,
      );

      if (req.diffMode === 'delta' && baseSnapshotForDelta && currentSnapshotForDelta) {
        applyDeltaManifestInPlace(session.manifest, baseSnapshotForDelta);
      }

      await session.finalizeSuccess();

      const manifest = session.manifest;

      const checksumLines: string[] = [];
      for (const img of manifest.contents.images) {
        checksumLines.push(`${img.sha256}  ${img.filename}`);
      }
      for (const vol of manifest.contents.volumes ?? []) {
        checksumLines.push(`${vol.sha256}  ${vol.filename}`);
      }
      await fsp.writeFile(join(packDir, 'checksums.sha256'), `${checksumLines.join('\n')}\n`, 'utf-8');

      const rollbackManager = new RollbackManager(docker);
      await rollbackManager.saveRecord(
        packDir,
        createRollbackRecord(packDir, 'export', [buildExportPackDirectoryEntry(packDir)]),
      );

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

  ipcMain.handle('dmig:importCompose', async (event: IpcMainInvokeEvent, req: ComposeImportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const importer = new Importer(docker);
    const volumeExporter = new VolumeExporter(docker);
    const composeImporter = new ComposeImporter(docker, importer, volumeExporter);

    const relay = createProgressRelay(event.sender);
    const progressForwarder = relay.forwarder;
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
}
