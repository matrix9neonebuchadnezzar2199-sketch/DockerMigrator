> **アーカイブ済み (2026-05-19)**: Step E 完了。リリース `v0.3.0-poc`。再実行用ではなく履歴参照用。

---

# Phase 6 第4回 Step E 指示書: NextStepFooter（次にやること）

**起点コミット**: `852e8c3`（Step C 完了）  
**順序**: A → F → C → **E** → D

## 0. 目的

全作業ページ横断で「次にやること」を案内するフッター。Overview = 地図、Help = 用語、Footer = コンパス。

## 1. 設計判断（確定）

| # | 論点 | 採用 |
|---|------|------|
| 1 | 配置 | F3: `App.tsx` の `.main` 内、`position: sticky; bottom: 0` |
| 2 | 表示 | G1: 説明文 + 単一 CTA（Help リンクなし） |
| 4 | 動的 | D1: `PageKey` のみで完全静的 |
| 5 | 非表示トグル | なし |
| 7 | Step D | `nextSteps.ts` に `flowStep` を含める |
| help | フッター非表示 | `showFooter: false` |

## 2. データ

`dmig/src/renderer/data/nextSteps.ts` — `NEXT_STEPS_BY_PAGE: Record<PageKey, NextStepEntry>`

## 3. コンポーネント

`dmig/src/renderer/components/NextStepFooter.tsx` — `page` + `onNavigate`。`getNextStepForPage` で null なら非表示。

## 4. App 統合

`.main` を flex 縦、`main-body`（overflow-y: auto）+ `NextStepFooter`（sticky）。

## 5. テスト 6〜8

NextStepFooter: 各 PageKey 表示、CTA 遷移、help 非表示、CTA なしページ。

## 6. ドキュメント

仕様書 §12.6、UI メモ、CHANGELOG、日記 `#entry-HHMM`。

## 7. コミット分割

① 指示書 ② feat ③ test ④ docs ⑤ 日記 SHA
