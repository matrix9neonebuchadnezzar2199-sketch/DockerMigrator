# UPDATE-06 指示書（ドラフト）

**目標バージョン**: `0.6.0-poc`  
**前提**: hotfix-2（`0.5.2.2-poc`）クローズ済み。§14 パターン A（B-37 / B-38 実機解決）。  
**通読ノート**: [docs/notes/2026-05-27_update02-readnote.md](../notes/2026-05-27_update02-readnote.md) §20

---

## 目的

PoC 安定化ラインの次段として、コードレビューで指摘された **セキュリティ P0** と **データ契約強化（§19/§20）** を一括で実施する。

---

## スコープ一覧

| 優先度 | ID | 内容 | 出典 | 完了条件 |
|--------|-----|------|------|----------|
| P0 | U6-01 | `dmig:importCompose` を `Importer.openAsBase` 経由にし version / partialState ゲートを復活 | レビュー §1-1 | Compose import が image import と同じ `readManifest` 検証を通る |
| P0 | U6-02 | `safeJoinUnder(root, rel)` 導入。manifest 由来パス・tar 展開・rollback target を検証 | レビュー §1-2 | パック外パスで `PACK_FORMAT_INVALID`、Zip-slip 系テスト |
| P0 | U6-03 | Electron: `sandbox: true`、CSP、`will-navigate` / `setWindowOpenHandler` | レビュー §1-3 | セキュリティチェックリスト充足 |
| P1 | U6-04 | IPC 入口の zod 検証（`packageDir` / `packName` / 配列フィールド） | レビュー | 不正入力で早期 reject |
| P1 | U6-05 | ラウンドトリップテスト拡張: delta export、resume、Compose Import 経路 | §19/§20 | 各経路 1 ケース以上 |
| P1 | U6-06 | manifest Zod スキーマ一元化（`readManifest` / 書き込み前） | §19 | スキーマ drift を CI で検知 |
| P2 | U6-07 | `checksums.sha256` を `write-file-atomic` に | レビュー | 中断時の checksum/manifest 不整合低減 |
| P2 | U6-08 | `runComposeConfig` stdout サイズ上限 | レビュー | 巨大 compose config でメモリ暴走しない |
| P2 | U6-09 | `alpine:3.19` digest pinning（ボリューム export/import） | レビュー | 定数 + ドキュメント |

**UPDATE-05 からの繰越**（必要なら同リリースに含める）:

- Main IPC cancel 横展開（[2026-05-26_ipc-cancel-scope.md](../notes/2026-05-26_ipc-cancel-scope.md)）
- Importer UI 拡張（ProbeErrorPanel / ErrorBox 統合、[2026-05-26_importer-ui-design.md](../notes/2026-05-26_importer-ui-design.md)）

---

## 実装順序（推奨）

1. **U6-01**（1 行に近い IPC 修正、即効性高）
2. **U6-02** + テスト（セキュリティ影響大）
3. **U6-03**（独立、レビューしやすい）
4. **U6-05**（P0 修正の回帰防止）
5. **U6-04 / U6-06**（契約の構造化）
6. P2 は余力で

---

## 共通ルール

- ブランチ: `main` 直 push（PoC 運用）
- Conventional Commits、`(UPDATE-06 …)` をメッセージ末尾に
- 各フェーズ: `npm run typecheck` / `npm run lint` / `npm test` / `npm run build`
- 手動スモーク: §14 相当（新規 Export → manifest → Import）
- 開発日記・CHANGELOG・roadmap を同リリースで更新

---

## 参照

- [dmig-serialized-data-contracts.md](../architecture/dmig-serialized-data-contracts.md)
- `.cursor/rules/54-dmig-data-contracts.mdc`
- `exportImport.roundtrip.test.ts`（hotfix-2 で追加した実 I/O テストの雛形）
