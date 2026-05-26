import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { MAX_COMPOSE_CONFIG_FILE_BYTES } from '@shared/limits.js';
import { ErrorCodes } from '../errors/codes.js';
import { assertComposeConfigFileWithinLimit } from './composeConfigGuard.js';

describe('assertComposeConfigFileWithinLimit', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('上限内のファイルは通過する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dmig-cfg-'));
    dirs.push(dir);
    const path = join(dir, 'docker-compose.yml');
    await writeFile(path, 'services: {}\n');
    await expect(assertComposeConfigFileWithinLimit(path)).resolves.toBeUndefined();
  });

  it('上限超過は E2012', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dmig-cfg-big-'));
    dirs.push(dir);
    const path = join(dir, 'docker-compose.yml');
    await writeFile(path, Buffer.alloc(MAX_COMPOSE_CONFIG_FILE_BYTES + 1));
    await expect(assertComposeConfigFileWithinLimit(path)).rejects.toMatchObject({
      code: ErrorCodes.COMPOSE_CONFIG_READ_FAILED,
    });
  });
});
