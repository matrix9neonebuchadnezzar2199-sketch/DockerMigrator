/**
 * dmig manifest のスキーマ識別バージョン（`DmigManifest.dmigVersion`）。
 * Importer.readManifest は major が `1` であることを要求する。
 *
 * 0.2.0-poc 〜 0.5.2-poc で書き出されたパック（dmigVersion が 0.x）は非互換。
 */
export const DMIG_MANIFEST_VERSION = '1.1';
