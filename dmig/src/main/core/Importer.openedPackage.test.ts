import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import type { ChunkRef, DmigManifest } from '@shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import type { DockerAdapter } from './DockerAdapter.js';
import { Importer, PROBE_PREVIEW_LIMIT } from './Importer.js';

const ZERO_SHA = '0'.repeat(64);

function baseManifest(overrides: Partial<DmigManifest> = {}): DmigManifest {
  return {
    dmigVersion: '1.0.0',
    createdAt: '2020-01-01T00:00:00.000Z',
    source: { os: 'linux', arch: 'x64', appVersion: '0.1.0' },
    contents: {
      images: [
        {
          name: 'img1',
          filename: 'images/x.tar.zst',
          originalSize: 1,
          compressedSize: 1,
          sha256: ZERO_SHA,
        },
      ],
    },
    totalSize: 1,
    ...overrides,
  };
}

function validChunk(overrides: Partial<ChunkRef> = {}): ChunkRef {
  return {
    contentKind: 'image',
    contentId: 'img1',
    chunkIndex: 0,
    byteOffset: 0,
    byteLength: 100,
    expectedSha256: ZERO_SHA,
    ...overrides,
  };
}

function makeImporter(): Importer {
  return new Importer({} as unknown as DockerAdapter);
}

async function writePackage(dir: string, manifest: DmigManifest): Promise<void> {
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');
}

describe('Importer.openAsBase / openForResume / probe', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  async function tempPackage(manifest: DmigManifest): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'dmig-import-test-'));
    dirs.push(dir);
    await writePackage(dir, manifest);
    return dir;
  }

  it('フィクスチャ A: 1.0 完了 — openAsBase base、openForResume E2071、probe ok_complete', async () => {
    const dir = await tempPackage(baseManifest({ schemaVersion: '1.0' }));
    const im = makeImporter();
    const opened = await im.openAsBase(dir);
    expect(opened.mode).toBe('base');
    await expect(im.openForResume(dir)).rejects.toMatchObject({ code: ErrorCodes.NOT_A_PARTIAL_PACKAGE });
    const p = await im.probe(dir);
    expect(p.status).toBe('ok_complete');
    expect(p.manifestPresent).toBe(true);
    expect(p.diagnostic).toBeUndefined();
    expect(p.pendingChunkCount).toBe(0);
  });

  it('フィクスチャ B: 1.1 完了 — 1.0 と同様の入口・probe', async () => {
    const dir = await tempPackage(baseManifest({ schemaVersion: '1.1' }));
    const im = makeImporter();
    expect((await im.openAsBase(dir)).mode).toBe('base');
    await expect(im.openForResume(dir)).rejects.toMatchObject({ code: ErrorCodes.NOT_A_PARTIAL_PACKAGE });
    const p = await im.probe(dir);
    expect(p.status).toBe('ok_complete');
    expect(p.diagnostic).toBeUndefined();
  });

  it('フィクスチャ C: 1.1 中断 — openAsBase E2070、openForResume resume、probe ok_partial', async () => {
    const dir = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: [validChunk()],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
          interruptionReason: 'user-cancel',
        },
      }),
    );
    const im = makeImporter();
    await expect(im.openAsBase(dir)).rejects.toMatchObject({ code: ErrorCodes.INVALID_BASE_PACKAGE });
    const r = await im.openForResume(dir);
    expect(r.mode).toBe('resume');
    expect(r.partialState.pendingChunks).toHaveLength(1);
    const p = await im.probe(dir);
    expect(p.status).toBe('ok_partial');
    expect(p.pendingChunkCount).toBe(1);
    expect(p.diagnostic).toBeUndefined();
    expect(p.pendingChunksPreview).toHaveLength(1);
  });

  it('probe: missing_dir / missing_manifest', async () => {
    const im = makeImporter();
    const ghost = join(tmpdir(), 'dmig-probe-nonexistent-' + String(Math.random()).slice(2));
    const m1 = await im.probe(ghost);
    expect(m1.status).toBe('missing_dir');
    expect(m1.manifestPresent).toBe(false);
    expect(m1.diagnostic).toMatch(/reason=/);

    const emptyDir = await mkdtemp(join(tmpdir(), 'dmig-probe-empty-'));
    dirs.push(emptyDir);
    const m2 = await im.probe(emptyDir);
    expect(m2.status).toBe('missing_manifest');
    expect(m2.manifestPresent).toBe(false);
    expect(m2.diagnostic).toBeDefined();
  });

  it('probe: version_incompatible (dmig major 2)', async () => {
    const dir = await tempPackage(baseManifest({ dmigVersion: '2.0.0', schemaVersion: '1.1' }));
    const p = await makeImporter().probe(dir);
    expect(p.status).toBe('version_incompatible');
    expect(p.diagnostic).toContain('reason=version_incompatible');
  });

  it('フィクスチャ D: invalid_partial / E2075 理由', async () => {
    const im = makeImporter();

    const d1 = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: [],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
        },
      }),
    );
    await expect(im.openForResume(d1)).rejects.toMatchObject({
      code: ErrorCodes.MANIFEST_PARTIAL_INVALID,
      detail: expect.stringContaining('reason=empty_pending_chunks'),
    });
    const p1 = await im.probe(d1);
    expect(p1.status).toBe('invalid_partial');
    expect(p1.diagnostic).toContain('reason=empty_pending_chunks');

    const d2 = await tempPackage(
      baseManifest({
        schemaVersion: '1.0',
        partialState: {
          pendingChunks: [validChunk()],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
        },
      }),
    );
    await expect(im.openForResume(d2)).rejects.toMatchObject({
      code: ErrorCodes.MANIFEST_PARTIAL_INVALID,
      detail: expect.stringContaining('reason=partial_state_on_v1_0'),
    });

    const d3 = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: [validChunk({ contentId: 'ghost' })],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
        },
      }),
    );
    await expect(im.openForResume(d3)).rejects.toMatchObject({
      detail: expect.stringContaining('reason=unknown_content_ref'),
    });

    const d4 = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: [validChunk(), validChunk()],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
        },
      }),
    );
    await expect(im.openForResume(d4)).rejects.toMatchObject({
      detail: expect.stringContaining('reason=duplicate_chunk_ref'),
    });

    const d5 = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: [validChunk({ byteOffset: -1 })],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
        },
      }),
    );
    await expect(im.openForResume(d5)).rejects.toMatchObject({
      detail: expect.stringContaining('reason=invalid_chunk_bounds'),
    });

    const d5b = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: [validChunk({ byteLength: 0 })],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
        },
      }),
    );
    await expect(im.openForResume(d5b)).rejects.toMatchObject({
      detail: expect.stringContaining('reason=invalid_chunk_bounds'),
    });

    const d6 = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: [validChunk({ expectedSha256: 'ABCDEF' })],
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-resumed',
        },
      }),
    );
    await expect(im.openForResume(d6)).rejects.toMatchObject({
      detail: expect.stringContaining('reason=invalid_sha256_format'),
    });
  });

  it('pendingChunksPreview は最大 PROBE_PREVIEW_LIMIT 件', async () => {
    const chunks: ChunkRef[] = [];
    for (let i = 0; i < PROBE_PREVIEW_LIMIT + 3; i++) {
      chunks.push(
        validChunk({
          chunkIndex: i,
          byteOffset: i * 10,
        }),
      );
    }
    const dir = await tempPackage(
      baseManifest({
        schemaVersion: '1.1',
        partialState: {
          pendingChunks: chunks,
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          checksumPolicy: 'verify-all',
        },
      }),
    );
    const p = await makeImporter().probe(dir);
    expect(p.pendingChunksPreview?.length).toBe(PROBE_PREVIEW_LIMIT);
  });
});
