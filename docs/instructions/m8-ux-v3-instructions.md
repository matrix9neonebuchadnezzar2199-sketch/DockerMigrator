# M8 UX v3 指示書

**ファイル**: `docs/instructions/m8-ux-v3-instructions.md`  
**ベースコミット**: `3400bf8`  
**スコープ**: D-004（Footer 動的 CTA）+ D-005（共通ログビューア）

（マスター確定版 — 実装は本リポジトリのコミット履歴を参照）

## §0 前提

- M6 完了済み、`v0.3.0-poc` リリース整備済み。
- Step E で `NEXT_STEPS_BY_PAGE` 静的マップが確立。
- `window.dmig.onProgress` / `useDmigProgress` インフラ整備済み。
- Lucide ページ内置換は対象外（F2 / M13）。

## §1–§6

設計・手順・完了条件・コミット計画はマスター提示の確定稿に準拠。  
実装メモ: ログは `ProgressEvent` を `LogEntry` に変換（level は message ヒューリスティック）。`LogBufferProvider` を App 直下に配置。
