import { ipcMain, dialog, type IpcMainInvokeEvent } from 'electron';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { jobRegistry } from '../core/JobRegistry.js';
import { wrapError } from '../core/errors/DmigError.js';
import { ErrorCodes } from '../core/errors/codes.js';
import type { JobToken, CancelResult } from '@shared/types.js';
import { ProgressTaskIds } from '@shared/progress.js';
import { createProgressRelay } from '../utils/progressIpc.js';
import type { HandlerDeps } from './shared.js';
import { toPayload } from './shared.js';

const execFile = promisify(execFileCb);

export function registerSystemHandlers(deps: HandlerDeps): void {
  const { win, docker } = deps;

  ipcMain.handle('dmig:ping', async () => {
    try {
      return { ok: true as const, data: await docker.ping() };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:listImages', async (event: IpcMainInvokeEvent) => {
    const relay = createProgressRelay(event.sender);
    try {
      await relay.emit({
        taskId: ProgressTaskIds.IMAGE_LIST,
        phase: 'discover',
        scope: 'discover',
        current: 0,
        total: 100,
        message: 'Docker イメージ一覧を取得しています…',
      });
      const data = await docker.listImages();
      await relay.emit({
        taskId: ProgressTaskIds.IMAGE_LIST,
        phase: 'discover',
        scope: 'discover',
        current: 100,
        total: 100,
        message: `イメージ一覧の取得が完了しました（${data.length} 件）`,
      });
      return { ok: true as const, data };
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

  ipcMain.handle('dmig:listVolumes', async () => {
    try {
      return { ok: true as const, data: await docker.listVolumes() };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:pruneDanglingImages', async (event: IpcMainInvokeEvent) => {
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
    const relay = createProgressRelay(event.sender);
    try {
      await relay.emit({
        taskId: ProgressTaskIds.PRUNE_DANGLING,
        phase: 'discover',
        scope: 'system',
        current: 0,
        total: 100,
        message: 'dangling イメージを削除しています…',
      });
      const { stdout } = await execFile('docker', ['image', 'prune', '-f'], {
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      });
      await relay.emit({
        taskId: ProgressTaskIds.PRUNE_DANGLING,
        phase: 'discover',
        scope: 'system',
        current: 100,
        total: 100,
        message: 'dangling イメージの整理が完了しました',
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
