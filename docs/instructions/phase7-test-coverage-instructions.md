# Phase 7 テスト厚め化 包括指示書（Step 1〜5 統合版）

**対象モデル**: Composer2 / Opus
**作業日**: 2026-05-18 以降（マスター承認後）
**前提コミット**: `0830afb`（Phase 7 計画書の日記ハッシュ反映済み。`main` の先端）
**前提ドキュメント**: `docs/instructions/phase7-test-coverage-plan.md`（俯瞰計画）
**作業ブランチ**: `main` に直接コミット → push（既存運用どおり）

---

## 0. 背景

仕様書 §9 の Phase 7（B: 差分・再開、最優先要件のためテスト厚め）を実装する。Phase 6 第 3 回で `partialState` / 中断・再開の **実装**は完了したが、テスト件数は 19 件 / 3 ファイルにとどまり、再開フロー本体・新シグネチャの `importImages`・`ComposeImporter` の `OpenedPackageBase` インライン経路・`resumeExport` IPC 経路がほぼ未カバー。

本指示書は計画書（`phase7-test-coverage-plan.md`）の Step 1〜5 を **1 本にまとめた実装指示**である。マスターの選択により「全体を 1 セッションで読みたい・実装は段階的でよい」という形式を採用。

**重要**: 本指示書は **実装の手順書**であり、Step ごとの完了条件・ファイル・コミット粒度・スコープ外を明示する。各 Step は **独立してコミット**し、Step n まで完了した状態で push して中断可能とする。

---

## 1. 全体の Success Criteria

Phase 7 完了は次の状態を満たした時点とする:

1. テスト件数: **19 件 → 44 件以上**（+25 件目標）。
2. 新規テストファイル 4 つ（Step 1〜4 で 1 つずつ）と既存テストへの追記 2 つ（Step 5）。
3. 共通 fixture を `dmig/src/main/core/__test-fixtures__/index.ts` に集約し、Step 1〜4 で再利用。
4. `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` が緑。
5. **プロダクトコードの改修は基本ゼロ**。テスタビリティが致命的に不足する箇所のみ最小限の hook を追加し、その追加は Step 内で明示的に正当化する。
6. 各 Step ごとに本体コミット + 日記コミットの 2 段で push 済み（合計 10 コミット程度）。
7. 開発日記に各 Step のエントリを 1 つずつ追加。
8. 最終 Step 完了時に CHANGELOG `[Unreleased]` に Added セクションで Phase 7 のテスト追加を 1 行記録。

途中で疑義があれば手を止めてマスターに確認すること。

---

## 2. 触ってよいファイル / 触ってはいけないファイル

### 触ってよい

- `dmig/src/main/core/__test-fixtures__/index.ts`（新規、Step 0 で作成）
- `dmig/src/main/core/Importer.importImages.test.ts`（新規、Step 1）
- `dmig/src/main/core/ComposeImporter.test.ts`（新規、Step 2）
- `dmig/src/main/core/Exporter.resumeFlow.test.ts`（新規、Step 3）
- `dmig/src/main/ipc/exportImages.resume.test.ts`（新規、Step 4）
- `dmig/src/main/core/Importer.openedPackage.test.ts`（追記、Step 5）
- `dmig/src/main/core/DockerAdapter.test.ts`（新規、Step 5）
- `dmig/src/main/test-utils/ipcHarness.ts`（新規、Step 4 で必要なら）
- `docs/2026-05-18_開発日記.html` または開始日が日跨ぎする場合は当日の日記
- `CHANGELOG.md`（最終 Step で 1 行追記）

### 触ってはいけない

- **プロダクトコードのファイル全て**（`dmig/src/main/core/*.ts` の **テストファイル以外**、`dmig/src/main/ipc/*.ts` の **テストファイル以外**、preload、Renderer、`@shared/**`）。例外: Step 内で明示的に「最小 hook 追加」と判断された箇所のみ。
- 既存テスト（`Importer.openedPackage.test.ts` の **既存 7 件**、`Exporter.partialState.test.ts`、`importProbeUi.test.ts`）の **既存ケース**。Step 5 の追記のみ可。
- IPC チャンネル名・引数型・戻り値型・進捗イベント形状。
- `@shared/codes.ts` の `ErrorCodes` 列挙。
- `vitest.config.ts`（`include: ['src/**/*.test.ts']` で十分に拾える）。

### アンチパターン（明示的に禁止）

- テストのために `Importer` / `Exporter` の private メソッドを protected に下げる（最終手段）。
- vitest 以外のテストフレームワーク導入（jest、ava、mocha 等）。
- `vitest-mock-extended` / `tsmockito` 等のモックライブラリ追加。**vitest 標準 (`vi.fn` / `vi.spyOn` / `vi.stubEnv`) のみ**で書く。
- カバレッジ計測ツール (`@vitest/coverage-v8`) の導入。別タスク。
- E2E (Electron 全起動 / Playwright) の導入。Phase 10 の責務。
- 既存テストの「ついで refactor」。重複 fixture が出ても Step 5 までは触らない。Step 5 で共通化検討。

---

## 3. Step 0: 共通 fixture の整備

### 3.1 ゴール

`dmig/src/main/core/__test-fixtures__/index.ts` を新設し、Step 1〜4 で使う合成オブジェクトと mock を集約する。

### 3.2 export する関数群

```typescript
// 合成 manifest
export function makeManifest(overrides?: Partial<DmigManifest>): DmigManifest;
export function makeChunkRef(overrides?: Partial<ChunkRef>): ChunkRef;
export function makePartialState(overrides?: Partial<PartialState>): PartialState;
export function makeProjectManifest(overrides?: Partial<ProjectManifest>): ProjectManifest;

// DockerAdapter mock
export interface DockerAdapterMockOptions {
  loadImageStream?: (stream: Readable, onProgress?: (msg: string) => void) => Promise<void>;
  saveImageStream?: (imageName: string) => Promise<Readable>;
  listImages?: () => Promise<ImageInfo[]>;
  ping?: () => Promise<{ version: string }>;
  resolveImageId?: (ref: string) => Promise<string | undefined>;
  exportVolumeStream?: (name: string) => Promise<Readable>;
  importVolumeStream?: (name: string, stream: Readable, opts?: { overwrite?: boolean }) => Promise<void>;
  inspectVolume?: (name: string) => Promise<unknown>;
}
export function makeDockerAdapterMock(opts?: DockerAdapterMockOptions): DockerAdapter;

// 合成 image tar.zst の物理ファイル生成
// 短文 payload を zstd 圧縮して dir/filename に書き、sha256 を返す
export async function writeSyntheticImageTarZst(
  dir: string,
  filename: string,
  payload?: string,
): Promise<{ filepath: string; sha256: string; compressedSize: number }>;

// tmpdir 管理
export function makeTempDirManager(): {
  create(prefix: string): Promise<string>;
  cleanupAll(): Promise<void>;
};
```

### 3.3 規約

- このファイル自体には test を **書かない**（`*.test.ts` ではない）。
- `vitest.config.ts` の `include: ['src/**/*.test.ts']` でテスト収集対象から外れる位置に置く。
- `makeDockerAdapterMock` は **`as unknown as DockerAdapter`** で型強制（既存 `Exporter.partialState.test.ts` の `makeDockerStub` と同じ流儀）。
- 既定値（オーバーライド無し時）は「**最も無害な成功応答**」を返す:
  - `ping`: `{ version: 'test-docker' }`
  - `listImages`: `[]`
  - `loadImageStream`: 単に stream を `resume()` して消費
  - `saveImageStream`: `Readable.from(Buffer.from('test'))`
- `writeSyntheticImageTarZst` の payload 既定は `'dmig-test-payload'`。zstd 圧縮は `createZstdCompressStream` を直接使うのではなく、**node 標準の `zlib` で gzip にする**選択肢もあるが、本フィクスチャは Importer の `createZstdDecompressStream` に通すため zstd 必須。`@mongodb-js/zstd` か既存実装の `compression/zstdStreams.ts` を直接 import して使う。

### 3.4 完了条件

- `npm run typecheck` 緑。`npm run lint` 緑。
- このファイルは export のみで副作用なし（top-level でファイル作成しない、env を変えない）。

### 3.5 コミット

```
test(fixtures): add shared test fixtures for Phase 7 coverage
```

対象: `dmig/src/main/core/__test-fixtures__/index.ts` のみ。日記エントリは **Step 1 完了時にまとめて 1 つ**。Step 0 単独の日記は出さない（fixture 単体では振る舞いが何も変わらないため、`04-diary-workflow` の「コード編集 1 件以上で記録」の境界判断）。

---

## 4. Step 1: `Importer.importImages` 単体テスト

### 4.1 ゴール

R-1 で導入した新シグネチャ `importImages(opened: OpenedPackageBase, selectedImages: string[], signal?)` の単体テストを **8 件**追加する。

### 4.2 ファイル

`dmig/src/main/core/Importer.importImages.test.ts`（新規）

### 4.3 テストケース

| # | describe / it | 期待 |
|---|---|---|
| 1 | `正常: 1 イメージ選択 → verify → load フェーズの progress イベントが順に発火する` | `progress[*].phase` 列が `['verify', 'load']` を含む |
| 2 | `正常: 複数イメージ (3 件) 選択 → 順序保持、進捗 current が 0→1→2 とインクリメント` | `progress.filter(p => p.phase === 'verify').map(p => p.current)` が `[0, 1, 2]` |
| 3 | `異常: selectedImages が manifest に存在しない名前 → E2003` | rejects with `code: 'E2003'` |
| 4 | `異常: selectedImages が空配列 → E2003` | rejects with `code: 'E2003'` |
| 5 | `異常: signal.aborted が初回 iteration 前に true → E1100 JOB_CANCELLED` | rejects with `code: 'E1100'` |
| 6 | `異常: signal.aborted が 2 件目処理前に true → E1100` | 1 件目は完了、2 件目で reject |
| 7 | `異常: チャンク sha256 不一致 → E2010 CHECKSUM_MISMATCH` | rejects with `code: 'E2010'` |
| 8 | `正常: manifest 内 filename が "images/" プレフィックス無し → 自動補完で正常完了` | resolves、`loadImageStream` が呼ばれる |

### 4.4 fixture の使い方（指針）

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Importer } from './Importer.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  writeSyntheticImageTarZst,
  makeTempDirManager,
} from './__test-fixtures__/index.js';
import type { OpenedPackageBase } from './importer/OpenedPackage.js';

describe('Importer.importImages (新シグネチャ)', () => {
  const tmp = makeTempDirManager();
  afterEach(() => tmp.cleanupAll());

  it('正常: 1 イメージ選択 → verify → load フェーズの progress が順に発火', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const { filepath, sha256 } = await writeSyntheticImageTarZst(dir, 'images/imgA.tar.zst');

    const manifest = makeManifest({
      contents: {
        images: [{ name: 'imgA', filename: 'images/imgA.tar.zst', originalSize: 1, compressedSize: 1, sha256 }],
      },
    });

    const loadSpy = vi.fn().mockResolvedValue(undefined);
    const docker = makeDockerAdapterMock({ loadImageStream: loadSpy });
    const importer = new Importer(docker);
    const events: string[] = [];
    importer.on('progress', (ev) => events.push(ev.phase));

    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await importer.importImages(opened, ['imgA']);

    expect(events).toContain('verify');
    expect(events).toContain('load');
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  // ... 残り 7 件
});
```

### 4.5 完了条件

- 既存 19 件 + 新規 8 件 = **27 件**緑。
- `npm run typecheck` / `lint` / `build` 緑。
- プロダクトコード改修ゼロ。

### 4.6 スコープ外

- `ComposeImporter` 側のテスト（Step 2 で扱う）。
- `dmig:import` IPC ハンドラ層のテスト（**Step 4 のスコープに入れない**。本指示書では IPC integration は `resumeExport` のみ扱う。`dmig:import` のハンドラは現状でも薄く、Step 1 の単体テストで実質カバーされる）。
- 中断 → 再開 シナリオ（Step 3）。

### 4.7 コミット

```
test(importer): cover new importImages signature with 8 unit tests
```

対象: `dmig/src/main/core/Importer.importImages.test.ts` + Step 0 で作った fixture + 日記。日記エントリは「Step 0 + 1」をまとめて 1 つ書く。

---

## 5. Step 2: `ComposeImporter.importProjects` 経路テスト

### 5.1 ゴール

R-1 で書き換えた `imageImporter.importImages(opened, ...)` 呼び出し経路の単体テストを **3 件**追加。

### 5.2 ファイル

`dmig/src/main/core/ComposeImporter.test.ts`（新規）

### 5.3 テストケース

| # | describe / it | 期待 |
|---|---|---|
| 1 | `image-only project: importImages が mode='base' の OpenedPackageBase で 1 回呼ばれる` | spy: `opened.mode === 'base'` かつ `opened.manifest === dmigManifest` (同一参照) |
| 2 | `image + volume: importImages 後に volumeExporter.importOne が呼ばれる順序` | call order |
| 3 | `異常: selectedProjects が manifest に無い → COMPOSE_NOT_FOUND` | rejects |

bind mount テストは fixture コストが高いため Step 2 では外す（Phase 7 計画書から 1 件減らす変更）。必要なら Step 5 で追加検討。

### 5.4 fixture の使い方

- `Importer` を直接インスタンス化せず、`new Importer(makeDockerAdapterMock())` で作る。
- `importImages` を `vi.spyOn(importer, 'importImages').mockResolvedValue(undefined)` で監視。
- `VolumeExporter` も同じスタイルで spy 化。
- 合成 `ProjectManifest` は `makeProjectManifest({ services, volumes, bindMounts })` で生成。
- tar.zst の物理ファイルは Step 2 では **作らない**（image / volume の流入経路をモックするだけ）。

### 5.5 完了条件

- 既存 27 件 + 新規 3 件 = **30 件**緑。

### 5.6 コミット

```
test(compose-importer): cover OpenedPackageBase inline path with 3 tests
```

---

## 6. Step 3: 中断 → 再開 → 完了の物理シナリオ（Exporter）

### 6.1 ゴール

`Exporter.exportImages` の中断ポイント別シナリオを **3 件**追加。

### 6.2 ファイル

`dmig/src/main/core/Exporter.resumeFlow.test.ts`（新規）

### 6.3 テストケース

| # | describe / it | 期待 |
|---|---|---|
| 1 | `1/3 完了で中断 → partialState.pendingChunks.length === 2` | manifest.json 読んで構造確認 |
| 2 | `2/3 完了で中断 → partialState.pendingChunks.length === 1` | manifest 構造確認 |
| 3 | `全件完了 → partialState 自体が undefined` | manifest 確認 |

中断シミュレーションは `saveImageStream` mock で **N 回目の呼び出しから `AbortError` を throw** する形を取る。`signal.abort()` は使わない（テストの決定論性を優先）。

### 6.4 fixture の使い方

```typescript
function makeAbortingDocker(abortAfterCalls: number): DockerAdapter {
  let calls = 0;
  return makeDockerAdapterMock({
    saveImageStream: async () => {
      calls++;
      if (calls > abortAfterCalls) {
        const err = new Error('synthetic abort');
        (err as Error & { name: string }).name = 'AbortError';
        throw err;
      }
      return Readable.from(Buffer.from('test'));
    },
  });
}
```

### 6.5 プロダクトコード改修判断

`Exporter` には現状 hook が無くても上記スキーマで動くはず（既存 `Exporter.partialState.test.ts` で同じ手法を使っている）。**hook 追加禁止**。動かなければ Step 3 着手前にマスターに報告して相談。

### 6.6 完了条件

- 既存 30 件 + 新規 3 件 = **33 件**緑。

### 6.7 コミット

```
test(exporter): cover interrupt-and-resume scenarios with 3 tests
```

---

## 7. Step 4: `dmig:resumeExport` IPC integration テスト

### 7.1 ゴール

`dmig:resumeExport` ハンドラの正常系・異常系を **5 件**追加。

### 7.2 ファイル

- `dmig/src/main/ipc/exportImages.resume.test.ts`（新規）
- `dmig/src/main/test-utils/ipcHarness.ts`（新規）

### 7.3 ipcHarness 設計

ipcMain を直接叩くハーネスは以下のシグネチャ:

```typescript
export interface IpcHarness {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  captureProgress(): Array<{ channel: string; payload: unknown }>;
  cleanup(): void;
}

export function setupIpcHarness(deps: HandlerDeps): IpcHarness;
```

- 内部で `ipcMain.handle` を **オーバーライドできるよう**、`ipcMain` を thin wrap した小さい registry をテスト時だけ差し込む。
- 既存プロダクトコードを触らずに済むなら、**`vi.mock('electron', ...)` で `ipcMain` をモック化**して、ハンドラ登録時のコールバックを registry に保存する形が現実的。
- `BrowserWindow` の `webContents.send` も spy 化し、`captureProgress` で取得可能にする。

### 7.4 テストケース

| # | describe / it | 期待 |
|---|---|---|
| 1 | `正常: ok_partial package を resumeExport → 完了 → 最終 manifest の partialState が undefined` | ok |
| 2 | `異常: 完了 package (partialState 無し) を resumeExport → E2071 NOT_A_PARTIAL_PACKAGE` | error.code === 'E2071' |
| 3 | `異常: partialState 構造不正 → E2075 MANIFEST_PARTIAL_INVALID` | error.code === 'E2075' |
| 4 | `異常: previousPackage が partialState 持ち → E2074 CHAIN_CONTAINS_PARTIAL` | error.code === 'E2074' |

**実装メモ（2026-05-18）**: 現行コードベースでは `CHAIN_CONTAINS_PARTIAL`（E2074）を `openForResume` / `dmig:resumeExport` 経路でまだ投げていない。Step 4 の第 4 ケースは **`manifest.json` が存在しない `packageDir`** で `readManifest` が失敗する経路に差し替え、`error.code === 'E5001'`（`PACK_FORMAT_INVALID`）を期待する。

| 5 | `progress: dmig:progress イベントが webContents.send 経由で発火` | spy 確認 |

キャンセル / `compressionLevel` 反映は Step 4 のスコープから外す（Phase 7 計画書から 2 件削減）。必要なら Step 5 で追加検討。

### 7.5 プロダクトコード改修判断

ipcMain のモック化が `vi.mock('electron', ...)` で完結するなら **改修ゼロ**。完結しない場合は Step 4 着手前にマスターに相談。**勝手に Importer / Exporter のシグネチャを変えない**。

### 7.6 完了条件

- 既存 33 件 + 新規 5 件 = **38 件**緑。

### 7.7 コミット

```
test(ipc): cover dmig:resumeExport with 5 integration tests via ipcHarness
```

対象には ipcHarness も含む。

---

## 8. Step 5: 周辺カバレッジ（`validatePartialState` + `DockerAdapter`）

### 8.1 ゴール

`Importer.validatePartialState` の境界ケースと `DockerAdapter` の `DOCKER_HOST` 分岐の単体テスト計 **6 件**を追加。Phase 7 計画書では 5 件としたが、目標 +25 件達成のため 1 件増。

### 8.2 ファイル

- `dmig/src/main/core/Importer.openedPackage.test.ts`（追記 3 件）
- `dmig/src/main/core/DockerAdapter.test.ts`（新規 3 件）

### 8.3 テストケース

`validatePartialState` 追記（3 件）:

| # | it | 期待 |
|---|---|---|
| 1 | `byteOffset===0 かつ byteLength===Number.MAX_SAFE_INTEGER → 通る` | ok |
| 2 | `byteOffset が負値 → E2075 reason=invalid_chunk_bounds` | rejects |
| 3 | `同一 (contentKind, contentId, chunkIndex) の重複 → E2075 reason=duplicate_chunk_ref` | rejects |

`DockerAdapter` 新規（3 件）:

| # | it | 期待 |
|---|---|---|
| 4 | `DOCKER_HOST 未設定 → modem.socketPath が OS 別パスになる` | win=`//./pipe/docker_engine` / linux=`/var/run/docker.sock` |
| 5 | `DOCKER_HOST=unix:///tmp/foo.sock → modem.socketPath === '/tmp/foo.sock'` | exact match |
| 6 | `DOCKER_HOST=tcp://localhost:2375 → modem.host === 'localhost' かつ modem.port === '2375'` | exact match |

### 8.4 fixture の使い方

```typescript
import { vi } from 'vitest';

beforeEach(() => {
  vi.unstubAllEnvs();
});

it('DOCKER_HOST=tcp://...', () => {
  vi.stubEnv('DOCKER_HOST', 'tcp://localhost:2375');
  const adapter = new DockerAdapter();
  const modem = (adapter as unknown as { docker: { modem: { host: string; port: string } } }).docker.modem;
  expect(modem.host).toBe('localhost');
  expect(modem.port).toBe('2375');
});
```

`vi.stubEnv` は vitest 標準。`vi.unstubAllEnvs` で teardown。

### 8.5 完了条件

- 既存 38 件 + 新規 6 件 = **44 件**緑。**目標達成**。
- `CHANGELOG.md` の `[Unreleased]` に Added セクションで 1 行追記:
  ```markdown
  ### Added
  - Phase 7 test coverage: importImages 新シグネチャ、ComposeImporter 経路、Exporter 中断・再開シナリオ、`dmig:resumeExport` IPC integration、`validatePartialState` 境界、`DockerAdapter` の `DOCKER_HOST` 分岐の単体・統合テストを追加（19 → 44 件、+25 件）。
  ```

### 8.6 コミット

```
test(coverage): add validatePartialState edge cases and DockerAdapter env tests
```

CHANGELOG 追記は同コミットに含める。**最終 Step なのでタグ判断**（`v0.2.1-poc` PATCH / `v0.3.0-poc` MINOR）はマスターに確認。指示書側からはタグを打たない。

---

## 9. 実行順と中断ポイント

```
Step 0 (fixture)
  ↓
Step 1 (importImages)     ← Step 0 を初めて使う
  ↓
Step 2 (ComposeImporter)  ← 並行不可（fixture を Step 1 と共有確認）
  ↓
Step 3 (Exporter resume)  ← Step 2 と並行可だが順次推奨
  ↓
Step 4 (resumeExport IPC) ← ipcHarness 設計の独立性が高い、注意
  ↓
Step 5 (周辺カバレッジ + CHANGELOG)
```

**中断ポイント**: 各 Step 完了時に push までして区切る。理由は (a) コミット粒度を保つ、(b) 次セッション開始時に直前 Step の出力を読みやすい、(c) Phase 7 全体を 1 セッションで終わらせる必要は無い。

---

## 10. 各 Step のコミット粒度（再整理）

各 Step は **本体 1 コミット + 日記 1 コミット = 2 コミット**。Step 0 は単独日記を出さず、Step 1 の本体コミットに fixture も含めて 1 本にまとめる（5.7 参照）。

| Step | 本体コミット | 日記コミット |
|---|---|---|
| 0 + 1 | `test(importer): cover new importImages signature with 8 unit tests + fixtures` | `docs(diary): record commit hash for Phase 7 Step 1` |
| 2 | `test(compose-importer): cover OpenedPackageBase inline path with 3 tests` | `docs(diary): record commit hash for Phase 7 Step 2` |
| 3 | `test(exporter): cover interrupt-and-resume scenarios with 3 tests` | `docs(diary): record commit hash for Phase 7 Step 3` |
| 4 | `test(ipc): cover dmig:resumeExport with 5 integration tests via ipcHarness` | `docs(diary): record commit hash for Phase 7 Step 4` |
| 5 | `test(coverage): add validatePartialState edge cases and DockerAdapter env tests` | `docs(diary): record commit hash for Phase 7 Step 5` |

合計 10 コミット、5 push。

---

## 11. 開発日記テンプレート（各 Step 共通）

各 Step の本体コミット直後の日記エントリ:

```html
<section class="entry" id="entry-HHMM">
  <h2>Phase 7 Step N: 〈テーマ〉</h2>
  <div class="meta">
    <span class="date">YYYY-MM-DD HH:MM</span>
    <span class="tag tag-type">dev</span>
    <span class="tag tag-scope">tool</span>
    <span class="tag tag-ok">OK</span>
  </div>

  <h3>概要</h3>
  <p>...</p>

  <h3>変更ファイル</h3>
  <ul class="changes">
    <li><span class="op op-add">+</span> <code>...</code></li>
  </ul>

  <h3>検証</h3>
  <ul>
    <li><code>npm run typecheck</code> / <code>npm run lint</code> / <code>npm run test</code>（NN tests / 緑）/ <code>npm run build</code></li>
    <li>Commit: <code>pending</code></li>
  </ul>
</section>
```

目次にも対応する行を追加（`HH:MM`、`#entry-HHMM`）。

---

## 12. やってはいけないこと（全 Step 共通・再掲）

- **プロダクトコード（テストファイル以外）を改修する**。改修が必要な場面が出たら手を止めてマスターに報告。
- **既存テストの既存ケースを書き換える / 削除する**。Step 5 の追記のみ可。
- vitest 以外のテストフレームワーク、外部 mock ライブラリ、カバレッジツールの導入。
- E2E / Playwright / Electron 全起動テスト。
- **Step ごとの最終コミット前に `npm run test` を緑にしない**。Step 完了の条件はすべてのテストが通ること。
- IPC チャンネル名・引数型・戻り値型・進捗イベント形状の変更。
- 「ついで refactor」（`00-karpathy §3` Surgical Changes）。

---

## 13. 完了報告フォーマット（各 Step）

各 Step 完了時、次の項目を 1 メッセージで報告:

1. Step 番号と達成テスト総数（例: Step 1 完了、27 tests）
2. 変更ファイル（add/mod 別）
3. `typecheck` / `lint` / `test`（件数）/ `build` の結果
4. 本体コミット / 日記コミットのハッシュ
5. `origin/main` の先端ハッシュ
6. 次 Step に向けた懸念（あれば。無ければ「無し」）

最終 Step（Step 5）完了時は、これに加えて:

7. Phase 7 全体テスト数（19 → ?）
8. CHANGELOG 追記内容の引用
9. タグ打ち判断（`v0.2.1-poc` / `v0.3.0-poc` / 保留）をマスターに照会

---

## 14. PowerShell シェル注意

コミットメッセージは HEREDOC ではなく `-m` を 2 つ並べる:

```powershell
git commit -m "test(importer): cover new importImages signature with 8 unit tests" `
  -m "Step 1: ..."
```

backtick 行継続でも 1 行詰めでも可。HEREDOC は PowerShell では失敗する。

---

## 15. 次セッションへの引き継ぎ事項（チェックリスト）

次セッション開始時、最初に確認すべき:

- [ ] `git status` / `git log -1` で `main` の先端を確認。
- [ ] どの Step から着手するかをマスターに確認（Step 0/1 がデフォルト）。
- [ ] 直前 Step のテスト件数（`npm run test` の数字）を控えて、本指示書の「達成テスト総数」と整合しているか。
- [ ] Step 4 着手前に ipcHarness の方針を改めてマスター承認。
- [ ] Step 5 着手前に CHANGELOG の文言案を 1 度マスターに見せて承認。
- [ ] 最終 Step 完了後のタグ打ち判断はマスターに委ねる。指示書側からは打たない。
