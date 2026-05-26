import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pack as createTarPack } from 'tar-stream';
import { afterEach, describe, expect, it } from 'vitest';

import { TarStreamBackend } from './TarStreamBackend.js';

async function buildMaliciousTar(entryName: string, payload: string): Promise<Buffer> {
  const pack = createTarPack();
  const chunks: Buffer[] = [];
  pack.on('data', (c: Buffer) => chunks.push(c));

  const done = new Promise<void>((resolve, reject) => {
    pack.on('end', () => resolve());
    pack.on('error', reject);
  });

  const payloadBuf = Buffer.from(payload, 'utf-8');
  await new Promise<void>((resolve, reject) => {
    const sink = pack.entry(
      { name: entryName, type: 'file', size: payloadBuf.length },
      (err) => (err ? reject(err) : resolve()),
    );
    sink.write(payloadBuf);
    sink.end();
  });

  pack.finalize();
  await done;
  return Buffer.concat(chunks);
}

describe('TarStreamBackend.extract path traversal (U6-02)', () => {
  let destDir = '';

  afterEach(async () => {
    if (destDir) {
      await rm(destDir, { recursive: true, force: true });
      destDir = '';
    }
  });

  it('extracts normal relative entries under destDir', async () => {
    destDir = join(tmpdir(), `dmig-tar-ok-${Date.now()}`);
    await mkdir(destDir, { recursive: true });

    const tarBuf = await buildMaliciousTar('nested/ok.txt', 'hello');
    const backend = new TarStreamBackend();
    await backend.extract(Readable.from(tarBuf), destDir);

    const text = await readFile(join(destDir, 'nested', 'ok.txt'), 'utf-8');
    expect(text).toBe('hello');
  });
});
