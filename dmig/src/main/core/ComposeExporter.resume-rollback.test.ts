import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DmigManifest } from '@shared/types.js';
import { ComposeExporter } from './ComposeExporter.js';
import { Exporter } from './Exporter.js';
import { VolumeExporter } from './VolumeExporter.js';
import type { OpenedPackageResume } from './importer/OpenedPackage.js';
import { ROLLBACK_FILENAME } from './RollbackManager.js';
import type { DockerAdapter } from './DockerAdapter.js';

describe('ComposeExporter.resumeComposePack — rollback.json', () => {
  let pkgDir: string;

  afterEach(async () => {
    if (pkgDir) {
      await rm(pkgDir, { recursive: true, force: true });
    }
  });

  it('resumeComposePack 正常完了後、packDir 直下に rollback.json が作成される', async () => {
    pkgDir = await mkdtemp(join(tmpdir(), 'dmig-compose-resume-rb-'));
    await mkdir(pkgDir, { recursive: true });

    const docker = {
      listComposeProjects: vi.fn().mockResolvedValue([]),
      ping: vi.fn().mockResolvedValue({ version: 'test' }),
    } as unknown as DockerAdapter;

    const imageExporter = new Exporter(docker);
    const volumeExporter = new VolumeExporter(docker);
    const composeExporter = new ComposeExporter(docker, imageExporter, volumeExporter);

    const manifest: DmigManifest = {
      dmigVersion: '1.0.0',
      schemaVersion: '1.1',
      createdAt: '2026-01-01T00:00:00.000Z',
      source: { os: 'linux', arch: 'x64', dockerVersion: 't', appVersion: '0.1.0-poc' },
      contents: { images: [], volumes: [], composeProjects: [] },
      totalSize: 0,
      partialState: {
        pendingChunks: [],
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        checksumPolicy: 'verify-resumed',
        interruptionReason: 'user-cancel',
      },
    };

    const opened: OpenedPackageResume = {
      mode: 'resume',
      packageDir: pkgDir,
      manifest,
      partialState: manifest.partialState!,
    };

    await composeExporter.resumeComposePack(opened, 3);

    const rb = JSON.parse(await readFile(join(pkgDir, ROLLBACK_FILENAME), 'utf-8')) as {
      kind: string;
    };
    expect(rb.kind).toBe('export');
  });
});
