import type { BrowserWindow } from 'electron';
import type { DmigErrorPayload, DmigManifest } from '@shared/types.js';
import type { Snapshot } from '@shared/snapshot-types.js';
import { DmigError } from '../core/errors/DmigError.js';
import { ErrorCodes, ErrorMessages } from '../core/errors/codes.js';
import type { DockerAdapter } from '../core/DockerAdapter.js';

/** `register*Handlers` に渡す Main 側の共有依存。 */
export interface HandlerDeps {
  win: BrowserWindow;
  docker: DockerAdapter;
}

export function applyDeltaManifestInPlace(manifest: DmigManifest, base: Snapshot): void {
  manifest.schemaVersion = '1.1';
  manifest.previousPackage = { id: base.id, createdAt: base.createdAt };
  manifest.baseRef = base.id;
  for (const img of manifest.contents.images) {
    img.kind = 'delta';
    img.baseRef = base.id;
  }
  if (manifest.contents.volumes) {
    for (const vol of manifest.contents.volumes) {
      vol.kind = 'delta';
      vol.baseRef = base.id;
    }
  }
  if (manifest.contents.composeProjects) {
    for (const cp of manifest.contents.composeProjects) {
      cp.kind = 'delta';
      cp.baseRef = base.id;
    }
  }
}

export function toPayload(e: unknown): DmigErrorPayload {
  if (e instanceof DmigError) return e.toPayload();
  return {
    code: ErrorCodes.UNKNOWN_ERROR,
    message: ErrorMessages[ErrorCodes.UNKNOWN_ERROR],
    detail: e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e),
  };
}
