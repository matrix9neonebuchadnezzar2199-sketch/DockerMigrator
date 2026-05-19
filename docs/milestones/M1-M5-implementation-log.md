# M1–M5 実装ログ（設計・判断・実装記録）

マスターが後から差し替え可能なよう、**推奨選択 [R]** と **判断 ID（D-xxx）** で記録する。

---

## 横断方針

| 項目 | 推奨選択 [R] | 判断 ID |
|------|----------------|---------|
| リリース版 | `0.3.0-poc`（manifest 1.1 + 第4回 UI まとめ） | D-001 |
| Git タグ | `v0.3.0-poc` を付与（GitHub Release は本文のみ、バイナリは未添付） | D-002 |
| Settings | Step B 復活ではなく新規 `DmigSettings`（`restoreLastPage` + `defaultExportDir` のみ。theme/i18n は未実装） | D-003 |
| Footer 動的 v2（Compose 選択→export CTA） | **見送り**（ページ state 購読が必要） | D-004 |
| ログビューア（M3-4） | **見送り**（設定画面のみ） | D-005 |
| E2E | Playwright 実機ではなく **App 統合テスト（jsdom + dmig mock）** | D-006 |

---

## M1 — リリース整備

### 設計

- `phase6-r4-step-{f,c,e,d}-instructions.md` → `completed/` + アーカイブヘッダ
- `CHANGELOG` `[Unreleased]` → `[0.3.0-poc] - 2026-05-19`
- `package.json` version `0.3.0-poc`
- `README` に UI 三層（Overview / Help / Indicator+Footer）を追記

### 実装コミット

- コミット: `1983681`
- 検証: `npm run build` OK（2026-05-19）

---

## M2 — ストレッチ & 導線

### 設計

- `lucide-react` 追加、Sidebar のみ差し替え
- 用語集: `partial-state`, `interrupted-pack`, `resume-export` → `source-overview`；`import` 系は `target-overview` は維持
- Help ガイドに概要ページへの文言リンク（ボタンで `source-overview`）

### 判断

| ID | 内容 | 選択 |
|----|------|------|
| D-007 | Lucide スコープ | Sidebar グループ見出し + NavItem のみ（ページ内絵文字は触らない） |
| D-008 | `dmig-ui-redesign-v0.1.md` | 先頭に「第4回完了」注記を追加（completed 移動は M1 と同型だが UI メモは残置） |

---

## M3 — 設定（再設計）

### 設計

- `PageKey: 'settings'`
- `dmig-settings.json` in `app.getPath('userData')`
- IPC: `dmig:getSettings` / `dmig:updateSettings`
- フィールド: `defaultExportDir?: string`, `restoreLastPage: boolean`, `lastPage?: PageKey`
- 初回起動: `restoreLastPage` 既定 `false` → `source-overview`（Step C 維持）

---

## M4 — 横断 UX v2

### 設計

| ID | 内容 | 実装 |
|----|------|------|
| D-004 | Footer Compose 動的 | 見送り |
| M4-1 | Docker 未接続 | `ping` 失敗時 Footer 文言差し替え + CTA 無効化 |
| M4-3 | StepIndicator クリック | `flowSteps.ts` に step→PageKey マップ、クリックで遷移 |
| M4-4 | useResumeFlow | Import / Resume 共有フック |
| M4-5 | 移行先 2 段 | `target-overview` flowStep 1、`import` flowStep 2、パイプライン 2 ラベル |

---

## M5 — 品質・配布

### 設計

- `docs/testing/smoke-checklist.md` 手動チェックリスト
- `App.integration.test.tsx` ナビゲーション smoke
- `npm run build` 検証（`build:win` は CI 環境依存のためログに結果のみ）

### 検証結果（2026-05-19）

| コマンド | 結果 |
|----------|------|
| `npm run typecheck` | pass |
| `npm test` | 101 passed, 1 skipped（20 files） |
| `npm run build` | pass |
| `npm run build:win` | 未実行（手動・CI 任せ） |

### 実装コミット

- `1983681` feat(milestone): M1–M5 一括
- タグ `v0.3.0-poc`: push 後に付与（未 push 時は pending）

---

## マスター差し替え用クイック参照

変更したい場合は上記 **D-xxx** を指定してください。

| ID | 差し替え例 |
|----|------------|
| D-001 | `0.2.1-poc` に戻す |
| D-003 | theme / 言語を Settings に追加 |
| D-004 | Compose 選択数で Footer CTA を export に |
| D-006 | Playwright 実 E2E に置換 |
