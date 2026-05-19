import type { RollbackEntry, RollbackKind, RollbackRecord } from '@shared/types.js';
import type { DockerAdapter } from './DockerAdapter.js';

let entryCounter = 0;

function nextEntryId(prefix: string): string {
  entryCounter += 1;
  return `${prefix}-${String(entryCounter).padStart(3, '0')}`;
}

/** テスト用: ID カウンタをリセット */
export function resetRollbackEntryIds(): void {
  entryCounter = 0;
}

/**
 * manifest 名から docker-image エントリを生成（load 後に resolveImageId）。
 */
export async function buildDockerImageEntry(
  docker: DockerAdapter,
  imageName: string,
): Promise<RollbackEntry> {
  const resolved = await docker.resolveImageId(imageName);
  const hintParts: string[] = [imageName];
  if (!resolved) {
    hintParts.push('image_id_unresolved');
  }
  return {
    id: nextEntryId('img'),
    type: 'docker-image',
    target: resolved ?? imageName,
    hint: hintParts.join(' | '),
  };
}

export function buildDockerVolumeEntry(volumeName: string): RollbackEntry {
  return {
    id: nextEntryId('vol'),
    type: 'docker-volume',
    target: volumeName,
  };
}

export function buildDirectoryEntry(
  dirPath: string,
  hint?: string,
): RollbackEntry {
  return {
    id: nextEntryId('dir'),
    type: 'directory',
    target: dirPath,
    hint: hint ?? 'ホストファイルが削除されます',
  };
}

export function buildExportPackDirectoryEntry(packDir: string): RollbackEntry {
  return {
    id: nextEntryId('pack'),
    type: 'directory',
    target: packDir,
    hint: 'エクスポートした .dmig パック全体',
  };
}

export function createRollbackRecord(
  packageDir: string,
  kind: RollbackKind,
  entries: RollbackEntry[],
): RollbackRecord {
  return {
    schemaVersion: 1,
    kind,
    createdAt: new Date().toISOString(),
    packageDir,
    entries,
  };
}
