# Changelog

本リポジトリのリリース単位の変更履歴。Keep a Changelog 準拠（[https://keepachangelog.com/ja/1.1.0/](https://keepachangelog.com/ja/1.1.0/)）。
バージョン番号は `dmig/package.json` の `version` を正とする。

## [Unreleased]

（次のリリースに向けた未公開変更をここに積む）

## [0.2.0-poc] - 2026-05-18

### Added

- `dmig` manifest schemaVersion **1.1**: 中断・再開のための `partialState`（`pendingChunks` / `lastUpdatedAt` / `checksumPolicy` / `interruptionReason`）と `ChunkRef`（`contentKind` + `contentId` + `chunkIndex` + `byteOffset` / `byteLength` / `expectedSha256`）を導入。
- Importer 入口の分離: `openAsBase` / `openForResume` / `probe`、IPC `dmig:probePackage`、preload `window.dmig.probePackage`、`ProbeSummary`。
- Exporter 段階 A の `partialState` 書き込み（1 entry = 1 chunk、`expectedSha256` は全ゼロ 64 文字のプレースホルダ）と `ManifestWriter`（`write-file-atomic` ベースの原子書き換え）。
- IPC `dmig:resumeExport` / preload `window.dmig.resumeExport`、`ResumeExportRequest`（`packageDir` + `jobToken` + 任意 `compressionLevel`）。
- Renderer Import ページ: `probePackage` → `gateImportAfterProbe`（共有）で分岐、`ResumeConfirmDialog` から `resumeExport` 起動・実行中は `cancel(jobToken)`、異常系は `ProbeErrorPanel`。
- Renderer Export / Compose ページ: エクスポート失敗時に `ResumeHintBanner` で Import からの再開を案内（文言は `@shared/uiCopy.ts`）。
- エラーコード **E2070–E2075**（`INVALID_BASE_PACKAGE` / `NOT_A_PARTIAL_PACKAGE` / `CHUNK_CHECKSUM_MISMATCH` / `EXPORT_PREVIOUS_IS_PARTIAL` / `CHAIN_CONTAINS_PARTIAL` / `MANIFEST_PARTIAL_INVALID`）。
- 仕様書 §11 と正本 `docs/dmig-manifest-1.1.md`（v1.0）を新設。

### Changed

- ページレイアウトを `page-shell` + `page-two-col` に統一し、解説を右レール (`page-guide-rail`) に集約。`HelpTip` は廃止。
- `DmigManifest` を `schemaVersion: '1.1'` 既定で出力。1.0 は読み込み互換のみ維持。

### Fixed

- 該当なし（実装は新規導入のため）。

[Unreleased]: https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/compare/v0.2.0-poc...HEAD
[0.2.0-poc]: https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/compare/v0.1.0-poc...v0.2.0-poc
