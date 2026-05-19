# Changelog

本リポジトリのリリース単位の変更履歴。Keep a Changelog 準拠（[https://keepachangelog.com/ja/1.1.0/](https://keepachangelog.com/ja/1.1.0/)）。
バージョン番号は `dmig/package.json` の `version` を正とする。

## [Unreleased]

### Added

- Phase 6 第4回 Step C: 移行元・移行先の概要ページ（`SourceOverviewPage` / `TargetOverviewPage`）、サイドバー各グループ先頭「概要」、起動時初期表示を `source-overview` に変更。
- Phase 6 第4回 Step F: サイドバー共通に「ヘルプ / 用語集」、`HelpPage`（使い方ガイド + 用語集 18 語・フィルタ・`#hash` 深リンク）、`glossary.ts` データ。
- Phase 6 第4回 Step A: サイドバーを移行元/移行先/共通の3グループに再構成、`ResumePage`（中断パック検索・再開）、`dmig:listResumablePackages` IPC と `ResumableScanner`（浅い走査 + `ok_partial` のみ列挙）。
- Phase 7 test coverage: importImages 新シグネチャ、ComposeImporter 経路、Exporter 中断・再開シナリオ、`dmig:resumeExport` IPC integration、`validatePartialState` 境界、`DockerAdapter` の `DOCKER_HOST` 分岐の単体・統合テストを追加（19 → 44 件、+25 件）。

### Removed

- Phase 6 第4回 Step B: 初回起動ウェルカムウィザード（`WelcomeWizard`）と専用 Settings 永続化（`dmig-settings.json`、`dmig:getSettings` / `updateSettings`）。Step A サイドバーで入口が足りるため撤回。

### Changed

- `DockerAdapter` がコンストラクタで `process.env.DOCKER_HOST` を尊重するようになった。設定されている場合は `new Docker()` を引数なしで呼び、`docker-modem` の `defaultOpts()` に解釈を委ねる（`unix://` / `npipe://` / `tcp://` / `ssh://` と `DOCKER_TLS_VERIFY` / `DOCKER_CERT_PATH` / `SSH_AUTH_SOCK` の自動展開を含む）。未設定なら従来どおり OS 別の `socketPath` を明示渡しして振る舞いを完全保持。これにより `execFile('docker', ...)` で起動する子プロセスと `dockerode` 経由の daemon 接続先が常に一致する。
- (internal) `dmig/src/main/ipc.ts` を責務別モジュール `ipc/system` / `ipc/exportImages` / `ipc/importImages` / `ipc/compose` / `ipc/preflight` / `ipc/snapshot` / `ipc/shared` に分割。`registerIpcHandlers` は `DockerAdapter` を 1 回だけ生成して `HandlerDeps` として各モジュールに渡すオーケストレータに薄くした。IPC チャンネル名・引数型・戻り値型・進捗イベント・preload・Renderer は不変。
- (internal) `Importer.importImages` のシグネチャを `(opened: OpenedPackageBase, selectedImages: string[], signal?)` に変更。内部の `readManifest` 呼び出しを削除し、`dmig:import` ハンドラ側で `openAsBase(req.packageDir)` を呼んで `OpenedPackageBase` を組み立てる。Main 側で「1 IPC 呼び出し = 1 回 `manifest.json` 読み」を保証。`ComposeImporter` は既に保持している `dmigManifest` から `OpenedPackageBase` をインライン生成して渡す。`ImportRequest` 型・IPC チャンネル名・preload・Renderer は不変。

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
