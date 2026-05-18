# Phase 7 テスト厚め化 計画書

**対象モデル**: Composer2 / Opus（実装は別セッション）
**起案日**: 2026-05-18
**前提コミット**: `665f3e6`（指示書 R-1/R-2/R-3 を git 管理化した直後）
**ステータス**: **計画段階**。マスター承認後に各 step を別セッションで実装。

---

## 0. 背景と目的

仕様書 §9 のロードマップ:

| Phase | 内容 |
|---|---|
| Phase 6 | A: ドライラン、I: ロールバック（完了） |
| **Phase 7** | **B: 差分・再開（最優先要件のためテスト厚め）** |
| Phase 8 | L: WSL2 丸ごとモード |

Phase 6 第 3 回で **manifest 1.1 / `partialState` / 中断・再開** の **実装**は入ったが、テスト件数は現状 **19 件 / 3 ファイル** のみで、再開フロー本体のテストが薄い:

| 既存テストファイル | 件数 | カバー範囲 |
|---|---:|---|
| `dmig/src/main/core/Importer.openedPackage.test.ts` | 7 | `openAsBase` / `openForResume` / `probe` / `validatePartialState` の異常系 |
| `dmig/src/main/core/Exporter.partialState.test.ts` | 5 | `partialState` 書き込み・原子書き換え |
| `dmig/src/shared/importProbeUi.test.ts` | 7 | Renderer 側 `gateImportAfterProbe` 分岐 |

**未カバー領域**:

1. **`Importer.importImages` の新シグネチャ**（R-1 で `OpenedPackageBase` 受け取りに変更）— **テストゼロ**。
2. **`ComposeImporter.importProjects` 経路の `OpenedPackageBase` インライン渡し**（R-1 で変更）— テストゼロ。
3. **`resumeExport` の IPC 経路（`dmig:resumeExport` ハンドラ）** — E2E 寄りのテストゼロ。
4. **中断 → 再開 → 完了の物理シナリオ**（合成 manifest + 合成 chunk + sha256 検証）— ゼロ。
5. **`Importer.validatePartialState` のエッジケース**— 主要ケースは入っているが、`byteOffset` / `byteLength` の境界（`Number.MAX_SAFE_INTEGER` 級・負値）、`pendingChunks` 超巨大配列、`contentId` の正規化（trim / case）など補強余地あり。
6. **`DockerAdapter` の `DOCKER_HOST` 分岐**（R-2 で追加）— モックでの単体テスト可能だが**未着手**。

Phase 7 の本旨は「B: 差分・再開のテストを厚くする」ことなので、**項目 1〜4 が最優先**、5/6 は副次的に拾う。

---

## 1. 完了の Success Criteria（Phase 7 全体）

Phase 7 完了は次の状態を満たした時点とする:

1. `Importer.importImages` の新 API（OpenedPackageBase 受け取り）に対する単体テストが **8 件以上**。
2. `ComposeImporter.importProjects` の `OpenedPackageBase` インライン生成経路に対するテストが **3 件以上**（image-only / volume + image / bind mount + image）。
3. `Exporter.exportImages` の中断 → 再開 → 完了の **物理シナリオテスト**が **3 件以上**（中断ポイント別: 1/3 / 2/3 / 直前）。
4. `dmig:resumeExport` IPC ハンドラの正常系・異常系（`E2074` chain partial / `E2070` invalid base / `E2075` partial 不正）の **integration test**が **5 件以上**。
5. `Importer.validatePartialState` の境界・エッジケースを **3 件追加**（合計 10 件相当）。
6. `DockerAdapter` の `DOCKER_HOST` 分岐に対する単体テスト **2 件**（設定あり/なし、構築のみ。実 daemon 接続はしない）。
7. **合計テスト数**: 19 件 → **44 件以上**（+25 件目標）。
8. `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` が緑。
9. テスト追加に伴うプロダクトコード改修は **基本ゼロ**。テスタビリティが致命的に不足する箇所が出た場合のみ、`Importer` / `Exporter` に **テスト用 hook（`for-test:` プレフィックスの protected メソッド）** を最小限導入し、別途設計検討する。

---

## 2. 分割 step（各 step = 別セッション = 別指示書）

Phase 7 は大規模なので、**5 つの step に分割**し、それぞれ独立した指示書を起こす。

### Step 1: `Importer.importImages` 単体テスト追加

**ファイル**: `dmig/src/main/core/Importer.importImages.test.ts`（新規）

**テストケース**（8〜10 件）:

| # | ケース | 期待 |
|---|---|---:|
| 1 | 正常: 1 イメージ選択 → verify → load まで進捗イベント発火 | ok |
| 2 | 正常: 複数イメージ選択 → 順序保持、進捗 `current` インクリメント | ok |
| 3 | 異常: `selectedImages` が manifest に存在しない名前 | `E2003 IMAGE_NOT_FOUND` |
| 4 | 異常: `selectedImages` 空配列 | `E2003 IMAGE_NOT_FOUND` |
| 5 | 異常: `signal.aborted` が初回 iteration 前に true | `E1100 JOB_CANCELLED` |
| 6 | 異常: `signal.aborted` が 2 件目処理前に true | `E1100 JOB_CANCELLED` |
| 7 | 異常: チャンク sha256 不一致 | `E2010 CHECKSUM_MISMATCH` |
| 8 | 異常: manifest 内の `filename` が `images/` プレフィックス無し → 自動補完で正常 | ok |

**fixture 戦略**:
- `DockerAdapter` は **interface だけを使う mock**（`loadImageStream` を no-op + onProgress 呼び出しに差し替え）。
- 合成 tar.zst は `pefile` 等で本物の PE を作るのは過剰。**zstd 圧縮した適当な byte 列**（"hello" のような短文）を tmpdir に書き、sha256 は実計算する。`createReadStream` → `decompressStream` → mock `loadImageStream` が pipe で繋がれば OK。
- `EventEmitter` の `progress` イベントは配列にキャプチャして assertion。

**プロダクトコード改修**: 不要。

**所要**: 1 セッション（2〜3 時間）。

---

### Step 2: `ComposeImporter.importProjects` 経路テスト追加

**ファイル**: `dmig/src/main/core/ComposeImporter.test.ts`（新規）

**テストケース**（3〜5 件）:

| # | ケース | 期待 |
|---|---|---|
| 1 | image-only project: `imagePackaged` のみ → `imageImporter.importImages(opened, ...)` が `mode: 'base'` の `OpenedPackageBase` で呼ばれる | mock 確認 |
| 2 | image + volume: image 後に `volumeExporter.importOne` が呼ばれる順序 | sequence |
| 3 | image + bind mount: tarBackend 経由展開、`bindMountRemap` 反映 | path 確認 |
| 4 | 異常: `selectedProjects` が manifest に無い | `COMPOSE_NOT_FOUND` |
| 5 | 異常: `destinationDirs` 未指定 | `DESTINATION_DIR_INVALID` |

**fixture 戦略**:
- `Importer` / `VolumeExporter` を **spy / mock 化**。`importImages(opened, selected, signal)` の第 1 引数が `mode: 'base'` で `manifest === dmigManifest` の同一参照であることを確認。
- 合成 `ProjectManifest` は JSON で書く（`pm.services` / `pm.volumes` / `pm.bindMounts` を直書き）。
- tar.zst 展開は **Step 1 と同じ短文 zstd**で十分。

**プロダクトコード改修**: 不要。

**所要**: 1 セッション（2〜3 時間）。

---

### Step 3: 中断 → 再開 → 完了の物理シナリオ（Exporter 側）

**ファイル**: `dmig/src/main/core/Exporter.resumeFlow.test.ts`（新規）

**テストケース**（3〜5 件）:

| # | ケース | 期待 |
|---|---|---|
| 1 | 1/3 イメージ完了で中断 → `partialState.pendingChunks.length === 2` | manifest 構造 |
| 2 | 2/3 完了で中断 → 残 1 件 | manifest 構造 |
| 3 | 全件完了直前で中断 → `pendingChunks.length === 0` ではなく **`partialState` 自体が消える**（完了 manifest 化） | `partialState === undefined` |
| 4 | 中断後に再開 → 残チャンクのみ処理 → 最終 manifest は `partialState` 無し | integration |
| 5 | 異常: 再開時に既存ファイルがディスクから消えている | `E2073 CHUNK_CHECKSUM_MISMATCH` 相当 |

**fixture 戦略**:
- `DockerAdapter` mock の `saveImageStream` は **N バイト目で `AbortError` を投げる**仕掛けで中断を再現。
- `Exporter` の `ManifestWriter` は実ファイル（tmpdir）に書く。原子書き換えの正常動作も同時に確認。
- 進捗イベント全件キャプチャして「中断時点までの `partialState` の `lastUpdatedAt` が増分更新されている」ことを確認。

**プロダクトコード改修**: 軽微の可能性あり（中断ポイントを test から制御可能にする内部 hook）。**最小限**に留める。

**所要**: 1 セッション（3〜4 時間）。

---

### Step 4: `dmig:resumeExport` IPC ハンドラ integration テスト

**ファイル**: `dmig/src/main/ipc/exportImages.resume.test.ts`（新規）

**テストケース**（5〜7 件）:

| # | ケース | 期待 |
|---|---|---|
| 1 | 正常: ok_partial package を受けて `resumeExport` 呼び → 完了 | `ok: true` |
| 2 | 異常: 完了 package（partialState 無し）を `resumeExport` 対象に | `E2071 NOT_A_PARTIAL_PACKAGE` |
| 3 | 異常: 中断 manifest の partialState 構造不正 | `E2075 MANIFEST_PARTIAL_INVALID` |
| 4 | 異常: `previousPackage` が `partialState` 持ち（チェーン中の中断） | `E2074 CHAIN_CONTAINS_PARTIAL` |
| 5 | 正常: `compressionLevel` 任意指定の反映 | option 反映確認 |
| 6 | キャンセル: 実行中に `jobRegistry.cancel(jobToken)` | `E1100 JOB_CANCELLED` |
| 7 | progress: `dmig:progress` イベントが `webContents.send` 経由で発火 | spy 確認 |

**fixture 戦略**:
- `BrowserWindow` mock（`webContents.send` の spy のみ）。
- `ipcMain.handle` は Electron テスト用の薄いハーネスで直接呼ぶ（既存テストには ipcMain を叩くものが無いので、**最小ハーネス**を `test-utils/ipcHarness.ts` に新設するか検討）。
- `DockerAdapter` は Step 1 と同じ mock。

**プロダクトコード改修**: ipc ハーネスの設計次第。要検討。

**所要**: 1〜2 セッション（4〜6 時間）。Step 1〜3 の fixture 資産があれば早まる。

---

### Step 5: 周辺カバレッジ（`validatePartialState` 境界 + `DockerAdapter` env 分岐）

**ファイル**:
- `dmig/src/main/core/Importer.openedPackage.test.ts`（既存に追記）
- `dmig/src/main/core/DockerAdapter.test.ts`（新規）

**テストケース**（5 件）:

| # | ケース | 期待 |
|---|---|---|
| 1 | `validatePartialState`: `byteOffset === 0` かつ `byteLength === Number.MAX_SAFE_INTEGER` | ok（境界 OK） |
| 2 | `validatePartialState`: `byteOffset` が負値 | `E2075` |
| 3 | `validatePartialState`: 同一 `(contentKind, contentId, chunkIndex)` が 100 件重複 | `E2075` reason=duplicate_chunk_ref |
| 4 | `DockerAdapter`: `process.env.DOCKER_HOST` 未設定 → コンストラクタが OS 別 socketPath を使う | `(docker as unknown).modem.socketPath === expected` |
| 5 | `DockerAdapter`: `DOCKER_HOST=unix:///tmp/foo.sock` → コンストラクタが env 解釈経路を通る | `(docker as unknown).modem.socketPath === '/tmp/foo.sock'` |

**fixture 戦略**:
- `DockerAdapter` テストは **コンストラクタの分岐確認のみ**。`vi.stubEnv` で `DOCKER_HOST` を切り替え、`new DockerAdapter()` 後に `(adapter as unknown as { docker: Docker }).docker.modem` を読み出して assertion。
- 実 daemon 接続はしない（`ping()` も呼ばない）。

**プロダクトコード改修**: 不要。

**所要**: 0.5〜1 セッション。

---

## 3. 実行順と依存関係

```
Step 1 (importImages 単体)
   ↓
Step 2 (ComposeImporter)   ← Step 1 の DockerAdapter mock を流用
   ↓
Step 3 (Exporter resume 物理)  ← 並行可能
   ↓
Step 4 (resumeExport IPC integration)  ← Step 1〜3 の fixture を全部使う
   ↓
Step 5 (周辺カバレッジ)  ← いつでも入れられる、最後でよい
```

- **Step 1 と Step 3 は並行可能**（互いに依存しない）。
- Step 2 は Step 1 の `DockerAdapter` mock パターンを再利用するため、Step 1 後がスムーズ。
- Step 4 は Step 1〜3 の fixture（合成 manifest / 合成 chunk / mock）を全部使うので最後。
- Step 5 は独立。気分転換 / 隙間時間でも可。

---

## 4. テスト用 fixture / mock の共通化

各 step で同じ fixture を書き直すのは無駄なので、**共通化ファイル**を 1 つ作る:

**ファイル**: `dmig/src/main/core/__test-fixtures__/index.ts`（新規）

**輸出**:

```typescript
export function makeDockerAdapterMock(opts?: {
  loadImageStream?: (stream: Readable, onProgress?: (msg: string) => void) => Promise<void>;
  saveImageStream?: (name: string) => Promise<Readable>;
  // ...
}): DockerAdapter;

export function makeManifest(overrides?: Partial<DmigManifest>): DmigManifest;
export function makeChunkRef(overrides?: Partial<ChunkRef>): ChunkRef;
export function makePartialState(overrides?: Partial<PartialState>): PartialState;

export async function writeSyntheticImageTarZst(
  dir: string,
  name: string,
  payload?: string,
): Promise<{ filepath: string; sha256: string }>;
```

**規約**:
- このファイル自体には test を書かない（`*.test.ts` ではない）。
- vitest の `tests/` 配下ではなく、テスト対象と同じ `core/` 配下に置く（既存テストファイルも `core/` 配下にあるため）。
- `__test-fixtures__/` ディレクトリ名は jest / vitest 慣習。

---

## 5. スコープ外（本 Phase 7 で**やらない**こと）

- **E2E テスト（Electron 全起動）**: Phase 10 の責務。本 Phase ではユニット〜integration（ハンドラ単体）まで。
- **GUI スナップショット / Playwright**: 不要。Renderer 側の `gateImportAfterProbe` は既にテスト済み。
- **テストカバレッジ計測ツールの導入**（`@vitest/coverage-v8` 等）: 別タスク。
- **モックライブラリの導入**（`vitest-mock-extended` / `tsmockito` 等）: 既存テストは vitest 標準で書かれている。揃える。
- **`docker context` 連携テスト**: R-2 のスコープ外（仕様書にも無い）。
- **DOCKER_HOST が tcp://remote の状態での実 daemon 接続テスト**: lab 環境前提なら可能だが、CI で再現できないので本 Phase では追加しない。
- **負荷テスト（巨大 manifest / 1000 チャンク）**: 必要性が出てきたら別タスク。

---

## 6. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Step 4 (IPC integration) で ipcMain のテストハーネス設計が難航 | スケジュール遅延 | Step 4 着手前に「ハーネスを書くか / `registerIpcHandlers` 内部を直接呼ぶか」を別途検討 |
| プロダクトコードに test-only hook を入れるとアーキの清潔さが崩れる | コード品質低下 | 各 step 指示書で「hook を入れるかどうか」を事前判断 |
| Step 3 の Exporter 中断シミュレーションが flaky | テスト信頼性低下 | `AbortError` を **決定論的に投げる** mock を共通 fixture に置く（時間ベースの中断はしない） |
| Step 1〜5 を全部入れると 19 → 44 件で test 実行時間が長くなる | 開発体験悪化 | Step 終了ごとに `npm run test -- --reporter=verbose` で実行時間を測り、3 秒超なら slow test を切り出す |

---

## 7. 完了後の出口

Phase 7 完了時:

1. `CHANGELOG.md` の `[Unreleased]` に各 step の Added を集約。
2. **タグ `v0.3.0-poc`** を打つ判断（テスト追加だけなら PATCH bump で `v0.2.1-poc` でもよい。マスター判断）。
3. 仕様書 §9 の Phase 7 完了マーク。
4. Phase 8（L: WSL2 丸ごとモード）の設計に移行。

---

## 8. 次セッションへの引き継ぎ事項

次セッション開始時、最初に確認すべき:

1. 現 `main` の先端コミットがこの計画書追加後の状態か。
2. Step 1 から始めるか、別の Step を優先するか。
3. テスト用 fixture (`__test-fixtures__/index.ts`) を **Step 1 着手時に同時に作る**か、Step 1 単独で書ききって Step 2 でリファクタするか。**推奨は前者**（後から抜き出すと既存テスト書き直し発生）。

各 Step は **別指示書** (`docs/instructions/phase7-step{1..5}-*.md`) を起こしてマスター承認後に着手する。
