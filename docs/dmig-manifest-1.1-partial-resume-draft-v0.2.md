# dmig manifest schemaVersion 1.1 / 中断・再開機能

**Draft v0.2**（Phase 6 第3回 — `ChunkRef.contentKind` 追加）  
**文書日付**: 2026-05-17（初版）、**v0.2 改訂**: 2026-05-18  
**記録日**: 2026-05-18（マスター承認・設計メモ取り込み済み）

## v0.1 → v0.2（改訂サマリ）

- **`ChunkRef`** に **`contentKind`**（`'image' | 'volume' | 'composeProject'`）を追加。`contentId` は当該系統内のエントリ **`name`** のみを指す（現行 `DmigManifest.contents` が `{ images, volumes?, composeProjects? }` のオブジェクト構造であることの反映）。
- v0.1 の「`contentId` だけで `contents` 全体を一意に指す」前提を撤回。**`(contentKind, contentId, chunkIndex)`** で衝突を排除する。
- **§3.5**・用語「content / entry」を現行実装に合わせて修正。
- **§10** 型定義サンプルを同期。**実装メモ**の「`name` + 種別プレフィックス」の単一文字列案は破棄し、構造化フィールドに統一。

---

## 記録メモ（#8b 検証・現行実装との関係）

### 検証時のエラーコード切り分け

- **E2062 (`NO_BASE_SNAPSHOT`)**: 差分モードなのに基底スナップショットが存在しないケース専用。文言もこの状況に特化。
- **E2060 (`DIFF_COMPUTATION_FAILED`)**: 差分計算そのものが失敗した汎用ケース。

#8b の検証では「スナップショット未登録で差分を走らせる」→ **E2062**、「スナップショットありで差分計算が壊れる」→ **E2060**、の二系統で見る。

### manifest の `excludedProjects` / `excludedImages`

現行 `DmigManifest`（`dmig/src/shared/types.ts`）には未定義。#8b の検証では「フィールドが無いこと」を確認する（除外情報は manifest に永続化されず UI 状態のみ）。第3回で `schemaVersion === '1.1'` の追加スキーマとして導入する方針。

### 責務三層（`partialState` 導入の前提）

- **`previousPackage`**: 前回のフル/差分パッケージ参照＝系列を辿るキー。
- **`kind` / `baseRef`（各 contents エントリ）**: そのエントリが差分か・何に対する差分か。
- **`partialState`（新規）**: この package が途中中断されたか・どこまで完了したか＝再開用の実行時メタ。

混在させない。系列 / エントリ意味論 / 実行進捗の三層。

### 設計上の推奨（4 論点の結論）

1. **完了集合は持たない**: `completedKeys` は廃止。**未完了のみ `pendingChunks`** に残し、完了は「`pendingChunks` に出てこない」で導出。小エントリは 1 chunk = エントリ全体で統一。
2. **`partialState` に `status: complete` は書かない**: キー不在＝完了。`partialState` 存在＝中断/再開中。`aborted` と `in-progress` の区別は必須ではなく、任意の `interruptionReason` で診断。
3. **チェックサム**: 真偽値 `checksumVerified` ではなく、package レベル **`checksumPolicy`** とチャンク単位 **`expectedSha256`**（＋ `byteLength`）。1.0 読み込み時は policy 不在を **`verify-all` 相当**で扱う（安全側デフォルト）。
4. **`previousPackage` と中断 package**: 中断中（`partialState` あり）の package を次の `previousPackage` に**指定禁止**。Exporter で検証、Importer は **`openAsBase` / `openForResume` の入口分離**。

---

## 0. 本書の位置づけ

本書は dmig の manifest 仕様 1.1 系および中断・再開機能の設計仕様である。`schemaVersion` 1.0 の仕様（既存）からの差分を中心に記述し、1.0 と互換を保ちながら 1.1 を追加導入することを目的とする。

本書は Phase 6 第3回の着手段階のドラフトであり、実装過程で不整合が見つかれば随時改訂する。改訂は版番号（v0.1, v0.2, …）で管理する。

---

## 1. 用語

| 用語 | 意味 |
|------|------|
| package | dmig が出力する 1 成果物（ディレクトリ単位）。 |
| manifest | package 直下の `manifest.json`。本書の対象。 |
| content / entry | `manifest.contents` の **いずれかの配列**（`images` / `volumes` / `composeProjects`）に属する 1 要素。 |
| chunk | 大きな content の分割単位。不要なら 1 chunk = entry 全体。 |
| 完了 package | すべての chunk 書き出しが終わった package。 |
| 中断 package | 未完了 chunk が 1 個以上残る package。 |
| 再開 | 中断 package を完了 package まで進めること。 |

---

## 2. 互換方針

### 2.1 schemaVersion

- `"1.0"`: 既存。中断・再開なし。常に完了 package。
- `"1.1"`: 本書の対象。1.0 フィールドを上位互換で含む。

### 2.2 読み取り側（Importer）

- 1.0 manifest を読めること。
- 1.1 manifest を読めること。
- 1.1 で未知の任意フィールドが現れても無視して読めること（前方互換）。

### 2.3 書き出し側（Exporter）

- 設定がなければ 1.1 を出力する（本リリース以降のデフォルト想定）。
- 1.0 互換モードを設定で選べる。互換モードでは `partialState` を持たない＝中断・再開非対応。

---

## 3. manifest 1.1 追加スキーマ

### 3.1 追加フィールド（manifest ルート）

`partialState?: PartialState`

- 中断 package のみ書く。完了 package には**書かない**（キーごと不在）。
- **存在＝中断、不在＝完了**で一意に定める。

### 3.2 PartialState

```json
{
  "pendingChunks": [],
  "lastUpdatedAt": "",
  "checksumPolicy": "verify-resumed",
  "resumeToken": "",
  "interruptionReason": "user-cancel"
}
```

| フィールド | 必須 | 説明 |
|------------|------|------|
| `pendingChunks` | はい（1 個以上） | 未完了チャンクのみ。空なら `partialState` 自体を書かない（空配列の `partialState` は不正）。 |
| `lastUpdatedAt` | はい | ISO8601。 |
| `checksumPolicy` | はい | 下記 Enum。 |
| `resumeToken` | 任意 | Exporter 内部用の不透明文字列。Importer は解釈しない。 |
| `interruptionReason` | 任意 | `'user-cancel' \| 'error' \| 'crash'`（診断用）。 |

### 3.3 ChunkRef

| フィールド | 型 | 必須 | 説明 |
|-----------|----|-----|------|
| `contentKind` | ContentKind | 必須 | 系統識別子（`'image'` / `'volume'` / `'composeProject'`） |
| `contentId` | string | 必須 | 当該系統内の `name` を流用 |
| `chunkIndex` | number | 必須 | 0 始まり |
| `byteOffset` | number | 必須 | content 内のバイトオフセット |
| `byteLength` | number | 必須 | 本 chunk のバイト長 |
| `expectedSha256` | string | 必須 | 本 chunk の期待 SHA-256（hex 小文字） |

- `byteOffset` + `byteLength` は content の総バイト長を超えてはならない。
- 同一 (`contentKind`, `contentId`, `chunkIndex`) は `pendingChunks` 内に高々 1 個。
- `contentId` は当該系統（`contentKind`）内での一意性のみ保証される。系統をまたぐと衝突しうるため、識別には常に `contentKind` とセットで扱う。

JSON 例:

```json
{
  "contentKind": "image",
  "contentId": "",
  "chunkIndex": 0,
  "byteOffset": 0,
  "byteLength": 0,
  "expectedSha256": ""
}
```

### 3.4 ChecksumPolicy

| 値 | 意味 |
|----|------|
| `verify-all` | 再開時に全 chunk を検証。最も安全・最も遅い。 |
| `verify-resumed` | `pendingChunks` とその隣接 chunk のみ検証。**推奨デフォルト**。 |
| `trust-completed` | 完了済みは無検証。最速・リスクあり。 |

1.0 manifest では `checksumPolicy` 不在＝Importer は **`verify-all` 相当**で振る舞う。

### 3.5 contents 構造とエントリ拡張

現行どおり `contents` は **オブジェクト**（`images` / `volumes?` / `composeProjects?` の三系統）であり、配列 `contents[]` は採用しない。1.0 からこの骨子は変更しない。chunk 化の情報は `partialState.pendingChunks` に閉じる。

---

## 4. 完了/中断の判定規則

### 4.1 完了 package

- `schemaVersion: '1.1'`
- `partialState` フィールドが**存在しない**
- すべての content が実体ファイルとして揃っている
- → `previousPackage` として参照可能

### 4.2 中断 package

- `schemaVersion: '1.1'`
- `partialState` が存在し `pendingChunks` が 1 個以上
- → `previousPackage` として参照**不可**（§7）

### 4.3 不正 package（検出時はエラー）

- `schemaVersion: '1.1'` かつ `partialState.pendingChunks` が空配列
- `schemaVersion: '1.0'` かつ `partialState` を持つ
- `pendingChunks` が存在しない `(contentKind, contentId)` の組を参照する、または `contentKind` が不正
- `(offset, length)` が content 範囲を超える

---

## 5. Exporter 仕様

1. manifest を `partialState` 付きで書き出す（初期は全 chunk が pending、など実装定義）。
2. chunk を 1 つ書き出すごとに `pendingChunks` から該当を削除し、`lastUpdatedAt` を更新して manifest を**再書き込み**。
3. `pendingChunks` が空になったら `partialState` ごと削除して最終書き込み（完了 package）。

中断時は最後に成功した manifest 状態が中断 packageとなる。`interruptionReason` はベストエフォート。

### 5.1 manifest 再書き込みの原子性

`manifest.json` は一時ファイル + rename による原子的差し替え。

### 5.2 1.0 互換モード

`partialState` は一切書かない。中断時は package 破棄（再開不可）。

---

## 6. Importer 仕様

### 6.1 入口の分離

| API | 役割 |
|-----|------|
| `openAsBase(path)` | 系列の基底として開く。完了 package のみ。中断なら **E2070**。 |
| `openForResume(path)` | 再開対象として開く。中断 package のみ。完了なら **E2071**。 |

UI は manifest を先読みして `partialState` の有無で分岐。

### 6.2 検証

- 開いた直後に `checksumPolicy` に従う。
- `verify-all`: 全 chunk SHA-256。
- `verify-resumed`: `pendingChunks` の chunk と `chunkIndex ± 1`。隣接 chunk は **同一 `(contentKind, contentId)` 内**に限定し、content 境界を越えない。
- `trust-completed`: `pendingChunks` の chunk のみ。

検証失敗は **E2072**。

### 6.3 前方互換

未知フィールドは無視。

---

## 7. 系列（previousPackage）との関係

1. 中断 package を `previousPackage` に指定することは禁止。Exporter は **E2073**、チェイン解決で中断に当たれば **E2074**。
2. 再開して完了した package は、以降は通常の完了 package として参照可能。
3. 系列の鎖は「完了 package のみ」が不変条件。

---

## 8. UI フロー（概要）

- 中断発生時は再開ルートへ誘導。
- Import ページ: manifest 先読み → 完了は従来フロー、中断は再開確認ダイアログ → `openForResume`。
- 差分プレビューの除外集合は本仕様では manifest に永続化しない（将来 `excludedProjects` / `excludedImages` を予約ドキュメントのみ可）。

---

## 9. エラーコード追加分

| コード | 定数名 | 概要 |
|--------|--------|------|
| E2070 | `INVALID_BASE_PACKAGE` | 中断 package を基底として開いた |
| E2071 | `NOT_A_PARTIAL_PACKAGE` | 完了 package を再開しようとした |
| E2072 | `CHUNK_CHECKSUM_MISMATCH` | chunk SHA-256 検証失敗 |
| E2073 | `EXPORT_PREVIOUS_IS_PARTIAL` | Export 時の `previousPackage` が中断 |
| E2074 | `CHAIN_CONTAINS_PARTIAL` | `previousPackage` チェインに中断あり |
| E2075 | `MANIFEST_PARTIAL_INVALID` | `partialState` 構造が不正（§4.3） |

既存（参考）: E2060 `DIFF_COMPUTATION_FAILED`、E2062 `NO_BASE_SNAPSHOT`。

---

## 10. 型定義（`types.ts` 反映案）

```typescript
export type SchemaVersion = '1.0' | '1.1';

export type ChecksumPolicy =
  | 'verify-all'
  | 'verify-resumed'
  | 'trust-completed';

export type InterruptionReason = 'user-cancel' | 'error' | 'crash';

export type ContentKind = 'image' | 'volume' | 'composeProject';

export interface ChunkRef {
  contentKind: ContentKind;
  contentId: string;
  chunkIndex: number;
  byteOffset: number;
  byteLength: number;
  expectedSha256: string;
}

export interface PartialState {
  pendingChunks: ChunkRef[];
  lastUpdatedAt: string;
  checksumPolicy: ChecksumPolicy;
  resumeToken?: string;
  interruptionReason?: InterruptionReason;
}

// DmigManifest に optional:
// partialState?: PartialState;
```

---

## 11. テスト観点（着手時メモ）

- 1.0 manifest を 1.1 Importer で読める（後方互換）
- 1.1 完了 package が 1.0 互換モードで無視可能な追加フィールドのみであること
- `partialState` あり → `openAsBase` で E2070
- 完了 → `openForResume` で E2071
- `pendingChunks` 空配列 manifest → E2075
- `contentKind` / `contentId` の組が manifest 実体と一致しない → E2075
- `previousPackage` が中断を指す Export → E2073
- 中断 → 再開 → 完了 → `previousPackage` 指定の一連
- `checksumPolicy` 各値の検証範囲
- manifest 再書き込み中の電源断シミュレーション（rename 原子性）

---

## 12. 未確定事項（v0.3 以降）

- chunk サイズの推奨値とポリシー（可変か固定か）。
- `resumeToken` を解釈できないバージョン差のときの挙動。
- `excludedProjects` / `excludedImages` を manifest 永続化する場合の位置とキー名（§8）。
- マルチ package 並行 Export 時の `partialState` 整合。
- 完了済み chunk のバックグラウンド再検証（将来的な「掃除」タスク）の余地。

---

## 実装メモ（ドラフト → コード化時）

- 現行 `ManifestImageEntry` 等に独立 `id` が無い場合でも、**`contentKind` + `contentId`（= 当該系統の `name`）** で Exporter/Importer を一貫させる。単一文字列へのエンコードは行わない。
- 本ファイルは `仕様書.txt` の §11 から参照される正本のドラフトとする。

---

## 変更履歴

- **v0.1** (2026-05-17): 初版。
- **v0.2** (2026-05-18): `contents` が配列ではなくオブジェクト（`images` / `volumes` / `composeProjects`）であることが判明したため、`ChunkRef` に `contentKind` を追加して系統識別を可能にした。これに伴い §3.3 と §10 を改訂。`partialState` 本体の構造は変更なし。
- **v0.2.1** (2026-05-18): §6.2 に `verify-resumed` の隣接 chunk 範囲を補足追記（同一 `contentKind`+`contentId` 内、content 境界を越えない）。step 3 実装と矛盾しないことを明示。
