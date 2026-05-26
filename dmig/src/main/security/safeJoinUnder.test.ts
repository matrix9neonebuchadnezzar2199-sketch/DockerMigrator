import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCodes } from '@shared/codes.js';
import { DmigError } from '../core/errors/DmigError.js';
import { assertPathUnderRoot, safeJoinUnder } from './safeJoinUnder.js';

describe('safeJoinUnder', () => {
  let root = '';

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = '';
    }
  });

  async function makeRoot(): Promise<string> {
    root = join(tmpdir(), `dmig-safe-join-${Date.now()}`);
    await mkdir(root, { recursive: true });
    return root;
  }

  it('joins a normal relative path under root', async () => {
    const r = await makeRoot();
    const out = safeJoinUnder(r, 'images/sha256.tar.zst');
    expect(out).toBe(join(r, 'images', 'sha256.tar.zst'));
  });

  it('rejects parent traversal with ../', async () => {
    const r = await makeRoot();
    expect(() => safeJoinUnder(r, '../../etc/passwd')).toThrow(
      expect.objectContaining({ code: ErrorCodes.PATH_TRAVERSAL_DETECTED }),
    );
  });

  it('rejects Windows-style parent traversal', async () => {
    const r = await makeRoot();
    expect(() => safeJoinUnder(r, '..\\secret')).toThrow(DmigError);
  });

  it('rejects absolute paths', async () => {
    const r = await makeRoot();
    expect(() => safeJoinUnder(r, '/absolute/path')).toThrow(
      expect.objectContaining({ code: ErrorCodes.PATH_TRAVERSAL_DETECTED }),
    );
  });

  it('rejects empty relative path', async () => {
    const r = await makeRoot();
    expect(() => safeJoinUnder(r, '   ')).toThrow(DmigError);
  });
});

describe('assertPathUnderRoot', () => {
  it('allows target equal to root', () => {
    const root = 'C:\\pack\\dmig-test';
    expect(() => assertPathUnderRoot(root, root)).not.toThrow();
  });

  it('allows subdirectory of root', () => {
    const root = 'C:\\pack\\dmig-test';
    expect(() => assertPathUnderRoot(root, join(root, 'images'))).not.toThrow();
  });

  it('rejects target outside root', () => {
    expect(() => assertPathUnderRoot('C:\\pack\\a', 'C:\\other\\b')).toThrow(
      expect.objectContaining({ code: ErrorCodes.PATH_TRAVERSAL_DETECTED }),
    );
  });
});
