import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DMIG_MANIFEST_VERSION } from '@shared/manifestVersion.js';
import { ErrorCodes } from '@shared/codes.js';
import { DmigError } from './errors/DmigError.js';
import { Importer } from './Importer.js';
import { makeDockerAdapterMock, makeManifest, makeTempDirManager } from './__test-fixtures__/index.js';

describe('manifest dmigVersion roundtrip (B-38)', () => {
  const tmp = makeTempDirManager();

  afterEach(async () => {
    await tmp.cleanupAll();
  });

  it('DMIG_MANIFEST_VERSION の manifest は Importer.readManifest を通る', async () => {
    const dir = await tmp.create('b38-ok-');
    const manifest = makeManifest({ dmigVersion: DMIG_MANIFEST_VERSION });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');

    const importer = new Importer(makeDockerAdapterMock());
    const read = await importer.readManifest(dir);
    expect(read.dmigVersion).toBe('1.1');
  });

  it('legacy 0.2.0-poc dmigVersion は PACK_VERSION_INCOMPATIBLE', async () => {
    const dir = await tmp.create('b38-legacy-');
    const manifest = makeManifest({ dmigVersion: '0.2.0-poc' });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');

    const importer = new Importer(makeDockerAdapterMock());
    await expect(importer.readManifest(dir)).rejects.toSatisfy(
      (e: unknown) => e instanceof DmigError && e.code === ErrorCodes.PACK_VERSION_INCOMPATIBLE,
    );
  });
});
