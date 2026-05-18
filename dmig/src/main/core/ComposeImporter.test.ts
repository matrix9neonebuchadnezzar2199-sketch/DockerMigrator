import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ErrorCodes } from '@shared/codes.js';
import type { DmigManifest } from '@shared/types.js';
import { ComposeImporter } from './ComposeImporter.js';
import { Importer } from './Importer.js';
import { VolumeExporter } from './VolumeExporter.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  makeProjectManifest,
  makeTempDirManager,
  writeSyntheticImageTarZst,
  writePackageManifest,
} from './__test-fixtures__/index.js';

vi.mock('./tar/selectTarBackend.js', () => ({
  resetTarBackendCache: vi.fn(),
  selectTarBackend: vi.fn(async () => ({
    name: 'stream' as const,
    pack: vi.fn().mockResolvedValue(undefined),
    extract: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('ComposeImporter.importProjects', () => {
  const tmp = makeTempDirManager();

  beforeEach(() => {
    vi.stubEnv('DMIG_TAR_BACKEND', 'stream');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await tmp.cleanupAll();
    vi.clearAllMocks();
  });

  it('image-only: importImages が OpenedPackageBase (mode=base, manifest 同一参照) で呼ばれる', async () => {
    const pkgDir = await tmp.create('dmig-compose-pkg-');
    const destDir = await tmp.create('dmig-compose-dest-');
    const { sha256 } = await writeSyntheticImageTarZst(pkgDir, 'images/imgA.tar.zst');
    const dmigManifest: DmigManifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA:latest',
            filename: 'images/imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256,
          },
        ],
        composeProjects: [
          {
            name: 'proj1',
            manifestFile: 'compose/proj1/project-manifest.json',
            serviceCount: 1,
            volumeCount: 0,
            hasEnvFile: false,
            envFileMasked: false,
          },
        ],
      },
    });
    await writePackageManifest(pkgDir, dmigManifest);
    await mkdir(join(pkgDir, 'compose/proj1'), { recursive: true });
    const pm = makeProjectManifest({
      projectName: 'proj1',
      configFiles: ['docker-compose.yml'],
      volumes: [],
      bindMounts: [],
    });
    await writeFile(join(pkgDir, 'compose/proj1/project-manifest.json'), JSON.stringify(pm), 'utf-8');
    await writeFile(join(pkgDir, 'compose/proj1/docker-compose.yml'), 'services:\n', 'utf-8');

    const docker = makeDockerAdapterMock();
    const imageImporter = new Importer(docker);
    const spy = vi.spyOn(imageImporter, 'importImages').mockResolvedValue(undefined);
    const composeImporter = new ComposeImporter(docker, imageImporter, new VolumeExporter(docker));

    await composeImporter.importProjects(
      {
        packageDir: pkgDir,
        selectedProjects: ['proj1'],
        destinationDirs: { proj1: destDir },
        jobToken: '00000000-0000-4000-8000-0000000000a1',
      },
      dmigManifest,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const arg0 = spy.mock.calls[0]![0];
    expect(arg0.mode).toBe('base');
    expect(arg0.packageDir).toBe(pkgDir);
    expect(arg0.manifest).toBe(dmigManifest);
    expect(spy.mock.calls[0]![1]).toEqual(['imgA:latest']);
  });

  it('image + volume: importImages の後に importVolumeStream が呼ばれる', async () => {
    const pkgDir = await tmp.create('dmig-compose-pkg-');
    const destDir = await tmp.create('dmig-compose-dest-');
    const { sha256 } = await writeSyntheticImageTarZst(pkgDir, 'images/imgA.tar.zst');
    await writeSyntheticImageTarZst(pkgDir, 'volumes/v1.tar.zst', 'vol-payload');
    const dmigManifest: DmigManifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA:latest',
            filename: 'images/imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256,
          },
        ],
        composeProjects: [
          {
            name: 'proj1',
            manifestFile: 'compose/proj1/project-manifest.json',
            serviceCount: 1,
            volumeCount: 1,
            hasEnvFile: false,
            envFileMasked: false,
          },
        ],
      },
    });
    await writePackageManifest(pkgDir, dmigManifest);
    await mkdir(join(pkgDir, 'compose/proj1'), { recursive: true });
    const pm = makeProjectManifest({
      projectName: 'proj1',
      services: [
        {
          name: 'svc',
          image: 'imgA:latest',
          imagePackaged: true,
          buildContext: null,
        },
      ],
      volumes: [
        {
          name: 'v1',
          packaged: true,
          tarFile: 'volumes/v1.tar.zst',
          driver: 'local',
        },
      ],
      bindMounts: [],
    });
    await writeFile(join(pkgDir, 'compose/proj1/project-manifest.json'), JSON.stringify(pm), 'utf-8');
    await writeFile(join(pkgDir, 'compose/proj1/docker-compose.yml'), 'services:\n', 'utf-8');

    const importVolSpy = vi.fn().mockResolvedValue(undefined);
    const docker = makeDockerAdapterMock({ importVolumeStream: importVolSpy });
    const imageImporter = new Importer(docker);
    vi.spyOn(imageImporter, 'importImages').mockResolvedValue(undefined);
    const composeImporter = new ComposeImporter(docker, imageImporter, new VolumeExporter(docker));

    await composeImporter.importProjects(
      {
        packageDir: pkgDir,
        selectedProjects: ['proj1'],
        destinationDirs: { proj1: destDir },
        jobToken: '00000000-0000-4000-8000-0000000000a2',
      },
      dmigManifest,
    );

    expect(importVolSpy).toHaveBeenCalled();
    expect(importVolSpy.mock.calls[0]![0]).toBe('v1');
  });

  it('異常: selectedProjects が manifest に無い → E2011', async () => {
    const pkgDir = await tmp.create('dmig-compose-pkg-');
    const destDir = await tmp.create('dmig-compose-dest-');
    const dmigManifest = makeManifest({
      contents: {
        images: [],
        composeProjects: [
          {
            name: 'proj1',
            manifestFile: 'compose/proj1/project-manifest.json',
            serviceCount: 0,
            volumeCount: 0,
            hasEnvFile: false,
            envFileMasked: false,
          },
        ],
      },
    });
    await writePackageManifest(pkgDir, dmigManifest);

    const docker = makeDockerAdapterMock();
    const composeImporter = new ComposeImporter(docker, new Importer(docker), new VolumeExporter(docker));

    await expect(
      composeImporter.importProjects(
        {
          packageDir: pkgDir,
          selectedProjects: ['ghost'],
          destinationDirs: { proj1: destDir },
          jobToken: '00000000-0000-4000-8000-0000000000a3',
        },
        dmigManifest,
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.COMPOSE_NOT_FOUND });
  });
});
