import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_VERSION } from '@shared/appVersion.js';
import { DMIG_MANIFEST_VERSION } from '@shared/manifestVersion.js';
import { ErrorCodes } from '@shared/codes.js';
import type { ComposeExportRequest, ComposeProjectInfo, ExportRequest } from '@shared/types.js';
import { DmigError } from './errors/DmigError.js';
import { Exporter } from './Exporter.js';
import { Importer } from './Importer.js';
import { ComposeExportManifestSession } from './manifest/composeExportManifestSession.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  makeTempDirManager,
  writePackageManifest,
} from './__test-fixtures__/index.js';

const HASH_STUB = 'c'.repeat(64);

function makeDockerForImageExport() {
  return makeDockerAdapterMock({
    listImages: async () => [
      { id: 'id1', repoTags: ['imgA:latest'], size: 4096, created: 0 },
    ],
    getImageOriginalSize: async () => 4096,
    saveImageStream: async () => Readable.from(Buffer.from('layer')),
  });
}

function minimalComposeTarget(): ComposeProjectInfo {
  return {
    name: 'proj-roundtrip',
    configFiles: [],
    workingDir: '',
    services: [{ name: 'web', image: 'imgA:latest', buildContextPath: null, state: 'running' }],
    volumeNames: [],
    bindMounts: [],
    envFiles: [],
    estimatedSize: 4096,
  };
}

function composeExportReq(outputDir: string): ComposeExportRequest {
  return {
    projectNames: ['proj-roundtrip'],
    outputDir,
    jobToken: randomUUID(),
    secretActions: {},
    bindMountChoices: {},
  };
}

describe('export → Importer.readManifest roundtrip (hotfix-2)', () => {
  const tmp = makeTempDirManager();

  afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanupAll();
  });

  it('Exporter.exportImages が書いた manifest.json を readManifest できる', async () => {
    const out = await tmp.create('dmig-rt-img-out-');
    const docker = makeDockerForImageExport();

    vi.spyOn(Exporter.prototype, 'exportSingleImagePublic').mockResolvedValue({
      name: 'imgA:latest',
      filename: 'imgA_latest.tar.zst',
      originalSize: 4,
      compressedSize: 4,
      sha256: HASH_STUB,
    });

    const exporter = new Exporter(docker);
    const req: ExportRequest = {
      outputDir: out,
      imageNames: ['imgA:latest'],
      jobToken: randomUUID(),
    };
    const { packDir } = await exporter.exportImages(req);

    const raw = await readFile(join(packDir, 'manifest.json'), 'utf-8');
    const onDisk = JSON.parse(raw) as { dmigVersion: string; source?: { appVersion?: string } };
    expect(onDisk.dmigVersion).toBe(DMIG_MANIFEST_VERSION);

    const importer = new Importer(makeDockerAdapterMock());
    const read = await importer.readManifest(packDir);
    expect(read.dmigVersion).toBe('1.1');
    expect(read.schemaVersion).toBe('1.1');
    expect(read.source.appVersion).toBe(APP_VERSION);
    expect(read.partialState).toBeUndefined();
  });

  it('ComposeExportManifestSession.create → finalizeSuccess の manifest を readManifest できる', async () => {
    const out = await tmp.create('dmig-rt-compose-out-');
    const packDir = join(out, 'pack-compose.dmig');
    await mkdir(packDir, { recursive: true });

    const docker = makeDockerForImageExport();
    const target = minimalComposeTarget();
    const session = await ComposeExportManifestSession.create(
      packDir,
      composeExportReq(out),
      [target],
      docker,
    );
    await session.writeInitial();
    await session.finalizeSuccess();

    const importer = new Importer(makeDockerAdapterMock());
    const read = await importer.readManifest(packDir);
    expect(read.dmigVersion).toBe('1.1');
    expect(read.schemaVersion).toBe('1.1');
    expect(read.source.appVersion).toBe(APP_VERSION);
    expect(read.partialState).toBeUndefined();
    expect(read.contents.composeProjects?.some((c) => c.name === 'proj-roundtrip')).toBe(true);
  });

  it('legacy dmigVersion 0.2.0-poc は PACK_VERSION_INCOMPATIBLE', async () => {
    const dir = await tmp.create('dmig-rt-legacy-');
    await writePackageManifest(dir, makeManifest({ dmigVersion: '0.2.0-poc' }));

    const importer = new Importer(makeDockerAdapterMock());
    await expect(importer.readManifest(dir)).rejects.toSatisfy(
      (e: unknown) => e instanceof DmigError && e.code === ErrorCodes.PACK_VERSION_INCOMPATIBLE,
    );
  });
});
