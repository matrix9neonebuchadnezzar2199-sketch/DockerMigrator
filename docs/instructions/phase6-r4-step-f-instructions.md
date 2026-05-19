# Phase 6 第4回 Step F 指示書: ヘルプ / 用語集（+ アイコン任意）

**対象モデル**: Composer2  
**作業日**: 2026-05-19（想定）  
**起点コミット**: `ece5e03`（Step B 撤回後の `main` 先端）  
**設計メモ**: `docs/dmig-ui-redesign-v0.1.md` §6（順序 **A → F → C → E → D**）

---

## 0. 背景と目的

Step A でサイドバーを移行元 / 移行先 / 共通の 3 グループに再構成し、主ラベルから **manifest / partialState 等の技術用語を退避**した（`仕様書.txt` §12.1）。Step B（初回ウィザード）は撤回済み。Step F では退避した用語の受け皿と、初心者向け操作ガイドを **共通グループの独立ページ**として提供する。

**目的**

1. サイドバー「共通」に **ヘルプ / 用語集** を追加し、`PageKey: 'help'` で閲覧できるようにする。
2. **使い方ガイド**（移行元フロー・移行先フロー・中断再開・FAQ）と **用語集**（フィルタ付き）を 2 タブで提供する。
3. （任意）サイドバー絵文字を SVG アイコンへ差し替える土台を整える（本 Step の stretch goal、§8 参照）。

**スコープ外**

- 各ページ右上の `StaticPageGuides` レールの削除・統合（現状維持。Help ページは要約 + 用語集への導線）
- Step C の概要ページ、Step E のフッター、Step D のインジケータ
- i18n / Markdown 外部ファイル（`vite-plugin-markdown` 等の新規依存）
- 設定画面（テーマ・デフォルトパス等）— 将来の独立タスク

---

## 1. 設計判断（確定デフォルト）

マスター提示の 7 論点。上書き指示がない限り以下で実装する。

| # | 論点 | 採用 |
|---|------|------|
| 1 | 配置 | **H1**: サイドバー共通 → `PageKey: 'help'` 独立ページ。H2（ページ内 `?` パネル）は Step F では作らない |
| 2 | 構成 | **2 タブ**: 「使い方ガイド」「用語集」 |
| 3 | データ | **C2**: `dmig/src/renderer/data/glossary.ts`（TypeScript オブジェクト、新規依存なし） |
| 4 | 語数 | **18 語**（§1.1 リスト。必須 15 + 推奨 3） |
| 5 | 検索 | 用語集タブに **部分一致テキストフィルタ** のみ（fuzzy 不要） |
| 6 | テスト | vitest + Testing Library **6〜8 ケース** |
| 7 | 深リンク | `setPage('help')` + `location.hash = '#<termId>'` の対応のみ。専用フックは不要 |

### 1.1 用語集エントリ（18 語・実装時の初期セット）

Step A で UI から退避した語（`仕様書.txt` §12.1）と、`StaticPageGuides` / 各ページでユーザーが触れる語を軸にする。

| id | 用語（表示名） | 優先 | 備考 |
|----|----------------|------|------|
| `dmig-package` | `.dmig` パッケージ | 必須 | 拡張子・フォルダ構造の説明 |
| `manifest` | manifest（`manifest.json`） | 必須 | パッケージの設計図 |
| `partial-state` | 中断状態（`partialState`） | 必須 | manifest 1.1 |
| `pending-chunks` | 未完了チャンク（`pendingChunks`） | 必須 | 再開対象の単位 |
| `interrupted-pack` | 中断パック | 必須 | UI ラベル「中断したパックを再開」と対応 |
| `compose-project` | Compose プロジェクト | 必須 | `com.docker.compose.project` 検出 |
| `bind-mount` | バインドマウント（bind mount） | 必須 | `BindMountDialog` と連動 |
| `secret-scan` | シークレット検出（`.env`） | 必須 | `SecretWarningDialog` と連動 |
| `docker-image` | Docker イメージ（`repository:tag`） | 必須 | Export/Import ページ |
| `named-volume` | 名前付きボリューム | 必須 | Compose 同梱 |
| `export` | エクスポート（書き出し） | 必須 | 移行元作業 |
| `import` | インポート（読み込み） | 必須 | 移行先作業 |
| `snapshot` | スナップショット（差分の基準） | 必須 | Compose 差分エクスポート |
| `probe-package` | パッケージ検証（probe） | 必須 | Import / Resume 入口 |
| `resume-export` | エクスポート再開 | 必須 | `dmig:resumeExport` |
| `schema-version` | スキーマバージョン（`schemaVersion`） | 推奨 | manifest 1.0 / 1.1 |
| `chunk-ref` | チャンク参照（`ChunkRef`） | 推奨 | contentKind + chunkIndex |
| `preflight` | 事前検証（preflight） | 推奨 | 空き容量・サイズ見積もり |

**入れない（Step F では説明過多）**: 個別エラーコード（E2070–E2075）、`jobToken` / IPC チャネル名の羅列、`listResumablePackages` の実装詳細。

**語数の調整**: 10 語以下に厳選する場合は推奨 3 語（`schema-version`, `chunk-ref`, `preflight`）を削る。30 語に増やす場合は `dangling イメージ` / `compose lifecycle` / `ok_partial` 等を追加（別コミット可）。

各エントリの型（`glossary.ts`）:

```ts
export type GlossaryEntry = {
  id: string;           // URL hash 用（上表 id 列）
  term: string;         // 見出し
  reading?: string;     // よみ（50 音ソート用、任意）
  body: string;         // 1〜3 段落、初心者向け日本語
  relatedPage?: PageKey; // 任意: 関連ページへの導線
};
```

---

## 2. 事前調査タスク

実装前に grep / Read で確認し、開発日記 Step F エントリに 1 行メモする。

1. `App.tsx` の `PageKey` 型とページ分岐パターン（`resume` 追加時と同型）。
2. `Sidebar.tsx` 共通グループのプレースホルダ文言（`設定・ヘルプは今後の更新で追加予定` → ヘルプ項目に差し替え）。
3. `StaticPageGuides.tsx` の各 `*GuideBody` — Help ページから **要約リンク**するか、短文を複製するか（推奨: 要約 + 「各ページ右上にも詳しい説明があります」）。
4. `styles.css` の `.guide-table` / `.page-shell` — Help ページ用に `.help-page` / `.glossary-filter` を追加。
5. `package.json` に `lucide-react` があるか（§8 アイコン用）。

---

## 3. UI 設計

### 3.1 ルーティング

`dmig/src/shared/types.ts` または `App.tsx` 内で:

```ts
export type PageKey = 'export' | 'import' | 'compose' | 'resume' | 'help';
```

- 初期 `PageKey` は `'compose'` のまま。
- `Sidebar` 共通グループに `NavItem page="help" label="ヘルプ / 用語集"`（絵文字 `aria-hidden` + テキスト）。

### 3.2 HelpPage コンポーネント

新規: `dmig/src/renderer/pages/HelpPage.tsx`

**レイアウト**: 既存 `page-shell` + `page-two-col` を踏襲。左（primary）にタブ UI、右（guide-rail）は簡易説明または非表示（`page-guide-rail` に「用語はフィルタで絞れます」程度）。

**タブ 1: 使い方ガイド**

- セクション見出し: 「移行元での作業」「移行先での作業」「中断パックの再開」「よくある質問」
- 各セクションは番号付き手順（`ol`）で 3〜5 ステップ。サイドバーラベルと用語を一致させる（「プロジェクトを選ぶ」→ Compose ページ、等）。
- FAQ 例（最低 3 件）:
  - USB はどの形式でもよいか（`.dmig` フォルダをそのままコピー）
  - 中断パックを Import から開いた場合と Resume ページの違い
  - Compose 同梱パックを Import ページで開いてはいけない理由（Compose ページのインポートタブへ）

**タブ 2: 用語集**

- 上部: `<input type="search">` フィルタ（`aria-label="用語を検索"`）
- 本文: `glossary.ts` をフィルタしたリスト。各項目は `<article id="{entry.id}">` で hash 対応。
- 0 件時: 「該当する用語がありません」

**タブ切替**: ボタンまたは `role="tablist"`（ARIA 推奨）。状態は `useState<'guide' | 'glossary'>`。

### 3.3 深リンク（hash）

`HelpPage` マウント時および `hashchange` で:

```ts
const hash = location.hash.replace(/^#/, '');
if (hash) {
  setTab('glossary');
  requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }));
}
```

Step C 以降は `setPage('help'); location.hash = '#manifest';` で呼び出し可能にする。

### 3.4 スタイル

`styles.css` に追加（Catppuccin 既存変数に合わせる）:

- `.help-tabs` / `.help-tab` / `.help-tab.active`
- `.glossary-filter` / `.glossary-entry` / `.glossary-term`
- 既存 `.guide-table` は使い方タブ内で流用可

---

## 4. ファイル変更一覧

**新規**

| パス | 責務 |
|------|------|
| `dmig/src/renderer/pages/HelpPage.tsx` | 2 タブ UI |
| `dmig/src/renderer/data/glossary.ts` | 用語 18 件 |
| `dmig/src/renderer/pages/HelpPage.test.tsx` | テスト 6〜8 件 |
| `dmig/src/renderer/data/glossary.test.ts` | （任意）id 重複・必須フィールド |

**改修**

| パス | 変更 |
|------|------|
| `dmig/src/renderer/App.tsx` | `PageKey` + `help` 分岐 |
| `dmig/src/renderer/components/Sidebar.tsx` | 共通グループにヘルプ NavItem |
| `dmig/src/renderer/styles.css` | Help / glossary スタイル |
| `仕様書.txt` | §12.4 追加（Help ページ） |
| `docs/dmig-ui-redesign-v0.1.md` | Step F 完了メモ |
| `CHANGELOG.md` | [Unreleased] Added |
| `docs/YYYY-MM-DD_開発日記.html` | Step F エントリ |

---

## 5. テスト（6〜8 ケース）

`HelpPage.test.tsx`（`window.dmig` は既存テスト同様モック不要でも可）:

1. 初期表示: タブ「使い方ガイド」が選択され、移行元セクションが見える。
2. タブ切替: 「用語集」クリックで glossary リストが見える。
3. フィルタ: 「manifest」と入力 → `manifest` を含むエントリのみ表示。
4. フィルタ空結果: 存在しない文字列 → 空状態メッセージ。
5. hash: `location.hash = '#partial-state'` で用語集タブ + 該当 `article` が DOM に存在（`scrollIntoView` は mock）。
6. Sidebar 統合（`App.test.tsx` 追記 1 件でも可）: ヘルプクリック → `help` ページ表示。

---

## 6. ドキュメント

- **仕様書 §12.4**: Help ページ、タブ構成、用語集データソース、`#hash` 深リンク。
- **UI 設計メモ**: Step F 行を「完了」に更新。H1 採用の理由を 1 行。
- **CHANGELOG**: Added 1 行（Help ページ + 用語集 18 語）。
- **開発日記**: TOC + `#entry-HHMM`。コミット hash は push 後に記載。

---

## 7. 完了条件

- サイドバー共通から「ヘルプ / 用語集」で `HelpPage` が開く。
- 2 タブ・用語フィルタ・18 語（§1.1）が表示される。
- `location.hash` で用語集の該当項目にスクロールできる。
- `npm run typecheck` / `lint` / `test` / `build` がすべて通過。
- 仕様書・UI メモ・CHANGELOG・日記が更新済み。
- `main` へコミット（推奨分割: ① HelpPage + glossary データ ② App/Sidebar 統合 ③ テスト ④ ドキュメント）。

---

## 8. Stretch: SVG アイコン（任意・同一 Step 内で時間があれば）

`dmig-ui-redesign-v0.1.md` §5: Step A は絵文字暫定、Step F で Lucide 等へ。

**最小スコープ（推奨）**

- 依存 `lucide-react` を追加（未導入の場合のみ）。
- **サイドバーのみ** 絵文字 → Lucide（`FolderOpen`, `Package`, `Play`, `Download`, `HelpCircle` 等）。`aria-hidden` はアイコン側、ラベルはテキスト維持。
- ページ内ボタン・StaticPageGuides の絵文字は **触らない**（スコープ爆発防止）。

**完了条件に含めない**: アイコン差し替えは別コミット `feat(ui): replace sidebar emoji with Lucide icons` でもよい。Help 本体が優先。

---

## 9. マスター確認事項（実装前）

| 項目 | デフォルト | 上書き待ち |
|------|------------|------------|
| 配置 H1 | 採用 | — |
| 用語数 | 18 語（§1.1） | 10 語厳選 / 30 語拡張 |
| アイコン | stretch、別コミット可 | 同一 Step 必須 / 完全スキップ |

**「以上です」または上書きなし** で実装着手可。

---

再実行用の作業手順書。Step B 撤回後の Phase 6 第4回は **Step F → C → E → D** の順で進める。
