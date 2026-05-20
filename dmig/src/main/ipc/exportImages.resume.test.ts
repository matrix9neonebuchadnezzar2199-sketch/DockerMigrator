import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChunkRef, DmigManifest } from '@shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import { Exporter } from '../core/Exporter.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  makeTempDirManager,
} from '../core/__test-fixtures__/index.js';
import { setupImageExportIpcHarness, type IpcInvokeHandler } from '../test-utils/ipcHarness.js';
import { ROLLBACK_FILENAME } from '../core/RollbackManager.js';

type ResumeResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message?: string; detail?: string } };

const ZERO_SHA = '0'.repeat(64);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const { ipcHandlers } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, IpcInvokeHandler>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, fn: IpcInvokeHandler) {
      ipcHandlers.set(channel, fn);
    },
    removeHandler(channel: string) {
      ipcHandlers.delete(channel);
    },
  },
}));

function pendingChunkImgB(): ChunkRef {
  return {
    contentKind: 'image',
    contentId: 'imgB',
    chunkIndex: 0,
    byteOffset: 0,
    byteLength: 100,
    expectedSha256: ZERO_SHA,
  };
}

function partialTwoImageManifest(pending: ChunkRef[]): DmigManifest {
  return makeManifest({
    schemaVersion: '1.1',
    contents: {
      images: [
        {
          name: 'imgA',
          filename: 'imgA.tar.zst',
          originalSize: 1,
          compressedSize: 1,
          sha256: HASH_A,
        },
        {
          name: 'imgB',
          filename: 'imgB.tar.zst',
          originalSize: 1,
          compressedSize: 1,
          sha256: ZERO_SHA,
        },
      ],
    },
    partialState: {
      pendingChunks: pending,
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      checksumPolicy: 'verify-resumed',
      interruptionReason: 'user-cancel',
    },
  });
}

describe('dmig:resumeExport IPC', () => {
  const tmp = makeTempDirManager();
  let harness: ReturnType<typeof setupImageExportIpcHarness>;

  beforeEach(() => {
    ipcHandlers.clear();
    harness = setupImageExportIpcHarness({
      handlers: ipcHandlers,
      docker: makeDockerAdapterMock(),
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanupAll();
    harness.cleanup();
  });

  it('正常: 中断パッケージを resumeExport → 完了後 manifest の partialState が undefined', async () => {
    const pkgDir = await tmp.create('dmig-ipc-resume-ok-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    await writeFile(join(pkgDir, 'images', 'imgA.tar.zst'), 'x', 'utf-8');
    await writeFile(join(pkgDir, 'images', 'imgB.tar.zst'), 'y', 'utf-8');
    const m = partialTwoImageManifest([pendingChunkImgB()]);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockResolvedValue({
      name: 'imgB',
      filename: 'imgB.tar.zst',
      originalSize: 4,
      compressedSize: 4,
      sha256: HASH_B,
    });

    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken: randomUUID(),
      compressionLevel: 3,
    })) as ResumeResult;

    expect(res.ok).toBe(true);

    const raw = await readFile(join(pkgDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.partialState).toBeUndefined();

    const rb = JSON.parse(await readFile(join(pkgDir, ROLLBACK_FILENAME), 'utf-8')) as {
      kind: string;
    };
    expect(rb.kind).toBe('export');
  });

  it('異常: 完了パッケージ (partialState 無し) → E2071 NOT_A_PARTIAL_PACKAGE', async () => {
    const pkgDir = await tmp.create('dmig-ipc-resume-complete-');
    const m = makeManifest({ schemaVersion: '1.1', partialState: undefined });
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken: randomUUID(),
    })) as ResumeResult;

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error?.code).toBe(ErrorCodes.NOT_A_PARTIAL_PACKAGE);
    }
  });

  it('異常: partialState 構造不正 (空 pending) → E2075 MANIFEST_PARTIAL_INVALID', async () => {
    const pkgDir = await tmp.create('dmig-ipc-resume-bad-');
    const m = makeManifest({
      schemaVersion: '1.1',
      partialState: {
        pendingChunks: [],
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        checksumPolicy: 'verify-resumed',
      },
    });
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken: randomUUID(),
    })) as ResumeResult;

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error?.code).toBe(ErrorCodes.MANIFEST_PARTIAL_INVALID);
    }
  });

  it('異常: manifest が存在しない packageDir → PACK_FORMAT_INVALID（E2074 未実装の代替）', async () => {
    const ghost = join(tmpdir(), `dmig-ipc-resume-missing-${randomUUID()}`);
    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: ghost,
      jobToken: randomUUID(),
    })) as ResumeResult;

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error?.code).toBe(ErrorCodes.PACK_FORMAT_INVALID);
    }
  });

  it('progress: dmig:progress が webContents.send 経由で記録される', async () => {
    const pkgDir = await tmp.create('dmig-ipc-resume-prog-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    await writeFile(join(pkgDir, 'images', 'imgA.tar.zst'), 'x', 'utf-8');
    await writeFile(join(pkgDir, 'images', 'imgB.tar.zst'), 'y', 'utf-8');
    const m = partialTwoImageManifest([pendingChunkImgB()]);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockResolvedValue({
      name: 'imgB',
      filename: 'imgB.tar.zst',
      originalSize: 4,
      compressedSize: 4,
      sha256: HASH_B,
    });

    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken: randomUUID(),
    })) as ResumeResult;
    expect(res.ok).toBe(true);

    const rows = harness.captureProgress();
    expect(rows.some((r) => r.channel === 'dmig:progress')).toBe(true);
  });
});
