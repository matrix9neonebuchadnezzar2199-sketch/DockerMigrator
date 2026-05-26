import { expect } from 'vitest';

import { APP_VERSION } from '@shared/appVersion.js';
import type { DmigManifest } from '@shared/types.js';

/**
 * 完了パック manifest のデータ契約（§19 / hotfix-2 / U6-05）。
 */
export function expectCompletedPackManifest(
  manifest: DmigManifest,
  options?: { composeProjectName?: string },
): void {
  expect(manifest.dmigVersion).toBe('1.1');
  expect(manifest.schemaVersion).toBe('1.1');
  expect(manifest.source.appVersion).toBe(APP_VERSION);
  expect(manifest.partialState).toBeUndefined();

  if (options?.composeProjectName) {
    expect(
      manifest.contents.composeProjects?.some((c) => c.name === options.composeProjectName),
    ).toBe(true);
  }
}
