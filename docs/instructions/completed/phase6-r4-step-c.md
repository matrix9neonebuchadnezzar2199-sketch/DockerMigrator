> **アーカイブ済み (2026-05-19)**: Step C 完了。リリース `v0.3.0-poc`。再実行用ではなく履歴参照用。

---

# Phase 6 第4回 Step C 指示書: 概要ページ（SourceOverview / TargetOverview）

## 0. 前提と目的

**前提**
- 起点コミット: `04f21fe`（Step F 完了時点の `main` 先端）。
- Step A・F 完了済み、Step B 撤回済み。サイドバー 3 グループ、Help ページ、用語集 18 語が稼働中。
- `dmig-ui-redesign-v0.1.md` § 6 の Step 順序 **A → F → C → E → D** に従い、本 Step は 3 番目。

**目的**
1. サイドバー「移行元での作業」「移行先での作業」グループの先頭に「概要」項目を追加し、それぞれ独立した概要ページ（`SourceOverviewPage` / `TargetOverviewPage`）を実装する。
2. 起動時の初期 PageKey を `compose` から `source-overview` に変更する。
3. 各概要ページに 3 セクション（このグループでできること / 作業の流れ / 作業ページカード）を表示し、リピーターが 1 クリックで主要作業ページへ進める導線を提供する。
4. Help ページとの役割分担を明確にする（Overview = 地図、Help = 用語と詳細）。

**スコープ外**
- 動的情報（Docker 接続状態、プロジェクト数、最終作業日時等）— Step E で扱う。
- NextStepFooter（Step E）、StepIndicator（Step D）。
- SVG アイコン差し替え（Step F の stretch goal、別タスク）。
- 設定画面・テーマ切替（将来の独立タスク）。

## 1. 設計判断（確定）

| # | 論点 | 採用 |
|---|------|------|
| 1 | ページ構成 | 独立 2 ページ |
| 2 | PageKey | `source-overview` / `target-overview` を新規追加 |
| 3 | 初期 PageKey | `compose` → `source-overview` に変更 |
| 4 | コンテンツ | 3 セクション構成（できること / 流れ / 作業ページカード） |
| 5 | 動的情報 | 静的のみ、Docker 接続は入れない |
| 6 | テスト | 6〜8 ケース |

## 2. 事前調査タスク

1. `App.tsx` の `PageKey` 型と初期値。
2. `Sidebar.tsx` の NavItem 並び（概要を先頭に追加）。
3. `HelpPage.tsx` の `page-shell` / `page-two-col` レイアウト。
4. `glossary.ts` の `relatedPage`（概要 PageKey は用語集から不要）。
5. `StaticPageGuides.tsx`（流れセクション執筆の参照）。

## 3. UI 設計

### 3.1 ルーティング

`PageKey` に `source-overview` / `target-overview` を追加。初期値 `source-overview`。

### 3.2 サイドバー

移行元: 概要（先頭）→ プロジェクトを選ぶ → パックを書き出す → 中断したパックを再開  
移行先: 概要（先頭）→ パックを読み込む

### 3.3 SourceOverviewPage

3 セクション + 3 カード（第一カード `.overview-card-primary`）。`onNavigate` で compose / export / resume。

### 3.4 TargetOverviewPage

3 セクション + 1 カード。`onNavigate('import')`。

### 3.5 スタイル

`.overview-section`, `.overview-cards`, `.overview-card`, `.overview-card-primary`, `.overview-flow-list`

## 4. ファイル変更一覧

新規: `SourceOverviewPage.tsx`, `TargetOverviewPage.tsx`, 各 test  
改修: `App.tsx`, `Sidebar.tsx`, `Sidebar.test.tsx`, `styles.css`, `仕様書.txt`, `dmig-ui-redesign-v0.1.md`, `CHANGELOG.md`, 開発日記

## 5. テスト（6〜8 ケース）

SourceOverview 4 + TargetOverview 2 + Sidebar 2 = 8

## 6. ドキュメント

仕様書 §12.5、UI メモ、CHANGELOG、日記

## 7. 完了条件

起動時 `source-overview`、サイドバー概要、カード遷移、typecheck/lint/test/build、テスト 67→73〜75、コミット 4 本推奨。

## 8. マスター確認事項

Docker 接続 1 行: 入れない。カード: 縦並び。主 CTA: 第一カードのみ primary。
