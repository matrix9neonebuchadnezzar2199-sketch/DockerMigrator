import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { PackageProbeStatus, ProbeSummary } from '@shared/types.js';
import { ResumableScanner } from './ResumableScanner.js';
import { makeTempDirManager } from './__test-fixtures__/index.js';

function probeFromDirNames(
  partialDirs: Set<string>,
  completeDirs: Set<string> = new Set(),
): (packageDir: string) => Promise<ProbeSummary> {
  return async (packageDir: string) => {
    const name = packageDir.replace(/\\/g, '/').split('/').pop() ?? '';
    let status: PackageProbeStatus = 'invalid_manifest';
    if (partialDirs.has(name)) status = 'ok_partial';
    else if (completeDirs.has(name)) status = 'ok_complete';
    return {
      packageDir,
      status,
      manifestPresent: status.startsWith('ok_'),
      pendingChunkCount: status === 'ok_partial' ? 1 : 0,
      lastUpdatedAt: status === 'ok_partial' ? '2026-01-01T00:00:00.000Z' : undefined,
      interruptionReason: status === 'ok_partial' ? 'user-cancel' : undefined,
    };
  };
}

async function touchManifest(dir: string): Promise<void> {
  await writeFile(join(dir, 'manifest.json'), '{"dmigVersion":"1.0.0"}', 'utf-8');
}

describe('ResumableScanner', () => {
  const tmp = makeTempDirManager();

  it('正常: 完成1 + 中断2 + 無関係 → packages.length === 2', async () => {
    const root = await tmp.create('dmig-scan-');
    await mkdir(join(root, 'complete.dmig'), { recursive: true });
    await mkdir(join(root, 'partial-a.dmig'), { recursive: true });
    await mkdir(join(root, 'partial-b.dmig'), { recursive: true });
    await mkdir(join(root, 'not-a-pack'), { recursive: true });
    await touchManifest(join(root, 'complete.dmig'));
    await touchManifest(join(root, 'partial-a.dmig'));
    await touchManifest(join(root, 'partial-b.dmig'));

    const scanner = new ResumableScanner(
      probeFromDirNames(new Set(['partial-a.dmig', 'partial-b.dmig']), new Set(['complete.dmig'])),
    );
    const result = await scanner.scan({ rootDir: root, maxDepth: 1 });
    expect(result.packages).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('maxDepth=2: 2階層下の中断パックを検出', async () => {
    const root = await tmp.create('dmig-scan-deep-');
    const nested = join(root, 'sub', 'nested.dmig');
    await mkdir(nested, { recursive: true });
    await touchManifest(nested);

    const scanner = new ResumableScanner(probeFromDirNames(new Set(['nested.dmig'])));
    const shallow = await scanner.scan({ rootDir: root, maxDepth: 1 });
    expect(shallow.packages).toHaveLength(0);

    const deep = await scanner.scan({ rootDir: root, maxDepth: 2 });
    expect(deep.packages).toHaveLength(1);
    expect(deep.packages[0]!.packageDir).toBe(nested);
  });

  it('maxDepth=3 指定 → 内部で 2 にクランプ', async () => {
    const root = await tmp.create('dmig-scan-clamp-');
    const deep = join(root, 'a', 'b', 'deep.dmig');
    await mkdir(deep, { recursive: true });
    await touchManifest(deep);

    const scanner = new ResumableScanner(probeFromDirNames(new Set(['deep.dmig'])));
    const result = await scanner.scan({ rootDir: root, maxDepth: 3 });
    expect(result.packages).toHaveLength(0);
    expect(ResumableScanner.clampDepth(3)).toBe(2);
  });

  it('rootDir 存在しない → root_not_found', async () => {
    const scanner = new ResumableScanner(probeFromDirNames(new Set()));
    const ghost = join(await tmp.create('dmig-scan-ghost-'), 'no-such-dir');
    const result = await scanner.scan({ rootDir: ghost });
    expect(result.packages).toEqual([]);
    expect(result.warnings).toContain('root_not_found');
  });

  it('上限超過 → truncated_at_50 警告', async () => {
    const root = await tmp.create('dmig-scan-trunc-');
    for (let i = 0; i < 5; i++) {
      const name = `partial-${i}.dmig`;
      const dir = join(root, name);
      await mkdir(dir, { recursive: true });
      await touchManifest(dir);
    }
    const partialNames = new Set(['partial-0.dmig', 'partial-1.dmig', 'partial-2.dmig', 'partial-3.dmig', 'partial-4.dmig']);
    const scanner = new ResumableScanner(probeFromDirNames(partialNames), { maxPackages: 3, maxDirsScanned: 500 });
    const result = await scanner.scan({ rootDir: root, maxDepth: 1 });
    expect(result.packages).toHaveLength(3);
    expect(result.warnings).toContain('truncated_at_50');
  });

  it.skipIf(process.platform === 'win32')('シンボリックリンクは追跡しない', async () => {
    const root = await tmp.create('dmig-scan-symlink-');
    const real = join(root, 'real.dmig');
    const link = join(root, 'link.dmig');
    await mkdir(real, { recursive: true });
    await touchManifest(real);
    await symlink(real, link, 'dir');

    const scanner = new ResumableScanner(probeFromDirNames(new Set(['real.dmig', 'link.dmig'])));
    const result = await scanner.scan({ rootDir: root, maxDepth: 1 });
    expect(result.packages).toHaveLength(1);
  });
});
