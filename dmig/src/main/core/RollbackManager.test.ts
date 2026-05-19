import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { RollbackRecord } from '@shared/types.js';
import { RollbackManager } from './RollbackManager.js';
import { makeDockerAdapterMock, makeTempDirManager } from './__test-fixtures__/index.js';
import { createRollbackRecord } from './rollbackRecordBuilder.js';

async function writePackWithManifest(dir: string): Promise<void> {
  await writeFile(join(dir, 'manifest.json'), '{"dmigVersion":"1.0.0","contents":{}}', 'utf-8');
}

describe('RollbackManager', () => {
  const tmp = makeTempDirManager();

  it('loadRecord: ファイルなし → null', async () => {
    const root = await tmp.create('rb-load-');
    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    expect(await mgr.loadRecord(root)).toBeNull();
  });

  it('saveRecord / loadRecord ラウンドトリップ', async () => {
    const root = await tmp.create('rb-round-');
    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    const record = createRollbackRecord(root, 'export', []);
    await mgr.saveRecord(root, record);
    const loaded = await mgr.loadRecord(root);
    expect(loaded?.kind).toBe('export');
    expect(loaded?.packageDir).toBe(root);
  });

  it('listRecords: manifest + rollback.json を検出', async () => {
    const root = await tmp.create('rb-list-');
    const pack = join(root, 'pack.dmig');
    await mkdir(pack, { recursive: true });
    await writePackWithManifest(pack);
    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    await mgr.saveRecord(pack, createRollbackRecord(pack, 'import', []));

    const result = await mgr.listRecords({ rootDir: root, maxDepth: 1 });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.supported).toBe(true);
    expect(result.records[0]!.kind).toBe('import');
  });

  it('executeRollback: already_executed', async () => {
    const root = await tmp.create('rb-exec-');
    await writePackWithManifest(root);
    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    const record: RollbackRecord = {
      ...createRollbackRecord(root, 'import', []),
      executedAt: '2026-01-01T00:00:00.000Z',
    };
    await mgr.saveRecord(root, record);
    const result = await mgr.executeRollback(root);
    expect(result.warnings).toContain('already_executed');
    expect(result.succeeded).toHaveLength(0);
  });

  it('import directory: 空でない → skipped + directory_not_empty', async () => {
    const root = await tmp.create('rb-dir-full-');
    await writePackWithManifest(root);
    const targetDir = join(root, 'dest');
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, 'user.txt'), 'data', 'utf-8');

    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    const record = createRollbackRecord(root, 'import', [
      { id: 'dir-001', type: 'directory', target: targetDir },
    ]);
    await mgr.saveRecord(root, record);

    const result = await mgr.executeRollback(root);
    expect(result.skipped).toContain('dir-001');
    expect(result.warnings.some((w) => w.startsWith('directory_not_empty:dir-001'))).toBe(true);
  });

  it('import directory: 空 → 削除成功', async () => {
    const root = await tmp.create('rb-dir-empty-');
    await writePackWithManifest(root);
    const targetDir = join(root, 'empty-dest');
    await mkdir(targetDir, { recursive: true });

    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    const record = createRollbackRecord(root, 'import', [
      { id: 'dir-002', type: 'directory', target: targetDir },
    ]);
    await mgr.saveRecord(root, record);

    const result = await mgr.executeRollback(root);
    expect(result.succeeded).toContain('dir-002');
  });

  it.skipIf(process.platform === 'win32')(
    'file: symlink はリンクのみ削除（追跡しない）',
    async () => {
    const root = await tmp.create('rb-symlink-');
    await writePackWithManifest(root);
    const realFile = join(root, 'real.txt');
    const linkPath = join(root, 'link.txt');
    await writeFile(realFile, 'keep', 'utf-8');
    await symlink(realFile, linkPath);

    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    const record = createRollbackRecord(root, 'import', [
      { id: 'file-001', type: 'file', target: linkPath },
    ]);
    await mgr.saveRecord(root, record);

    const result = await mgr.executeRollback(root);
    expect(result.succeeded).toContain('file-001');
    const { access } = await import('node:fs/promises');
    await expect(access(realFile)).resolves.toBeUndefined();
    await expect(access(linkPath)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('export directory: 非空でも強制削除', async () => {
    const root = await tmp.create('rb-export-force-');
    await writePackWithManifest(root);
    const packDir = join(root, 'pack-tree');
    await mkdir(packDir, { recursive: true });
    await writeFile(join(packDir, 'data.bin'), 'x', 'utf-8');

    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    const record = createRollbackRecord(root, 'export', [
      { id: 'pack-001', type: 'directory', target: packDir },
    ]);
    await mgr.saveRecord(root, record);

    const result = await mgr.executeRollback(root);
    expect(result.succeeded).toContain('pack-001');
    const { access } = await import('node:fs/promises');
    await expect(access(packDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('docker-image: removeImage が呼ばれる', async () => {
    const root = await tmp.create('rb-img-');
    await writePackWithManifest(root);
    const removeImage = vi.fn().mockResolvedValue(undefined);
    const docker = makeDockerAdapterMock();
    Object.assign(docker, { removeImage });

    const mgr = new RollbackManager(docker);
    const record = createRollbackRecord(root, 'import', [
      {
        id: 'img-001',
        type: 'docker-image',
        target: 'sha256:abc',
        hint: 'myapp:latest',
      },
    ]);
    await mgr.saveRecord(root, record);

    const result = await mgr.executeRollback(root);
    expect(removeImage).toHaveBeenCalledWith('sha256:abc');
    expect(result.succeeded).toContain('img-001');
  });

  it('docker-network: 予約型は skipped', async () => {
    const root = await tmp.create('rb-net-');
    await writePackWithManifest(root);
    const docker = makeDockerAdapterMock();
    const mgr = new RollbackManager(docker);
    const record = createRollbackRecord(root, 'import', [
      { id: 'net-001', type: 'docker-network', target: 'bridge' },
    ]);
    await mgr.saveRecord(root, record);

    const result = await mgr.executeRollback(root);
    expect(result.skipped).toContain('net-001');
  });

  it('clampDepth: 1〜2 にクランプ', () => {
    expect(RollbackManager.clampDepth(0)).toBe(1);
    expect(RollbackManager.clampDepth(3)).toBe(2);
  });
});
