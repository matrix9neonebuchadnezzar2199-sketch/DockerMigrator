import { ipcMain, BrowserWindow } from 'electron';
import { jobRegistry } from '../core/JobRegistry.js';
import { ErrorCodes, ErrorMessages } from '../core/errors/codes.js';
import type { ProgressEvent, DiffPreviewRequest } from '@shared/types.js';
import type { Snapshot } from '@shared/snapshot-types.js';
import { SnapshotStore } from '../core/snapshot/SnapshotStore.js';
import { Snapshotter } from '../core/snapshot/Snapshotter.js';
import { DiffEngine } from '../core/diff/DiffEngine.js';
import { DiffPreview } from '../core/diff/DiffPreview.js';
import { ProgressTracker } from '../core/ProgressTracker.js';
import type { HandlerDeps } from './shared.js';
import { toPayload } from './shared.js';

export function registerSnapshotHandlers(deps: HandlerDeps): void {
  const { docker } = deps;

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
}
