# dmig UI 再設計メモ v0.1

**対象**: Phase 6 第4回 Step A（2026-05-19）  
**起点**: Phase 7 完了（`37af8a0` 周辺）

## 1. サイドバー 3 グループ

```
移行元での作業 (📤)
  - プロジェクトを選ぶ   ← 旧 Compose まるごと
  - パックを書き出す       ← 旧 イメージ エクスポート
  - 中断したパックを再開   ← 新規（Resume ページ）

移行先での作業 (📥)
  - パックを読み込む         ← 旧 イメージ インポート

共通 (⚙)
  - （Step F 以降）設定 / ログ / ヘルプ
```

Step A では「概要」「ヘルプ/用語集」を **メニューに出さない**（非活性より非表示）。

## 2. ラベルマッピング（確定）

| 旧 UI | 新 UI |
|-------|-------|
| Compose まるごと | プロジェクトを選ぶ |
| イメージ エクスポート | パックを書き出す |
| イメージ インポート | パックを読み込む |
| （無） | 中断したパックを再開 |

## 3. ルーティング

- 既存: `App.tsx` の `PageKey` state（react-router 未使用）。
- Step A 追加: `PageKey` に `'resume'`、`ResumePage.tsx`。

## 4. 中断パック列挙 IPC

- チャンネル: `dmig:listResumablePackages`
- Main: `ResumableScanner` + `Importer.probe`
- Preload: `window.dmig.listResumablePackages`

## 5. アイコン

- Step A: 絵文字暫定（`aria-hidden` + グループ見出しで `aria-labelledby`）
- 将来: Lucide/Heroicons へ差し替え（Step F 候補）

## 6. 後続 Step との境界

| Step | 内容 |
|------|------|
| B | 初回起動ウィザード（**実装済み**: モーダル、`WelcomeWizard`、Settings JSON） |
| C | SourceOverview / TargetOverview、取り込み状況 |
| D | ステップインジケータ |
| E | 「次にやること」フッター |
| F | ヘルプ/用語集、SVG アイコン |

## 7. 判断メモ（§9 回答）

- **R1**: `/resume` 相当 → `PageKey: 'resume'` を採用。
- **H2**: `useResumeFlow` 抽出は Step C 以降に延期（ResumePage と Import の重複は Step A では許容）。
- Import の `ok_partial` → `ResumeConfirmDialog` 経路は **残置**。

### Step B 確定事項（2026-05-19）

- モーダルオーバーレイ（専用 `PageKey` なし）。ウィザード中はサイドバー `pointer-events: none`。
- Escape / 背景クリックは無効。「あとで決める」も `welcomeWizardCompleted: true` で永続スキップ。
- 永続化: `userData/dmig-settings.json`（案 S2、既存 Settings IPC なしのため新設）。
- 再表示: サイドバー共通「ウェルカム画面を再表示」（`SettingsPage` は未実装のため）。
