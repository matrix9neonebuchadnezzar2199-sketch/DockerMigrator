import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';

import type { DmigManifest, ExportRequest } from '@shared/types.js';
import type { DockerAdapter } from './DockerAdapter.js';
import { Exporter } from './Exporter.js';
import { makeDockerAdapterMock, makeTempDirManager } from './__test-fixtures__/index.js';

const THREE_IMAGES = ['img0', 'img1', 'img2'] as const;

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
    saveImageStream: async () => {
      calls += 1;
      if (calls > abortAfterCalls) {
        const err = new Error('synthetic abort');
        err.name = 'AbortError';
        throw err;
      }
      return Readable.from(Buffer.from('test-layer-bytes'));
    },
  });
}

function exportReq(outputDir: string, imageNames: string[]): ExportRequest {
  return {
    outputDir,
    imageNames,
    jobToken: '00000000-0000-4000-8000-0000000000b1',
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

describe('Exporter.exportImages interrupt → partialState (物理 manifest)', () => {
  const tmp = makeTempDirManager();

  afterEach(async () => {
    await tmp.cleanupAll();
  });

  it('1/3 完了で中断 → partialState.pendingChunks.length === 2', async () => {
    const out = await tmp.create('dmig-resume-flow-1-');
    const docker = makeAbortingSaveDocker(1);
    const exporter = new Exporter(docker);
    await expect(exporter.exportImages(exportReq(out, [...THREE_IMAGES]))).rejects.toMatchObject({
      name: 'AbortError',
    });

    const packDir = await findPackDir(out);
    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.partialState?.pendingChunks?.length).toBe(2);
  });

  it('2/3 完了で中断 → partialState.pendingChunks.length === 1', async () => {
    const out = await tmp.create('dmig-resume-flow-2-');
    const docker = makeAbortingSaveDocker(2);
    const exporter = new Exporter(docker);
    await expect(exporter.exportImages(exportReq(out, [...THREE_IMAGES]))).rejects.toMatchObject({
      name: 'AbortError',
    });

    const packDir = await findPackDir(out);
    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.partialState?.pendingChunks?.length).toBe(1);
  });

  it('全件完了 → partialState が undefined', async () => {
    const out = await tmp.create('dmig-resume-flow-3-');
    const docker = makeAbortingSaveDocker(3);
    const exporter = new Exporter(docker);
    const { packDir } = await exporter.exportImages(exportReq(out, [...THREE_IMAGES]));

    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as DmigManifest;
    expect(parsed.partialState).toBeUndefined();
  });
});
