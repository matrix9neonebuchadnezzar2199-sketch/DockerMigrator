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
  - ヘルプ / 用語集（Step F 完了）
  - （将来）設定 / ログ
```

Step A では「概要」を **メニューに出さない**。ヘルプ/用語集は Step F（H1: 独立 `PageKey: 'help'`）で追加済み。

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

Phase 6 第4回の実施順序（Step B 撤回後）: **A → F → C → E → D**。

| Step | 内容 | 状態 |
|------|------|------|
| A | サイドバー 3 グループ、`ResumePage`、`listResumablePackages` | 完了 |
| B | 初回起動ウィザード（`WelcomeWizard` / Settings JSON） | **撤回**（2026-05-19） |
| F | ヘルプ/用語集（18 語・hash 深リンク）、SVG アイコン | **完了**（アイコンは stretch、未実施） |
| C | SourceOverview / TargetOverview、取り込み状況 | 未着手 |
| E | 「次にやること」フッター | 未着手 |
| D | ステップインジケータ | 未着手 |

### Step B 撤回（2026-05-19）

Step A のサイドバー 3 グループ（移行元 / 移行先 / 共通）で入口が既に分かれており、ウィザードは UX 二重化になった。実機での動作不具合もあり、初回起動ウィザードと Step B 専用の Settings 永続化（`dmig-settings.json` / `getSettings` IPC）を削除した。将来の「設定」機能（テーマ、デフォルト出力先、言語、最後のページ復元等）は要件確定後に独立タスクで新規設計する。

## 7. 判断メモ（§9 回答）

- **R1**: `/resume` 相当 → `PageKey: 'resume'` を採用。
- **H2**: `useResumeFlow` 抽出は Step C 以降に延期（ResumePage と Import の重複は Step A では許容）。
- Import の `ok_partial` → `ResumeConfirmDialog` 経路は **残置**。
