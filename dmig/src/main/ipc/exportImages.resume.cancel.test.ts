import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChunkRef, DmigManifest, ProgressEvent } from '@shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import { DmigError } from '../core/errors/DmigError.js';
import { Exporter } from '../core/Exporter.js';
import { jobRegistry } from '../core/JobRegistry.js';
import { VolumeExporter } from '../core/VolumeExporter.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  makeTempDirManager,
} from '../core/__test-fixtures__/index.js';
import { setupImageExportIpcHarness, type IpcInvokeHandler } from '../test-utils/ipcHarness.js';

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

function chunkImage(contentId: string): ChunkRef {
  return {
    contentKind: 'image',
    contentId,
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

function partialComposeVolumeManifest(pending: ChunkRef[]): DmigManifest {
  return makeManifest({
    schemaVersion: '1.1',
    contents: {
      images: [],
      volumes: [
        {
          name: 'myvol',
          filename: 'volumes/myvol.tar.zst',
          compressedSize: 1,
          sha256: ZERO_SHA,
          driver: 'local',
        },
      ],
      composeProjects: [
        {
          name: 'proj1',
          manifestFile: 'compose/proj1/project-manifest.json',
          serviceCount: 0,
          volumeCount: 1,
          hasEnvFile: false,
          envFileMasked: false,
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

async function readPackManifest(pkgDir: string): Promise<DmigManifest> {
  const raw = await readFile(join(pkgDir, 'manifest.json'), 'utf-8');
  return JSON.parse(raw) as DmigManifest;
}

function progressPayloads(
  rows: Array<{ channel: string; payload: unknown }>,
): ProgressEvent[] {
  return rows
    .filter((r) => r.channel === 'dmig:progress')
    .map((r) => r.payload as ProgressEvent);
}

/** 完了系 progress（taskId=done, 100%） */
function isCompletionProgress(ev: ProgressEvent): boolean {
  return ev.taskId === 'done' && ev.phase === 'write' && ev.percentage === 100;
}

function hasContradiction(
  res: ResumeResult,
  manifest: DmigManifest,
  progress: ProgressEvent[],
): boolean {
  const doneEmitted = progress.some(isCompletionProgress);
  const partial = manifest.partialState;
  const cancelPartial =
    partial !== undefined &&
    partial.interruptionReason === 'user-cancel' &&
    (partial.pendingChunks?.length ?? 0) > 0;

  if (res.ok && cancelPartial) {
    return true;
  }
  if (!res.ok && doneEmitted) {
    return true;
  }
  return false;
}

describe('dmig:resumeExport cancel (B-20)', () => {
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

  it('シナリオ1: 早期 cancel（チャンク処理前）', async () => {
    const pkgDir = await tmp.create('dmig-resume-cancel-early-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    await writeFile(join(pkgDir, 'images', 'imgA.tar.zst'), 'x', 'utf-8');
    const m = partialTwoImageManifest([chunkImage('imgB')]);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    let releaseExport: (() => void) | undefined;
    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseExport = () => {
            resolve({
              name: 'imgB',
              filename: 'imgB.tar.zst',
              originalSize: 4,
              compressedSize: 4,
              sha256: HASH_B,
            });
          };
        }),
    );

    const jobToken = randomUUID();
    const invokePromise = harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken,
      compressionLevel: 3,
    }) as Promise<ResumeResult>;

    await vi.waitFor(() => {
      expect(jobRegistry.size()).toBe(1);
    });
    jobRegistry.cancel(jobToken);

    const res = await invokePromise;
    const manifest = await readPackManifest(pkgDir);
    const progress = progressPayloads(harness.captureProgress());

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCodes.JOB_CANCELLED);
    }
    expect(manifest.partialState?.interruptionReason).toBe('user-cancel');
    expect(progress.some(isCompletionProgress)).toBe(false);
    expect(hasContradiction(res, manifest, progress)).toBe(false);

    releaseExport?.();
  });

  it('シナリオ2: チャンク処理中 cancel（2 件目）', async () => {
    const pkgDir = await tmp.create('dmig-resume-cancel-mid-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    const m = partialTwoImageManifest([chunkImage('imgA'), chunkImage('imgB')]);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    const jobToken = randomUUID();
    let call = 0;
    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockImplementation(async (name) => {
      call += 1;
      if (call >= 2) {
        jobRegistry.cancel(jobToken);
        throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'scenario2 mid-chunk' });
      }
      return {
        name: String(name),
        filename: `${String(name).replace(/[/:]/g, '_')}.tar.zst`,
        originalSize: 4,
        compressedSize: 4,
        sha256: name === 'imgA' ? HASH_A : HASH_B,
      };
    });

    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken,
      compressionLevel: 3,
    })) as ResumeResult;

    const manifest = await readPackManifest(pkgDir);
    const progress = progressPayloads(harness.captureProgress());

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCodes.JOB_CANCELLED);
    }
    expect(manifest.partialState?.interruptionReason).toBe('user-cancel');
    const pendingIds = manifest.partialState?.pendingChunks.map((c) => c.contentId) ?? [];
    expect(pendingIds).toContain('imgB');
    expect(progress.some(isCompletionProgress)).toBe(false);
    expect(hasContradiction(res, manifest, progress)).toBe(false);
  });

  it('シナリオ3: 最終チャンク完了直後に abort（本命）', async () => {
    const pkgDir = await tmp.create('dmig-resume-cancel-last-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    await writeFile(join(pkgDir, 'images', 'imgA.tar.zst'), 'x', 'utf-8');
    const m = partialTwoImageManifest([chunkImage('imgB')]);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    const jobToken = randomUUID();
    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockImplementation(async () => {
      const entry = {
        name: 'imgB',
        filename: 'imgB.tar.zst',
        originalSize: 4,
        compressedSize: 4,
        sha256: HASH_B,
      };
      jobRegistry.cancel(jobToken);
      return entry;
    });

    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken,
      compressionLevel: 3,
    })) as ResumeResult;

    const manifest = await readPackManifest(pkgDir);
    const progress = progressPayloads(harness.captureProgress());

    // 最終チャンクの I/O 完了後に abort してもループ後半に signal チェックが無い → 成功扱いになり得る（B-20 P1）
    expect(res.ok).toBe(true);
    expect(manifest.partialState).toBeUndefined();
    expect(progress.some(isCompletionProgress)).toBe(true);
    expect(hasContradiction(res, manifest, progress)).toBe(false);
  });

  it('シナリオ4: Compose 再開経路で volume チャンク中 cancel', async () => {
    const docker = makeDockerAdapterMock({
      exportVolumeStream: vi.fn().mockResolvedValue(Readable.from(Buffer.from('vol-data'))),
    });
    Object.assign(docker, {
      listComposeProjects: vi.fn().mockResolvedValue([]),
    });
    harness.cleanup();
    ipcHandlers.clear();
    harness = setupImageExportIpcHarness({ handlers: ipcHandlers, docker });

    const pkgDir = await tmp.create('dmig-resume-cancel-compose-');
    await mkdir(join(pkgDir, 'volumes'), { recursive: true });
    const m = partialComposeVolumeManifest([
      {
        contentKind: 'volume',
        contentId: 'myvol',
        chunkIndex: 0,
        byteOffset: 0,
        byteLength: 100,
        expectedSha256: ZERO_SHA,
      },
    ]);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    const jobToken = randomUUID();
    vi.spyOn(VolumeExporter.prototype, 'exportOne').mockImplementation(async () => {
      jobRegistry.cancel(jobToken);
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'scenario4 compose volume' });
    });

    const res = (await harness.invoke('dmig:resumeExport', {
      packageDir: pkgDir,
      jobToken,
      compressionLevel: 3,
    })) as ResumeResult;

    const manifest = await readPackManifest(pkgDir);
    const progress = progressPayloads(harness.captureProgress());

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCodes.JOB_CANCELLED);
    }
    expect(manifest.partialState?.interruptionReason).toBe('user-cancel');
    expect(progress.some(isCompletionProgress)).toBe(false);
    expect(hasContradiction(res, manifest, progress)).toBe(false);
  });

  it('シナリオ5: 正常完了（回帰）', async () => {
    const pkgDir = await tmp.create('dmig-resume-cancel-ok-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    await writeFile(join(pkgDir, 'images', 'imgA.tar.zst'), 'x', 'utf-8');
    await writeFile(join(pkgDir, 'images', 'imgB.tar.zst'), 'y', 'utf-8');
    const m = partialTwoImageManifest([chunkImage('imgB')]);
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

    const manifest = await readPackManifest(pkgDir);
    const progress = progressPayloads(harness.captureProgress());

    expect(res.ok).toBe(true);
    expect(manifest.partialState).toBeUndefined();
    expect(progress.some(isCompletionProgress)).toBe(true);
    expect(hasContradiction(res, manifest, progress)).toBe(false);
  });
});
