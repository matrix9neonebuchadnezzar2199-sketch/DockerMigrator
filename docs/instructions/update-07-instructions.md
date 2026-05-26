# UPDATE-07 指示書 v0.1

**ステータス**: 実装完了（`0.7.0-poc` リリース・実機スモークは別フェーズ）  
**前提**: UPDATE-06（`0.6.0-poc`）クローズ済み。§14 パターン A。

---

## スコープ

| ID | 内容 | 状態 |
|----|------|------|
| U6-04 | IPC 入口 Zod（主要 `dmig:*` ハンドラ） | 完了（`E9010`） |
| U6-06 | manifest Zod 一元化（`parseDmigManifestPayload`） | 完了 |
| U6-07 | `checksums.sha256` 原子的書き込み | 完了 |
| U6-08 | compose 設定ファイルサイズ上限 | 完了 |
| U6-09 | alpine ヘルパーイメージ digest 固定 | 完了 |
| P2 | Delta RT / tar 直接テスト | UPDATE-07 候補（未着手） |
| 繰越 | IPC cancel 横展開 / Importer UI 統合 | 要件整理済み、実装は段階的 |

---

## 実装順序

1. U6-06 manifest Zod + `Importer.readManifest`
2. U6-04 IPC schemas + `parseIpcArgs` + ハンドラ適用
3. U6-07〜09（P2 インフラ）
4. テスト拡張・`0.7.0-poc` リリース（別フェーズ）

---

## 共通ルール

- コミット suffix: `(UPDATE-07 …)`
- 検証: `typecheck` / `lint` / `test` / `build`
- 新エラー: `E9010` IPC_REQUEST_INVALID

---

## 参照

- [dmig-serialized-data-contracts.md](../architecture/dmig-serialized-data-contracts.md)
- [2026-05-26_ipc-cancel-scope.md](../notes/2026-05-26_ipc-cancel-scope.md)
- `dmig/src/shared/manifestSchema.ts`
- `dmig/src/shared/ipcSchemas.ts`
