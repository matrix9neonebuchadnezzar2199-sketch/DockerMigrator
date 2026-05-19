# Phase 6 第4回 Step B 指示書: 初回起動ウィザード「移行元 or 移行先？」

**対象モデル**: Composer2  
**作業日**: 2026-05-19  
**起点コミット**: `328ddf2`（5/19 日記 pending 解消後）  
**実装状況**: 本リポジトリに **実装済み**（案 S2 採用）。履歴参照・後続 Step のテンプレート用。

---

## 1. 事前調査結果（2026-05-19 実施・確定）

| # | 調査項目 | 結果 | 採用案 |
|---|----------|------|--------|
| 1 | `Settings.ts` / 永続化 | **なし** | **S2** 新規 `dmig/src/main/core/Settings.ts` + `userData/dmig-settings.json` |
| 2 | `DmigSettings` 型 | **なし** → 新設 | `@shared/types` |
| 3 | Settings IPC | **なし** → 新設 | `dmig:getSettings` / `dmig:updateSettings`（`ipc/settings.ts`） |
| 4 | Preload Settings API | **なし** → 追加 | `getSettings` / `updateSettings` |
| 5 | 初期 `PageKey` | `useState<PageKey>('compose')`、react-router **未使用** | `setPage` で遷移 |
| 6 | モーダル参考 | `ResumeConfirmDialog`（`.dialog-overlay` / `role="dialog"`） | 同系統 + `.welcome-wizard-*` |
| 7 | `SettingsPage.tsx` | **存在しない** | サイドバー共通に「ウェルカム画面を再表示」 |
| 8 | `write-file-atomic` | `package.json` 済（ManifestWriter 使用） | S2 でも新規依存なし |

**§9 デフォルト方針**: マスター提示の 6 論点どおり（初回のみ自動 / スキップ永続 / UI のみ分岐 / compose|import 着地 / モーダル / vitest）。

---

## 0. 前提と目的

（マスター起草の Step B 指示書本文に準拠。要点のみ）

- Step A 完了済み（サイドバー3グループ、`resume` ページ、`listResumablePackages`）。
- 初回起動モーダルで移行元/移行先を尋ね、`welcomeWizardCompleted` を `dmig-settings.json` に保存。
- スコープ外: Step C〜F、Docker プロファイル切替、i18n。

## 2–8. 実装・テスト・ドキュメント

詳細仕様はマスター起草版（チャット 2026-05-19）を正とする。実装ファイル:

| 種別 | パス |
|------|------|
| Main | `core/Settings.ts`, `ipc/settings.ts` |
| Shared | `types.ts` (`DmigSettings`) |
| Renderer | `components/WelcomeWizard.tsx`, `hooks/useWelcomeWizard.ts`, `App.tsx`, `Sidebar.tsx`, `styles.css` |
| テスト | `Settings.test.ts`, `WelcomeWizard.test.ts`, `useWelcomeWizard.test.ts`, `App.test.tsx` |
| ドキュメント | `仕様書.txt` §12.4, `docs/dmig-ui-redesign-v0.1.md`, `CHANGELOG.md` [Unreleased] |

## 9. 完了条件（チェックリスト）

- [x] 初回ウィザード表示・2択+スキップ・永続化・再表示ボタン
- [x] `typecheck` / `test`（81 passed, 1 skipped）
- [x] `lint` / `build`
- [ ] 開発日記エントリ・分割コミット・push（マスター判断）

---

再実行用ではなく、Step C 以降の参照用として保管。
