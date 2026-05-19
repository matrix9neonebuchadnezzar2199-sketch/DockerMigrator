import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChunkRef, DmigManifest, ExportRequest } from '@shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import type { DockerAdapter } from './DockerAdapter.js';
import type { OpenedPackageResume } from './importer/OpenedPackage.js';
import { Exporter } from './Exporter.js';

const ZERO_SHA = '0'.repeat(64);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeDockerStub(): DockerAdapter {
  return {
    ping: vi.fn().mockResolvedValue({ version: 'test-docker' }),
    listImages: vi.fn().mockResolvedValue([
      { id: '1', repoTags: ['imgA'], size: 4096, created: 0 },
      { id: '2', repoTags: ['imgB'], size: 4096, created: 0 },
    ]),
    getImageOriginalSize: vi.fn().mockResolvedValue(4096),
    saveImageStream: vi.fn().mockResolvedValue(Readable.from(Buffer.from('layer'))),
  } as unknown as DockerAdapter;
}

function exportReq(outputDir: string, imageNames: string[]): ExportRequest {
  return {
    outputDir,
    imageNames,
    jobToken: '00000000-0000-4000-8000-000000000001',
  };
}

function manifestWithPending(pending: ChunkRef[]): DmigManifest {
  return {
    dmigVersion: '1.0.0',
    schemaVersion: '1.1',
    createdAt: '2026-01-01T00:00:00.000Z',
    source: { os: 'linux', arch: 'x64', dockerVersion: 't', appVersion: '0.1.0-poc' },
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
    totalSize: 2,
    partialState: {
      pendingChunks: pending,
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      checksumPolicy: 'verify-resumed',
    },
  };
}

describe('Exporter partialState (段階 A)', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  it('正常終了で partialState が無く schemaVersion が 1.1', async () => {
    const out = await tempDir('dmig-export-ok-');
    const docker = makeDockerStub();
    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockResolvedValue({
      name: 'imgA',
      filename: 'imgA.tar.zst',
      originalSize: 4,
      compressedSize: 4,
      sha256: HASH_A,
    });

    const exporter = new Exporter(docker);
    const { packDir } = await exporter.exportImages(exportReq(out, ['imgA']));

    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.schemaVersion).toBe('1.1');
    expect(parsed.partialState).toBeUndefined();
  });

  it('1 枚目完了後に abort すると imgB のみ pending と user-cancel', async () => {
    const out = await tempDir('dmig-export-abort-');
    const ac = new AbortController();
    const docker = makeDockerStub();

    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockImplementation(async (name: string) => {
      const entry = {
        name,
        filename: `${String(name).replace(/[/:]/g, '_')}.tar.zst`,
        originalSize: 4,
        compressedSize: 4,
        sha256: name === 'imgA' ? HASH_A : HASH_B,
      };
      if (name === 'imgA') {
        ac.abort();
      }
      return entry;
    });

    const exporter = new Exporter(docker);
    await expect(exporter.exportImages(exportReq(out, ['imgA', 'imgB']), ac.signal)).rejects.toMatchObject({
      code: ErrorCodes.JOB_CANCELLED,
    });

    const entries = await readdir(out);
    const dmigDir = entries.find((e) => e.endsWith('.dmig'));
    expect(dmigDir).toBeDefined();
    const packDir = join(out, dmigDir!);

    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.partialState?.interruptionReason).toBe('user-cancel');
    const pendingIds = parsed.partialState?.pendingChunks.map((c) => c.contentId) ?? [];
    expect(pendingIds).toEqual(['imgB']);
  });

  it('再開で完了し partialState が消える', async () => {
    const pkgDir = await tempDir('dmig-resume-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    const pending: ChunkRef[] = [
      {
        contentKind: 'image',
        contentId: 'imgB',
        chunkIndex: 0,
        byteOffset: 0,
        byteLength: 100,
        expectedSha256: ZERO_SHA,
      },
    ];
    const m = manifestWithPending(pending);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    const opened: OpenedPackageResume = {
      mode: 'resume',
      packageDir: pkgDir,
      manifest: m,
      partialState: m.partialState!,
    };

    const docker = makeDockerStub();
    const spy = vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockResolvedValue({
      name: 'imgB',
      filename: 'imgB.tar.zst',
      originalSize: 4,
      compressedSize: 4,
      sha256: HASH_B,
    });

    const exporter = new Exporter(docker);
    await exporter.resumeImagePack(opened, 3);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('imgB');

    const raw = await readFile(join(pkgDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.partialState).toBeUndefined();
    expect(parsed.contents.images.find((i) => i.name === 'imgB')?.sha256).toBe(HASH_B);
  });

  it('例外時は interruptionReason が error', async () => {
    const out = await tempDir('dmig-export-err-');
    const docker = makeDockerStub();
    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockImplementation(async (name: string) => {
      if (name === 'imgB') {
        throw new Error('simulated write failure');
      }
      return {
        name,
        filename: `${name}.tar.zst`,
        originalSize: 4,
        compressedSize: 4,
        sha256: HASH_A,
      };
    });

    const exporter = new Exporter(docker);
    await expect(exporter.exportImages(exportReq(out, ['imgA', 'imgB']))).rejects.toThrow(
      'simulated write failure',
    );

    const entries = await readdir(out);
    const dmigDir = entries.find((e) => e.endsWith('.dmig'));
    const packDir = join(out, dmigDir!);
    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.partialState?.interruptionReason).toBe('error');
  });

  it('再開時に完了済み imgA は exportSingleImagePublic されない', async () => {
    const pkgDir = await tempDir('dmig-resume-skip-');
    await mkdir(join(pkgDir, 'images'), { recursive: true });
    const pending: ChunkRef[] = [
      {
        contentKind: 'image',
        contentId: 'imgB',
        chunkIndex: 0,
        byteOffset: 0,
        byteLength: 50,
        expectedSha256: ZERO_SHA,
      },
    ];
    const m = manifestWithPending(pending);
    await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify(m, null, 2), 'utf-8');

    const opened: OpenedPackageResume = {
      mode: 'resume',
      packageDir: pkgDir,
      manifest: m,
      partialState: m.partialState!,
    };

    const docker = makeDockerStub();
    const spy = vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockResolvedValue({
      name: 'imgB',
      filename: 'imgB.tar.zst',
      originalSize: 4,
      compressedSize: 4,
      sha256: HASH_B,
    });

    const exporter = new Exporter(docker);
    await exporter.resumeImagePack(opened, 3);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls.every((c) => c[0] !== 'imgA')).toBe(true);
  });
});
