import { describe, it, expect, afterEach } from 'vitest';

import { ErrorCodes } from '@shared/codes.js';
import { Importer } from './Importer.js';
import type { OpenedPackageBase } from './importer/OpenedPackage.js';
import { makeDockerAdapterMock, makeManifest, makeTempDirManager } from './__test-fixtures__/index.js';

describe('Importer.importImages path traversal (U6-01)', () => {
  const tmp = makeTempDirManager();

  afterEach(async () => {
    await tmp.cleanupAll();
  });

  it('manifest の filename が ../ を含むと E5010', async () => {
    const dir = await tmp.create('dmig-import-pt-');
    const manifest = makeManifest({
      contents: {
        images: [
          {
            name: 'evil:latest',
            filename: '../../etc/passwd',
            originalSize: 1,
            compressedSize: 1,
            sha256: '0'.repeat(64),
          },
        ],
      },
    });
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    const importer = new Importer(makeDockerAdapterMock());

    await expect(importer.importImages(opened, ['evil:latest'])).rejects.toMatchObject({
      code: ErrorCodes.PATH_TRAVERSAL_DETECTED,
    });
  });
});
