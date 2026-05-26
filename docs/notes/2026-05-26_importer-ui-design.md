# Importer UI 拡張設計メモ（UPDATE-05 フェーズ3）

**記録日**: 2026-05-26

## 経路分担

| 経路 | コンポーネント | 入力 | 典型コード / status |
|------|----------------|------|---------------------|
| `probePackage` | `ProbeErrorPanel` | `ProbeSummary.status` | `invalid_manifest`, `version_incompatible`, `invalid_partial` |
| `import` / `open` / resume IPC 失敗 | `ErrorBox` + `errorMessages.ts` | `DmigErrorPayload.code` | E2075, E2071, E8001（UPDATE-04） |

## 重複の整理

- `version_incompatible`（probe）と `PACK_VERSION_INCOMPATIBLE` (E5002)（import 経路）は **別表現** になり得る。probe は status 文字列、import は E コード。
- UPDATE-05 では **統合リファクタ（案 C）は見送り**。ProbeErrorPanel は probe 専用のまま維持。

## UPDATE-05 での実装範囲

- **案 A のみ**: `errorMessages.ts` に E5002 を追加（import/open 経路で ErrorBox に載る場合の文言統一）。
- probe 経路の E5002 相当は引き続き `ProbeErrorPanel` / `importProbeUi.ts` が担当。

## UPDATE-06 以降

- 共通文言ライブラリ（案 B）または Probe / ErrorBox の表示一貫性監査。
- 未登録 E コードの棚卸し（roadmap Importer UI 残件）。
