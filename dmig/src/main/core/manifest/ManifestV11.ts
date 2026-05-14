/**
 * Phase 6: manifest スキーマ v1.1 の型定義と migration ヘルパー。
 * v1.0 (schemaVersion 不在) との後方互換を保証する。
 *
 * 規約:
 * - 読み込み時: schemaVersion が無ければ '1.0' とみなし、各 entry の kind は 'full' に補完
 * - 書き込み時: 新規パッケージは次フェーズから '1.1' で書き出す（本モジュールの toV11 を利用）
 * - v1.0 パッケージは差分の基底になれない（previousPackage 参照不可、canBeBaseForDelta は false）
 */
import type { DmigManifest, ManifestComposeEntry, ManifestImageEntry, ManifestVolumeEntry } from '@shared/types.js';

/** schemaVersion 値。 */
export type ManifestSchemaVersion = '1.0' | '1.1';

/** v1.1 で正規化された manifest（読み込み後の内部表現）。 */
export interface NormalizedManifest extends DmigManifest {
  schemaVersion: ManifestSchemaVersion;
}

/**
 * 読み込んだ manifest を正規化する。
 * v1.0 のフィールド欠落をデフォルト値で補完する。
 *
 * @param raw - JSON.parse 直後の manifest オブジェクト
 * @returns 正規化済み manifest
 */
export function normalizeManifest(raw: DmigManifest): NormalizedManifest {
  const schemaVersion: ManifestSchemaVersion = raw.schemaVersion ?? '1.0';
  const contents = raw.contents ?? { images: [] };

  const images: ManifestImageEntry[] = (contents.images ?? []).map((e) => ({
    ...e,
    kind: e.kind ?? 'full',
  }));

  const volumes: ManifestVolumeEntry[] | undefined =
    contents.volumes !== undefined
      ? contents.volumes.map((e) => ({
          ...e,
          kind: e.kind ?? 'full',
        }))
      : undefined;

  const composeProjects: ManifestComposeEntry[] | undefined =
    contents.composeProjects !== undefined
      ? contents.composeProjects.map((e) => ({
          ...e,
          kind: e.kind ?? 'full',
        }))
      : undefined;

  return {
    ...raw,
    schemaVersion,
    contents: {
      ...contents,
      images,
      ...(volumes !== undefined ? { volumes } : {}),
      ...(composeProjects !== undefined ? { composeProjects } : {}),
    },
  };
}

/**
 * v1.0 として読み込んだ manifest が差分の基底として使用可能かを判定する。
 * v1.0 は previousPackage 情報を持たないため、スキーマが 1.1 のときのみ true。
 */
export function canBeBaseForDelta(manifest: NormalizedManifest): boolean {
  return manifest.schemaVersion === '1.1';
}

/**
 * 書き出し用に manifest を v1.1 形式に変換する。
 * schemaVersion を必ず '1.1' に設定する。
 *
 * @param manifest - 正規化済みまたは生の manifest
 * @returns schemaVersion が '1.1' の manifest
 */
export function toV11(manifest: DmigManifest): NormalizedManifest {
  const normalized = normalizeManifest(manifest);
  return {
    ...normalized,
    schemaVersion: '1.1',
  };
}
