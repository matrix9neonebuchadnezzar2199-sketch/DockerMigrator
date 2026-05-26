import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RollbackRecord } from '@shared/types.js';
import type { DockerAdapter } from './DockerAdapter.js';
import { RollbackManager, ROLLBACK_FILENAME } from './RollbackManager.js';

describe('RollbackManager.executeRollback — cancel', () => {
  let pkgDir: string;

  afterEach(async () => {
    if (pkgDir) {
      await rm(pkgDir, { recursive: true, force: true });
    }
  });

  it('signal.aborted で部分結果と cancelled=true を返し executedAt は付けない', async () => {
    pkgDir = await mkdtemp(join(tmpdir(), 'dmig-rb-cancel-'));
    const record: RollbackRecord = {
      schemaVersion: 1,
      kind: 'import',
      packageDir: pkgDir,
      createdAt: '2026-01-01T00:00:00.000Z',
      entries: [
        { id: 'e1', type: 'docker-image', target: 'img:a' },
        { id: 'e2', type: 'docker-image', target: 'img:b' },
      ],
    };
    await writeFile(join(pkgDir, ROLLBACK_FILENAME), JSON.stringify(record, null, 2), 'utf-8');

    const removeImage = vi.fn().mockResolvedValue(undefined);
    const docker = { removeImage } as unknown as DockerAdapter;
    const manager = new RollbackManager(docker);

    const ac = new AbortController();
    removeImage.mockImplementationOnce(async () => {
      ac.abort();
    });

    const result = await manager.executeRollback(pkgDir, undefined, ac.signal);

    expect(result.cancelled).toBe(true);
    expect(result.succeeded).toEqual(['e1']);
    expect(removeImage).toHaveBeenCalledTimes(1);

    const reloaded = await manager.loadRecord(pkgDir);
    expect(reloaded?.executedAt).toBeUndefined();
  });
});
