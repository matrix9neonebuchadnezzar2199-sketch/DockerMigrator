import { join } from 'node:path';
import writeFileAtomic from 'write-file-atomic';

/**
 * package ルートの checksums.sha256 を原子的に書き込む（UPDATE-07 U6-07）。
 */
export async function writeChecksumsSha256(packDir: string, lines: string[]): Promise<void> {
  const body = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await writeFileAtomic(join(packDir, 'checksums.sha256'), body, { encoding: 'utf8' });
}
