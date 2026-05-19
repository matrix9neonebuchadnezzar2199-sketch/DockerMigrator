> **アーカイブ済み (2026-05-19)**: Step D 完了。リリース `v0.3.0-poc`。再実行用ではなく履歴参照用。

---

# Phase 6 第4回 Step D 指示書: StepIndicator（作業フロー表示）

**起点コミット**: `70a5f17`（Step E 完了）  
**順序**: A → F → C → E → **D**（第4回最終 Step）

## 0. 目的

作業ページ上部に「現在地」を示す静的ステップインジケータ。NextStepFooter（次アクション）と補完関係。

## 1. 設計判断（確定）

| 論点 | 採用 |
|------|------|
| データ源 | `nextSteps.ts` の `flowStep` + 新規 `flowSteps.ts`（ラベル定義） |
| 配置 | `App.tsx` の `.main-body` 先頭（ページコンテンツの上） |
| 表示対象 | `flowStep` がある PageKey のみ（compose/export/resume/import） |
| 非表示 | overview / help / target-overview（target-overview は flowStep なし） |
| 操作 | 表示のみ（クリック遷移なし。Sidebar/Footer/カードが導線） |
| 動的 | なし（完全静的） |

## 2. フロー定義

**移行元（3 ステップ）**: ① プロジェクトを選ぶ → ② パックを書き出す → ③ 中断パックを再開  
**移行先（1 ステップ）**: ① パックを読み込む

## 3. ファイル

- 新規: `flowSteps.ts`, `StepIndicator.tsx`, tests
- 改修: `App.tsx`, `styles.css`, 仕様書 §12.7, UI メモ, CHANGELOG, 日記

## 4. テスト 6〜8

StepIndicator 表示・aria-current、非表示ページ、flowSteps ユニット。

## 5. コミット分割

指示書 → feat → test → docs → 日記 SHA
