# M10 ロールバック UI 指示書

**ファイル**: `docs/instructions/m10-rollback-ui-instructions.md`  
**ベースコミット**: `9d34063`  
**スコープ**: Import / Export 取り消し UI + `rollback.json` 仕様確立（Phase 6 §I 対応）

## §0 前提

- M9 完了済み、テスト 134 passed / 1 skipped。
- ロールバック関連のバックエンド・UI は未着手。Compose 起動の取り消しは対象外（既存の `docker compose down` で代替）。
- `rollback.json` の仕様もこのマイルストーンで初めて定める。
- 仕様書 §12 は M9 で §12.12 まで使用済み、M10 は §12.13 を割り当て。
- ベースライン確認: `npm run typecheck && npm run build` がエラー 0 であること。

## §1–§6

マスター確定版（2026-05-19）。詳細手順・完了条件・コミット計画はチャット確定稿に準拠。

**Step 1 完了後にマスター承認** → Step 2 以降着手。

### Step 1 調査結果（2026-05-19）

| 項目 | 結果 |
|------|------|
| Import イメージ | `Importer.importImages` → `loadOne` → `DockerAdapter.loadImageStream`（`docker load`）。**戻り ID なし** → 各 `loadOne` 後に `resolveImageId(entry.name)` で追跡推奨 |
| Import ボリューム | `ComposeImporter` → `VolumeExporter.importOne` → `importVolumeStream`（不存在時 `createVolume`） |
| Import ネットワーク | **作成なし**（現行コード） |
| Import ファイル | Compose のみ: `destinationDirs` へ `mkdir` / `copyFile` / `untarZstd`（build context・bind mount 含む） |
| Export 出力 | `Exporter.exportImages`: `<outputDir>/<packName>.dmig/`（`images/`, `manifest.json`, `checksums.sha256`）。Compose は `compose/`, `volumes/` 等を追加 |
| Export 一時物 | 成功時は **packDir 配下に集約**（pack 外の一時ファイルなし） |
| Docker 削除 API | **未実装**（`DockerAdapter` に `removeImage` / `removeVolume` 要新規。404 → skipped） |
| 原子書き込み | `write-file-atomic` は `ManifestWriter` で使用中 → `rollback.json` に流用可 |
| ダイアログ | `ResumeConfirmDialog`: `dialog-overlay` + `role="dialog"` + `aria-modal` + header/body/footer |

**Step 5 変更見積**: `DockerAdapter` +40〜60 行 / `RollbackManager` 新規 / `Importer.importImages` 末尾 +20〜30 / `ComposeImporter.importProjects` 末尾 +50〜80 / `Exporter.exportImages` 末尾 +15〜25 / `ipc/compose.ts` export 成功後 +10

**型 `docker-network`**: スキーマには残すが M10 PoC では未使用可。Compose Import の **directory/file** は指示書の import 取り消し範囲に含めるかマスター判断（推奨: イメージ+ボリューム必須、directory は Compose Import 時のみ opt-in 警告付き）。

---

（§1 スコープ〜§6 手順・完了条件・コミット計画はマスター確定稿 2026-05-19。チャット貼付全文と同等。）
