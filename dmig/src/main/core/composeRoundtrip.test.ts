import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorCodes } from '@shared/codes.js';
import type { ComposeExportRequest, ComposeProjectInfo } from '@shared/types.js';
import { ComposeExportManifestSession } from './manifest/composeExportManifestSession.js';
import { Importer } from './Importer.js';
import {
  expectCompletedPackManifest,
  makeDockerAdapterMock,
  makeTempDirManager,
} from './__test-fixtures__/index.js';

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

describe('Compose export → openAsBase roundtrip (U6-05)', () => {
  const tmp = makeTempDirManager();

  afterEach(async () => {
    vi.restoreAllMocks();
    await tmp.cleanupAll();
  });

  it('ComposeExportManifestSession 完了後に openAsBase で契約検証（Import 経路）', async () => {
    const out = await tmp.create('dmig-compose-rt-');
    const packDir = join(out, 'pack-compose.dmig');
    await mkdir(packDir, { recursive: true });

    const docker = makeDockerAdapterMock();
    const session = await ComposeExportManifestSession.create(
      packDir,
      composeExportReq(out),
      [minimalComposeTarget()],
      docker,
    );
    await session.writeInitial();
    await session.finalizeSuccess();

    const importer = new Importer(makeDockerAdapterMock());
    const opened = await importer.openAsBase(packDir);

    expect(opened.mode).toBe('base');
    expect(opened.packageDir).toBe(packDir);
    expectCompletedPackManifest(opened.manifest, { composeProjectName: 'proj-roundtrip' });

    await expect(importer.openForResume(packDir)).rejects.toMatchObject({
      code: ErrorCodes.NOT_A_PARTIAL_PACKAGE,
    });
  });
});
