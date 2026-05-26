import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorCodes } from '@shared/codes.js';
import type { ExportRequest } from '@shared/types.js';
import type { DockerAdapter } from './DockerAdapter.js';
import { Exporter } from './Exporter.js';
import { Importer } from './Importer.js';
import {
  expectCompletedPackManifest,
  makeDockerAdapterMock,
  makeTempDirManager,
} from './__test-fixtures__/index.js';

const THREE_IMAGES = ['img0', 'img1', 'img2'] as const;
const HASH_STUB = 'd'.repeat(64);

function listThreeImages() {
  return THREE_IMAGES.map((name, i) => ({
    id: String(i + 1),
    repoTags: [name],
    size: 4096,
    created: 0,
  }));
}

/** saveImageStream の N 回目以降で AbortError（exportImages の決定論的中断）。 */
function makeAbortingSaveDocker(abortAfterCalls: number): DockerAdapter {
  let calls = 0;
  return makeDockerAdapterMock({
    listImages: async () => listThreeImages(),
    getImageOriginalSize: async () => 4096,
    saveImageStream: async () => {
      calls += 1;
      if (calls > abortAfterCalls) {
        const err = new Error('synthetic abort');
        err.name = 'AbortError';
        throw err;
      }
      return Readable.from(Buffer.from('layer'));
    },
  });
}

function exportReq(outputDir: string, imageNames: readonly string[]): ExportRequest {
  return {
    outputDir,
    imageNames: [...imageNames],
    jobToken: randomUUID(),
  };
}

async function findPackDir(outputDir: string): Promise<string> {
  const entries = await readdir(outputDir);
  const dmigDir = entries.find((e) => e.endsWith('.dmig'));
  if (!dmigDir) {
    throw new Error(`no .dmig under ${outputDir}`);
  }
  return join(outputDir, dmigDir);
}

describe('resume export → openAsBase roundtrip (U6-05)', () => {
  const tmp = makeTempDirManager();

  afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanupAll();
  });

  it('中断 → resumeImagePack 完了 → openAsBase で契約検証', async () => {
    const out = await tmp.create('dmig-resume-rt-');
    const docker = makeAbortingSaveDocker(1);
    const exporter = new Exporter(docker);

    await expect(exporter.exportImages(exportReq(out, THREE_IMAGES))).rejects.toMatchObject({
      name: 'AbortError',
    });

    const packDir = await findPackDir(out);
    const importer = new Importer(makeDockerAdapterMock());

    await expect(importer.openAsBase(packDir)).rejects.toMatchObject({
      code: ErrorCodes.INVALID_BASE_PACKAGE,
    });

    const resumeOpened = await importer.openForResume(packDir);
    expect(resumeOpened.mode).toBe('resume');
    expect(resumeOpened.partialState.pendingChunks.length).toBeGreaterThan(0);

    let exportCall = 0;
    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockImplementation(async (name) => {
      exportCall += 1;
      return {
        name,
        filename: `${name}.tar.zst`,
        originalSize: 4,
        compressedSize: 4,
        sha256: HASH_STUB,
      };
    });

    await exporter.resumeImagePack(resumeOpened, 3);
    expect(exportCall).toBeGreaterThan(0);

    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const onDisk = JSON.parse(raw) as { partialState?: unknown };
    expect(onDisk.partialState).toBeUndefined();

    const baseOpened = await importer.openAsBase(packDir);
    expect(baseOpened.mode).toBe('base');
    expectCompletedPackManifest(baseOpened.manifest);

    await expect(importer.openForResume(packDir)).rejects.toMatchObject({
      code: ErrorCodes.NOT_A_PARTIAL_PACKAGE,
    });
  });
});
