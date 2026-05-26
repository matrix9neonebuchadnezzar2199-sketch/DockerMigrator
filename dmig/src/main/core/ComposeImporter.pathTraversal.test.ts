import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorCodes } from '@shared/codes.js';
import type { DmigManifest } from '@shared/types.js';
import { DmigError } from './errors/DmigError.js';
import { ComposeImporter } from './ComposeImporter.js';
import { Importer } from './Importer.js';
import { VolumeExporter } from './VolumeExporter.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  makeProjectManifest,
  makeTempDirManager,
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

describe('ComposeImporter path traversal (U6-02)', () => {
  const tmp = makeTempDirManager();

  beforeEach(() => {
    vi.stubEnv('DMIG_TAR_BACKEND', 'stream');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await tmp.cleanupAll();
    vi.clearAllMocks();
  });

  async function setupMinimalPackage(manifestFile: string): Promise<string> {
    const pkgDir = await tmp.create('dmig-pt-pkg-');
    const dmigManifest: DmigManifest = makeManifest({
      contents: {
        images: [],
        composeProjects: [
          {
            name: 'proj1',
            manifestFile,
            serviceCount: 0,
            volumeCount: 0,
            hasEnvFile: false,
            envFileMasked: false,
          },
        ],
      },
    });
    await writePackageManifest(pkgDir, dmigManifest);
    return pkgDir;
  }

  it('rejects manifestFile with parent traversal (E5010)', async () => {
    const pkgDir = await tmp.create('dmig-pt-pkg-');
    const manifestFile = '../../outside/project-manifest.json';
    const dmigManifest: DmigManifest = makeManifest({
      contents: {
        images: [],
        composeProjects: [
          {
            name: 'proj1',
            manifestFile,
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
    const importer = new ComposeImporter(docker, new Importer(docker), new VolumeExporter(docker));

    await expect(
      importer.importProjects(
        {
          packageDir: pkgDir,
          selectedProjects: ['proj1'],
          destinationDirs: { proj1: await tmp.create('dmig-pt-dest-') },
        },
        dmigManifest,
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.PATH_TRAVERSAL_DETECTED });
  });

  it('rejects buildContext tarFile with absolute path (E5010)', async () => {
    const pkgDir = await setupMinimalPackage('compose/proj1/project-manifest.json');
    await mkdir(join(pkgDir, 'compose/proj1'), { recursive: true });
    const pm = makeProjectManifest({
      projectName: 'proj1',
      configFiles: [],
      volumes: [],
      bindMounts: [],
      services: [
        {
          name: 'web',
          image: 'img:latest',
          imagePackaged: false,
          buildContext: {
            tarFile: '/absolute/evil.tar.zst',
            originalPath: 'ctx',
          },
        },
      ],
    });
    await writeFile(join(pkgDir, 'compose/proj1/project-manifest.json'), JSON.stringify(pm), 'utf-8');

    const docker = makeDockerAdapterMock();
    const importer = new ComposeImporter(docker, new Importer(docker), new VolumeExporter(docker));

    await expect(
      importer.importProjects(
        {
          packageDir: pkgDir,
          selectedProjects: ['proj1'],
          destinationDirs: { proj1: await tmp.create('dmig-pt-dest2-') },
        },
        makeManifest({
          contents: {
            images: [],
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
        }),
      ),
    ).rejects.toSatisfy((e: unknown) => e instanceof DmigError && e.code === ErrorCodes.PATH_TRAVERSAL_DETECTED);
  });

  it('allows normal manifest-relative paths', async () => {
    const pkgDir = await setupMinimalPackage('compose/proj1/project-manifest.json');
    await mkdir(join(pkgDir, 'compose/proj1'), { recursive: true });
    const pm = makeProjectManifest({
      projectName: 'proj1',
      configFiles: ['docker-compose.yml'],
      services: [],
      volumes: [],
      bindMounts: [],
      envFiles: [],
    });
    await writeFile(join(pkgDir, 'compose/proj1/project-manifest.json'), JSON.stringify(pm), 'utf-8');
    await writeFile(join(pkgDir, 'compose/proj1/docker-compose.yml'), 'services:\n', 'utf-8');

    const docker = makeDockerAdapterMock();
    const imageImporter = new Importer(docker);
    const importer = new ComposeImporter(docker, imageImporter, new VolumeExporter(docker));

    const dmigManifest = makeManifest({
      contents: {
        images: [],
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

    await expect(
      importer.importProjects(
        {
          packageDir: pkgDir,
          selectedProjects: ['proj1'],
          destinationDirs: { proj1: await tmp.create('dmig-pt-dest3-') },
        },
        dmigManifest,
      ),
    ).resolves.toBeUndefined();
  });
});
