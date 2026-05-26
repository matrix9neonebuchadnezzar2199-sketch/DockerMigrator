# Changelog

本リポジトリのリリース単位の変更履歴。Keep a Changelog 準拠（[https://keepachangelog.com/ja/1.1.0/](https://keepachangelog.com/ja/1.1.0/)）。
バージョン番号は `dmig/package.json` の `version` を正とする。

## [Unreleased]

## [0.5.2.1-poc] - hotfix B-38

### Fixed

- **B-38 (critical)**: 同一アプリで書き出したパックが取り込めない問題
  - 原因: Compose / Image の manifest 書き出しが `dmigVersion: '0.2.0-poc'` のまま、`Importer` が `1.x` を要求していた
  - 修正: `DMIG_MANIFEST_VERSION`（`1.1`）を `@shared/manifestVersion.js` で一元化

### Added

- `manifestVersion.roundtrip.test.ts`（readManifest 回帰、legacy `0.2.0-poc` 拒否）

### Notes

- `dmigVersion` が `0.x` の既存パックは取り込めません（PoC 許容）

## [0.5.2-poc] - UPDATE-05

### Fixed

- B-37: Compose / Image Export 完了後も書き出しボタンが残り二重エクスポートできた問題を解消（完了時は非表示、Image は「新しい書き出しを開始」で再表示）

### Added

- `errorMessages.ts` に E5002（パックバージョン非対応）のユーザー向け文言
- `ExportPage.test.tsx`（B-37 ボタン表示 2 ケース）

### Docs

- 通読ノート §14（パターン A スモーク結果）/ §15（B-37）/ §16–§17
- `docs/notes/2026-05-26_ipc-cancel-scope.md`（IPC cancel は UPDATE-06 へ）
- `docs/notes/2026-05-26_importer-ui-design.md`

### Deferred

- Main IPC cancel 横展開の実装 → UPDATE-06
- ProbeErrorPanel / ErrorBox 統合 → UPDATE-06 以降

## [0.5.1-poc] - UPDATE-04

### Added

- Import 系エラーの `ErrorBox` にコード別文言マップ（E2075 / E2071 / E8001）
- `dmig/src/renderer/lib/i18n/errorMessages.ts` で文言を集中管理
- `ErrorBox` 単体テスト 4 ケース

### Changed

- `StaticPageGuides` を `React.lazy` + `Suspense` に切り替え、初期バンドルからガイド本文を分離 (B-23)
- 本番ビルドで `StaticPageGuides` チャンク約 21 KB を遅延読み込み

### Docs

- 通読ノート §14（UPDATE-03 手動スモーク: パターン C）
- UPDATE-04 開発日記

### Notes

- 手動 Docker スモーク（0.5.0 / 0.5.1）はマスター環境で実施待ち（パターン C → フェーズ3 前に要記録）
- Reserved smoke-fix 枠: 未使用

## [0.5.0-poc] - UPDATE-03

### Changed

- Progress イベント購読を `ProgressBusProvider` に集約し、`window.dmig.onProgress` の Renderer 購読を 1 本化 (B-27)
- `ProgressPhase` / `ProgressTaskId` を union 型として整理 (`shared/types.ts`)
- `useDmigProgress` / `useLogBuffer` を ProgressBus 経由に切り替え

### Added

- 完了 progress に `cancelRequested` フラグ。最終チャンク完了直後の cancel 要求を半成功として表現 (B-20)
- Rollback の `jobToken` 登録と `dmig:cancel` による中断（`RunRollbackResult.cancelled` で部分結果を返却）
- `useDoneProgressNotice` による Resume 完了文言の出し分け

### Fixed

- B-20: Resume の最終チャンク完了直後に cancel した場合の UX 不整合（`ok: true` のまま注記付き完了メッセージ）

### Docs

- 通読ノート §10–§13（Progress 集約設計、B-20 マトリクス、案B 採択、Importer UI defer）
- UPDATE-03 開発日記

### Deferred

- Importer 境界エラー UI 露出 (P2) → UPDATE-04

## [0.4.0-poc] - UPDATE-02

### Changed

- ComposePage の `composeVisited` 常時マウントを廃止し、遷移時のみマウント + `ComposePageStateContext` で状態保持 (B-02, B-27)

### Added

- `JobLockContext` — 同種ジョブの二重開始防止 (B-11)
- `RollbackJobContext` — ロールバック実行状態のページ間共有 (B-10, B-31)
- Settings の `defaultExportDir` クリアボタン (B-26)
- NextStepFooter の Docker 再接続ボタン (B-22)
- Sidebar ジョブ実行中バッジ、通読ノート `docs/notes/2026-05-27_update02-readnote.md`

### Fixed

- LogsPage のバッファ上限表示を `LOG_BUFFER_MAX` に連動 (B-15)
- ResumeConfirmDialog の pending chunks プレビュー件数注記 (B-24)
- ErrorBox の長文エラー折りたたみ (B-28)
- RollbackResultSummary の全件ゼロ時メッセージ (B-29)

### Notes

- B-23（StaticPageGuides 遅延 import）は roadmap で保留。
- B-20（resumeExport cancel 競合）は Main 監査を UPDATE-03 に送る。

## [0.3.1-poc] - UPDATE-01

### Fixed

- Resume の中止後に「インポートへ進む」CTA が誤って表示されていた問題を修正 (B-08)
- ImportPage の完了判定が脆い文字列リテラル比較に依存していた問題を修正、CTA 遷移先を移行先概要に変更 (B-06)
- SettingsPage で保存した `defaultExportDir` が ExportPage / ComposePage に反映されていなかった問題を修正 (B-01)
- Docker Desktop を後から起動した場合に再接続できる「再確認」ボタンを Sidebar に追加 (B-13)
- ComposePage で書き出し完了/エラー後にフローをリセットする「新しい書き出しを開始」ボタンを追加 (B-25)
- ImportPage で packDir 編集時にマニフェスト・選択状態を破棄するように修正 (B-17)
- ComposePage で bind/secret ダイアログ表示中に一括操作ボタンが押せてしまう問題を修正 (B-16)
- RollbackInlineSection で kind 不一致時のメッセージを追加 (B-19)
- RollbackInlineSection の unsupported 判定を明示的な boolean 化 (B-12)
- `already_executed` ロールバックの結果表示を分かりやすく改善 (B-32)
- RollbackPage でロールバック失敗時にダイアログを閉じずエラーを表示するように変更 (B-30)
- ResumePage の scan で連続実行時の競合を防ぐ世代番号を追加 (B-09)
- ResumePage の完了 CTA を見直し（移行先操作への直接遷移を廃止） (B-07)
- StepIndicator の現在ステップをボタンから span に変更 (B-14)
- SettingsPage で設定保存失敗時のエラー表示を追加 (B-35)
- usePageDynamicCta の依存配列を参照比較からプリミティブ比較に変更 (B-21)

### Notes

- 未読領域 (Exporter / ComposeExporter / Snapshotter / DockerAdapter / ipc/preflight / ipc/dryRun / ipc/snapshot) は次フェーズで監査する。
- B-02/B-10/B-11/B-20/B-23/B-27/B-31/B-36 は次フェーズで対応予定。

### Added

- **M8**: 共通ログビューア（`PageKey: logs`、最大 1000 件 FIFO、フィルタ・検索・TSV コピー）。
- **M8**: `DynamicCtaContext` による NextStepFooter 動的 CTA（export / resume / import 完了時）。
- **M9**: ドライラン UI（`dmig:runDryRun`、`DryRunPage`、Compose / Export 内インライン検査、結果リストのフィルタ・TSV コピー）。
- **M10**: ロールバック UI（`RollbackPage`、Import / Export インライン、`rollback.json` スキーマ、`dmig:listRollbacks` / `runRollback` / `loadRollbackRecord`）。
- **M10**: Import 取り消し用 Docker 削除（`DockerAdapter.removeImage` / `removeVolume`）。Compose Import の directory は空チェック時のみ削除（既定は `directory_not_empty` スキップ）。

### Changed

- **docs/testing**: 手動スモーク・M10 チェックリストを Markdown から HTML 正本へ移行（`index.html`, `smoke-checklist.html`, `m10-rollback-smoke-checklist.html`）。`run_smoke_check.py` は `file:///` パスを案内。
- **docs/testing**: M10 smoke の S5 を S5-A / S5-B / S5-C に分割（Resume 回帰観測・`--scan-rollback-json` 観測点）。

### Fixed

- **M10**: Resume Export 完了時（`resumeImagePack` / `resumeComposePack`）に `rollback.json` が生成されない問題を修正。

### Removed

## [0.3.0-poc] - 2026-05-19

### Added

- Phase 6 第4回 Step D: 作業ページ上部の StepIndicator（移行元 3 段 / 移行先 2 段、`flowSteps.ts` + `nextSteps.flowStep` 連携）。M4 でステップクリック遷移を追加。
- Phase 6 第4回 Step E: 全ページ横断の「次にやること」フッター（`NextStepFooter` / `nextSteps.ts`）、`App.tsx` の `.main-body` + sticky フッター構成。Help ページでは非表示。
- Phase 6 第4回 Step C: 移行元・移行先の概要ページ（`SourceOverviewPage` / `TargetOverviewPage`）、サイドバー各グループ先頭「概要」、起動時初期表示を `source-overview` に変更。
- Phase 6 第4回 Step F: サイドバー共通に「ヘルプ / 用語集」、`HelpPage`（使い方ガイド + 用語集 18 語・フィルタ・`#hash` 深リンク）、`glossary.ts` データ。
- Phase 6 第4回 Step A: サイドバーを移行元/移行先/共通の3グループに再構成、`ResumePage`（中断パック検索・再開）、`dmig:listResumablePackages` IPC と `ResumableScanner`（浅い走査 + `ok_partial` のみ列挙）。
- **M2**: Sidebar に `lucide-react` アイコン、用語集の中断系用語から概要ページへの導線、`HelpPage` の「移行元の概要ページを開く」ボタン。
- **M3**: 設定ページ（`DmigSettings` / `dmig-settings.json`）、`dmig:getSettings` / `dmig:updateSettings`、`restoreLastPage` / `defaultExportDir` / `lastPage` 永続化（theme・i18n は未実装、判断 D-003）。
- **M4**: Docker 未接続時の Footer 案内、`useResumeFlow` 共有、StepIndicator クリック遷移、移行先パイプライン 2 段化（`target-overview` + `import`）。
- **M5**: `docs/testing/smoke-checklist.md`、`App.integration.test.tsx`（jsdom + dmig mock、判断 D-006）。
- **M1**: 第4回手順書（Step F/C/E/D）を `docs/instructions/completed/` へアーカイブ。
- Phase 7 test coverage: importImages 新シグネチャ、ComposeImporter 経路、Exporter 中断・再開シナリオ、`dmig:resumeExport` IPC integration、`validatePartialState` 境界、`DockerAdapter` の `DOCKER_HOST` 分岐の単体・統合テストを追加（19 → 44 件、+25 件）。

### Removed

- Phase 6 第4回 Step B: 初回起動ウェルカムウィザード（`WelcomeWizard`）と専用 Settings 永続化（`dmig-settings.json`、`dmig:getSettings` / `updateSettings`）。Step A サイドバーで入口が足りるため撤回。

### Changed

- `dmig/package.json` version を `0.3.0-poc` に更新（M1）。
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

[Unreleased]: https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/compare/v0.3.0-poc...HEAD
[0.3.0-poc]: https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/compare/v0.2.0-poc...v0.3.0-poc
[0.2.0-poc]: https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/compare/v0.1.0-poc...v0.2.0-poc
