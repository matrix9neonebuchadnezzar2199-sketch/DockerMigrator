# M9 ドライラン UI 指示書

**ファイル**: `docs/instructions/m9-dryrun-ui-instructions.md`  
**ベースコミット**: `601edfa`（着手時 HEAD は M8 以降の `601edfa` 系）  
**スコープ**: Validator / preflight 統合 UI（仕様書 Phase 6 §A 相当）

## §0 前提

- M8 完了済み、テスト 112 passed / 1 skipped。
- 独立ページ + Compose / Export 内ボタン（C3）。
- 仕様書 §12.12 を M9 で割り当て。
- ベースライン: `npm run typecheck && npm run build` エラー 0。

## §1–§6

マスター確定版（2026-05-19）。詳細手順・完了条件・コミット計画はチャット確定稿に準拠。

**Step 1 完了後にマスター承認** → Step 2 以降着手。

### Step 1 調査メモ（2026-05-19 実施）

| 項目 | 結果 |
|------|------|
| `Validator` クラス | **なし**（概念的機能は分散） |
| `dmig:preflight` | `ipc/preflight.ts` — `SizeEstimator` + `SpaceChecker` |
| `dmig:scanSecrets` | `ipc/compose.ts` — `SecretScanner`（.env） |
| `dmig:probePackage` | `ipc/importImages.ts` — `Importer.probe`（既存 .dmig） |
| bind mount | エクスポート時のユーザー選択（`bindMountChoices`）。自動検査 API なし |

**F1/F2 推奨**: **F2**（`dmig:runDryRun` 薄い統合ハンドラ）。理由: findings 正規化・2 モードの単一 UX・将来 bind 警告追加が容易。

---

（以下、確定稿の §1 スコープ〜§6 は実装時に同ファイルへ追記可）
