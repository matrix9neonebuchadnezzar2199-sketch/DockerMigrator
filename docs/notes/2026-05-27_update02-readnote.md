# UPDATE-02 通読ノート（Main / shared / ipc）

**作成日**: 2026-05-27  
**目的**: フェーズ D（B-02 / B-10 / B-11 / B-27）着手前の前提確認。IPC シグネチャ変更は本 UPDATE では行わない。

---

## 1. ファイル責務サマリ

| ファイル | 責務 |
|----------|------|
| `shared/types.ts` | Renderer/Main 共有 DTO（ProgressEvent, manifest 1.1, Compose/Rollback/DryRun IPC 型） |
| `shared/codes.ts` | エラーコード定数 + 日本語メッセージ表 |
| `main/core/errors/DmigError.ts` | 例外 → `DmigErrorPayload` 変換 |
| `main/core/JobRegistry.ts` | `jobToken` → `AbortController` 登録・`cancel` で abort |
| `main/utils/progressIpc.ts` | `createProgressRelay`: invoke 中 `dmig:progress` を WebContents へ送信 |
| `main/core/ProgressTracker.ts` | 進捗イベントに bytesPerSec / ETA を付与 |
| `main/core/DockerAdapter.ts` | dockerode 薄ラッパ（ping/list/save/load/compose ラベル走査） |
| `main/core/Exporter.ts` | イメージパック書き出し・manifest 1.1 partialState・再開 |
| `main/core/ComposeExporter.ts` | Compose まるごと書き出し（tar/secret/volume/image 委譲） |
| `main/core/Importer.ts` | インポート（OpenedPackage 経由） |
| `main/core/ComposeImporter.ts` | Compose インポート |
| `main/core/RollbackManager.ts` | `rollback.json` 実行 |
| `main/core/ResumableScanner.ts` | 浅い走査で `ok_partial` パック列挙 |
| `main/core/dryRunNormalizers.ts` | ドライラン結果の正規化 |
| `main/core/diff/DiffEngine.ts` | スナップショット差分計算 |
| `main/ipc/*.ts` | ipcMain.handle 登録 + jobRegistry + progress relay |
| `preload/index.ts` | `DmigAPI` 型と contextBridge 公開 |
| `renderer/hooks/useDmigProgress.ts` | scope 別 `onProgress` 購読（mount 毎に listener 追加） |
| `renderer/hooks/useLogBuffer.tsx` | 全 progress をログ FIFO（`LOG_BUFFER_MAX=1000`） |
| `renderer/App.tsx` | `composeVisited` により ComposePage を hidden 常時マウント（B-02 対象） |

---

## 2. ジョブライフサイクル（jobRegistry）

1. Renderer が `crypto.randomUUID()` で `jobToken` を生成し、Cancellable 系 IPC に付与。
2. IPC handler 先頭で `jobRegistry.register(jobToken)` → `AbortSignal` を core に渡す。
3. ユーザー中止: `dmig:cancel(jobToken)` → `controller.abort()`。
4. Core は `signal.aborted` / `JOB_CANCELLED` で中断。manifest partialState 更新（Exporter/ComposeExporter）。
5. `finally` で `jobRegistry.unregister(jobToken)`。

**登録箇所**: `exportImages.ts`（export/resume）、`importImages.ts`、`compose.ts`（exportCompose/importCompose）、`snapshot.ts`（computeDiff 系）。

**未登録**: `listImages`、`probePackage`、`runRollback`（要確認）— `rollback.ts` を読むと runRollback は同期完了型で jobToken なしの可能性大。

---

## 3. 進捗イベント phase / scope

| scope | 主な phase | 発生源 |
|-------|------------|--------|
| `discover` | `discover` | listImages, listComposeProjects |
| `scan` | `discover` | probePackage, listResumablePackages |
| `snapshot` | `snapshot` | Snapshotter, DiffEngine |
| `transfer` | `save`/`compress`/`write`/`load`… | Exporter, Importer, ComposeExporter |
| `system` | `save` | compose lifecycle, prune |

Renderer: `useDmigProgress(scope)` が `matchesProgressScope` でフィルタ。`LogBufferProvider` は全件受信。

---

## 4. UPDATE-01 候補の Main 側補足

| ID | 通読結果 |
|----|----------|
| **B-20** | `resumeExport` IPC は `exportImages.ts` 内で Exporter.resume 経路。`JOB_CANCELLED` 時は partialState 残存＋Renderer は UPDATE-01 で cancel 分岐済み。Main が success を返す競合は **cancel 後に exporter が完了扱いする経路があれば** 再現—`Exporter.resume` 本体で abort チェックを要確認（UPDATE-03）。 |
| **B-27** | Renderer の構造問題が主因。`composeVisited` 時、ComposePage は hidden でもマウントされ、`useDmigProgress`×4 + 他ページ分の listener が共存。`flushSync` により非表示ページでも setState。 **B-02（アンマウント）で大幅緩和**。追加で Progress 購読のシングルトン化は UPDATE-03 候補。 |
| **B-10/B-31** | `useRollback` はコンポーネントローカル state。IPC `runRollback` は await 完了まで返るが、ページ遷移で UI state が `idle` に戻る → 二重実行リスク。 **RollbackJobContext で解消（D-2）**。 |
| **B-11** | jobRegistry は Main のみ。Renderer 側に「同種ジョブ二重開始」ガードなし。 **JobLockContext（D-3）** で export/import/resume/rollback のフラグ管理。 |
| **B-02** | `composeVisited` + `hidden` パネル。ComposePage 初回 mount で `refreshProjects` 実行。 **標準 conditional mount + ComposePageStateContext** で選択・outputDir・projects キャッシュを保持（D-1 方針）。 |

---

## 5. B-02 / B-10 / B-11 / B-27 前提検証

### B-02（Compose 常時マウント）

- **現状**: `App.tsx` L123–127 `composeVisited && hidden panel`。
- **副作用**: mount 時 `listComposeProjects`、diffMode 時 `listSnapshots`、各 hook が `onProgress` 登録。
- **D-1 方針**: `ComposePageStateContext` を新設し、タブ・outputDir・selected・projects キャッシュ等を Provider で保持。`page === 'compose'` のときのみ `<ComposePage />` をマウント。実行中は `JobLockContext` + Context 内 `phase`/`jobToken` を保持し復帰時に再表示。

### B-10 / B-31（Rollback 状態）

- **現状**: `RollbackPage` と `RollbackInlineSection` が別 `useRollback()` インスタンス。
- **D-2 方針**: `RollbackJobContext` に status/lastResult/error/wasAlreadyExecuted を集約。`useRollback` は Context 参照の薄ラッパー。

### B-11（多重起動）

- **現状**: 各ページが独立に `setRunning(true)` のみ。
- **D-3 方針**: `JobLockContext` で `export`/`import`/`resume`/`rollback` の4種ロック。`tryBegin(kind)` が false なら開始ボタン無視＋インラインメッセージ。Sidebar に「（実行中）」バッジ。遷移は許可。

### B-27（progress listener 重複）

- **再現条件**: compose を一度開く → 他ページで transfer 進捗発生 → hidden ComposePage の `useDmigProgress` が反応。
- **影響**: CPU/再レンダー浪費、非表示 Compose の progress state 更新。
- **UPDATE-02 対応**: **B-02 実装で解消見込み**（アンマウントで listener 解除）。単独修正は行わない。
- **判断**: B-27 は D-1 と同梱で完了扱い。スキップ明記は roadmap のみ。

---

## 6. D-4 B-27 実装可否

**結論**: 単独チケットとしては **実装しない**（B-02 で包含）。roadmap に「B-27: B-02 で緩和、Progress 集約は UPDATE-03」と記載。

---

## 7. D-1 設計選択メモ

| 案 | 採否 |
|----|------|
| App.tsx に compose state を lift | 却下（App が肥大化） |
| **ComposePageStateContext** | **採用** — Compose 専用 state を隔離、テスト容易 |

---

## 8. IPC 変更方針（本 UPDATE）

- 既存 handler の引数・戻り値は変更しない。
- 追加 API なし（Context は Renderer のみ）。

---

## 9. 通読未完了の follow-up（UPDATE-03）

- `Exporter.resume` の cancel 完了競合（B-20 確定）
- `runRollback` の jobToken 化の要否
- `Importer` / `OpenedPackage` の chunk 検証境界の UI 反映

---

## 11. B-20 再現マトリクス（UPDATE-03 フェーズ0）

**実施日**: 2026-05-27  
**テスト**: `dmig/src/main/ipc/exportImages.resume.cancel.test.ts`  
**エラーコード**: 指示書の `EXPORT_CANCELLED` は未使用。実装は `E6010` / `ErrorCodes.JOB_CANCELLED`。

| シナリオ | ok | partialState | progress 最終 | 判定 |
|---------|-----|--------------|---------------|------|
| 1 早期 cancel | false | `user-cancel`、pending 残存 | 完了系なし | **OK** |
| 2 チャンク中 cancel | false | `user-cancel`、imgB が pending に残る | 完了系なし | **OK** |
| 3 最終直後 cancel（本命） | **true** | **undefined**（完了扱い） | **taskId=done, 100%** | **P1** |
| 4 Compose volume cancel | false | `user-cancel` | 完了系なし | **OK** |
| 5 正常完了 | true | undefined | 完了系あり | **OK** |

### 分類結論

- **P0 確定なし**（`ok: true` かつ `partialState` がキャンセル扱い、または `ok: false` かつ完了 progress、の矛盾は観測されず）。
- **P1 確定（シナリオ3）**: 最後の pending チャンクについて `exportSingleImagePublic` 完了**後**に `AbortSignal` を立てても、`resumeImagePack` はループ内の manifest 更新・checksum・完了 progress・`ok: true` まで進む。ユーザーが「中止」した直後に UI が成功完了になるギャップ。
- **対応方針**: フェーズ1（Progress 集約）に進む。B-20 の P1 修正はフェーズ2-1（manifest 書き込み直前の `signal.aborted` チェック統一）で実施。

### シナリオ3 の再現手順（テスト内）

1. partial パック（pending は imgB のみ）。
2. `exportSingleImagePublic` モック内でエントリ返却直前に `jobRegistry.cancel(jobToken)`。
3. IPC は `ok: true`、`partialState` 消去、完了 progress 発火。
