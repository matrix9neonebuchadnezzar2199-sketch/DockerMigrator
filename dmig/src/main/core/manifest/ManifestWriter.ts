import { join } from 'node:path';
import writeFileAtomic from 'write-file-atomic';

import type { DmigManifest } from '@shared/types.js';

/**
 * manifest.json の原子的書き込み。
 *
 * `write-file-atomic` により Windows / POSIX で可能な限り原子的に置換する。
 */
export class ManifestWriter {
  /**
   * packageDir 直下の manifest.json を JSON で書き込む。
   *
   * Args:
   *   packageDir: パッケージルート。
   *   manifest: 書き込むオブジェクト。
   */
  async write(packageDir: string, manifest: DmigManifest): Promise<void> {
    const manifestPath = join(packageDir, 'manifest.json');
    const json = JSON.stringify(manifest, null, 2);
    await writeFileAtomic(manifestPath, json, { encoding: 'utf8' });
  }
}
