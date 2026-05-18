import { ipcMain } from 'electron';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { Exporter } from '../core/Exporter.js';
import { Importer } from '../core/Importer.js';
import { ComposeExporter } from '../core/ComposeExporter.js';
import { VolumeExporter } from '../core/VolumeExporter.js';
import { jobRegistry } from '../core/JobRegistry.js';
import { ErrorCodes, ErrorMessages } from '../core/errors/codes.js';
import type { ExportRequest, ProgressEvent, ResumeExportRequest } from '@shared/types.js';
import type { Snapshot } from '@shared/snapshot-types.js';
import { SnapshotStore } from '../core/snapshot/SnapshotStore.js';
import { Snapshotter } from '../core/snapshot/Snapshotter.js';
import { DiffEngine } from '../core/diff/DiffEngine.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import type { HandlerDeps } from './shared.js';
import { applyDeltaManifestInPlace, toPayload } from './shared.js';

export function registerImageExportHandlers(deps: HandlerDeps): void {
  const { win, docker } = deps;

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

  ipcMain.handle('dmig:resumeExport', async (_e, req: ResumeExportRequest) => {
    const controller = jobRegistry.register(req.jobToken);
    const importer = new Importer(docker);
    const exporter = new Exporter(docker);
    const volumeExporter = new VolumeExporter(docker);
    const composeExporter = new ComposeExporter(docker, exporter, volumeExporter);

    const tracker = new ProgressTracker();
    const onProg = (ev: ProgressEvent) => {
      win.webContents.send('dmig:progress', tracker.enrich(ev));
    };
    exporter.on('progress', onProg);
    volumeExporter.on('progress', onProg);
    composeExporter.on('progress', onProg);

    const compressionLevel = req.compressionLevel ?? 3;

    try {
      const opened = await importer.openForResume(req.packageDir);
      const needsComposeResume =
        (opened.manifest.contents.composeProjects?.length ?? 0) > 0 ||
        opened.partialState.pendingChunks.some(
          (c) => c.contentKind === 'composeProject' || c.contentKind === 'volume',
        );

      if (needsComposeResume) {
        await composeExporter.resumeComposePack(opened, compressionLevel, controller.signal);
      } else {
        await exporter.resumeImagePack(opened, compressionLevel, controller.signal);
      }

      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    } finally {
      exporter.off('progress', onProg);
      volumeExporter.off('progress', onProg);
      composeExporter.off('progress', onProg);
      jobRegistry.unregister(req.jobToken);
    }
  });
}
