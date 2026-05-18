import type { DmigManifest, PartialState } from '@shared/types.js';

/**
 * Importer.openAsBase() の戻り値。完了 package を表す。
 *
 * Importer は manifest を mutate しない契約（Exporter が書く）。
 * 型は参照の readonly のみで、ネストしたプロパティの不変は JSDoc で表明する。
 */
export interface OpenedPackageBase {
  readonly mode: 'base';
  readonly packageDir: string;
  readonly manifest: DmigManifest;
}

/**
 * Importer.openForResume() の戻り値。中断 package を表す。
 *
 * `partialState` は `manifest.partialState` と同一参照。
 * manifest を mutate しない契約は OpenedPackageBase と同じ。
 *
 * 不変条件: `partialState.pendingChunks.length >= 1`
 */
export interface OpenedPackageResume {
  readonly mode: 'resume';
  readonly packageDir: string;
  readonly manifest: DmigManifest;
  readonly partialState: PartialState;
}

export type OpenedPackage = OpenedPackageBase | OpenedPackageResume;
