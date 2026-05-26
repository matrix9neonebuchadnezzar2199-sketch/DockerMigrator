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
- **対応方針**: フェーズ1（Progress 集約）に進む。B-20 P1 の UX 修正方針は **§12**（機械的な abort 3 点統一は採用しない）。

### シナリオ3 の再現手順（テスト内）

1. partial パック（pending は imgB のみ）。
2. `exportSingleImagePublic` モック内でエントリ返却直前に `jobRegistry.cancel(jobToken)`。
3. IPC は `ok: true`、`partialState` 消去、完了 progress 発火。

---

## 10. Progress 集約設計（UPDATE-03 フェーズ1）

**目的**: `window.dmig.onProgress` の Renderer 購読を 1 箇所に集約し、B-27 の構造解決を完了する（UPDATE-02 のページアンマウントは前提改善済み）。

### 現状の購読箇所（変更前）

| 箇所 | 購読方法 | scope |
|------|----------|-------|
| `useDmigProgress` | `onProgress` 直接 + `flushSync` | 引数 scope でフィルタ |
| `LogBufferProvider` | `onProgress` 直接 | 全件 |
| 呼び出し元 | Export / Import / Compose / Resume / `useResumeFlow` / `useDiffPreview` | 各 hook インスタンス |

Main: `createProgressRelay` → `webContents.send('dmig:progress')` → preload `ipcRenderer.on` → 各 Renderer listener（N 本）。

### 変更後

| 層 | 責務 |
|----|------|
| `ProgressBusProvider` | `onProgress` を **1 回だけ**購読。`applyProgressScope` 後に購読者へ fan-out。`flushSync` は **ここだけ**。 |
| `useProgressBus().subscribe(scope?, listener)` | scope フィルタ付き登録。unsubscribe は返却関数。 |
| `useDmigProgress` | Bus 経由。API 不変。hook 内 `flushSync` 削除。 |
| `LogBufferProvider` | Bus 経由（scope 未指定 = 全件）。 |

### Provider 階層（App.tsx）

```
ErrorBoundary
  ProgressBusProvider          ← 新規（最外 Renderer 状態）
    LogBufferProvider          ← Bus 購読（全 scope）
      JobLockProvider
        RollbackJobProvider
          ComposePageStateProvider
            DynamicCtaProvider
              …pages…
```

理由: LogBuffer は全 progress を記録するため Bus の子でよい。JobLock 等は progress に非依存。

### 移行手順（フェーズ1）

1. `shared/types.ts` で `ProgressPhase` / `ProgressScope` / `ProgressEvent` を整理（§12 案B の optional を型に先行追加）。
2. `ProgressBusContext` 実装 + 単体テスト。
3. `useDmigProgress` を Bus 経由に差し替え（呼び出し側無変更）。
4. `LogBufferProvider` を Bus 経由に差し替え。
5. `App.tsx` に Provider 追加。`npm test` / 手動スモーク。

### 破壊範囲見積もり

- **変更**: `useDmigProgress.ts`, `useLogBuffer.tsx`, `App.tsx`, `types.ts`, 新規 Context + test。
- **不変**: 各 Page、`OperationProgress`、Main `createProgressRelay` / Exporter emit。
- **テスト**: `ProgressBusContext.test.tsx` 追加。既存 Renderer/Main テストは mock `onProgress` のまま動作。

---

## 12. B-20 P1 修正方針（フェーズ2-1 用・フェーズ1-2 で型先行）

### 問題の整理

シナリオ3: 最終チャンク I/O 完了**後**の cancel では、実体は成功（manifest/checksum 整合）だが UI は「中止したのに完了」に見える。

**採用しない**: manifest 直前で無条件 `abort` → `ok: false`（実体成功と IPC 失敗の乖離、resume 時の pending 判断が困難）。

### Progress 完了イベントの表現案

| 案 | 内容 | フェーズ1-2 型 | フェーズ2-1 Main |
|----|------|----------------|------------------|
| **A** | キャンセル要求後は完了 progress を出さない | 単純だがシナリオ3で「無音完了」 | emit 抑制 |
| **B** | 完了 progress に `cancelRequested?: boolean` | **採用**（optional、既存互換） | `taskId=done` 時にフラグ付与 |
| **C** | `taskId: 'done' \| 'done-after-cancel'` | union 拡張が大きい | taskId 分岐 |

**決定: 案B**

- フェーズ1-2: `ProgressEvent` に `cancelRequested?: boolean` を追加（Main はフェーズ2-1 まで未送信でよい）。
- フェーズ2-1: `resumeImagePack` / `resumeComposePack` の完了 emit 直前に `signal.aborted` を読み、true なら `cancelRequested: true` を付与。IPC は現状どおり `ok: true`（データ層は成功のまま）。
- Renderer: `useDoneProgressNotice` + `useResumeFlow` で完了メッセージを差し替え（**実装済み** §13）。

### フェーズ2-1 実装メモ（2026-05-27）

- Main: ループ完了後 `signal.aborted` → 完了 progress に `cancelRequested: true`（`Exporter.resumeImagePack` / `ComposeExporter.resumeComposePack`）。
- Renderer 文言: `RESUME_LATE_CANCEL_SUCCESS_MESSAGE`（`useDoneProgressNotice.ts`）。

---

## 13. Importer エラー UI（UPDATE-03 フェーズ2-3 判断）

**調査結果（30 分以内）**

| 項目 | 結果 |
|------|------|
| `ipc/importImages.ts` の `toPayload` | `DmigError.toPayload()` 経由で **code / message / detail 保持** |
| ImportPage | 異常系は主に `probePackage` → `ProbeSummary.status` + `ProbeErrorPanel`（コード列挙ではない） |
| `open` / `import` 時の `MANIFEST_PARTIAL_INVALID` 等 | `ErrorBox` 経由（コードは表示されるが専用文言なし） |

**判断: UPDATE-04 に送る**

理由: 専用 UI 改善は `ProbeErrorPanel` 拡張 + `ErrorBox` のコード別文言表 + テストが必要で、1 日以内の小タスクに収まりにくい。IPC 層の欠落はない。

案A はユーザーに「止まったか成功したか」が分かりにくい。案C は `taskId` が動的（イメージ名）と混在し型が複雑化する。

### フェーズ2-1 の受け入れ条件（予定）

- シナリオ3 再実行時: `ok: true` のまま、最終 progress に `cancelRequested: true`。
- シナリオ1/2/4: 完了 progress なし、または `cancelRequested` 未設定。
- シナリオ5: 通常完了、`cancelRequested` なし。

---

## 14. UPDATE-03 手動スモーク状況（UPDATE-04 フェーズ0）

**記録日**: 2026-05-26  
**パターン**: **C（スモーク未実施）**

### 根拠

- 開発日記 `docs/2026-05-27_開発日記.html` UPDATE-03 エントリ: 手動 Docker スモークは全シナリオ「未実施」、正本 `docs/testing/smoke-checklist.html` はマスター環境確認待ち。
- Agent は Docker + Electron 実機スモークを実行できない。

### 運用

- UPDATE-04 本体（フェーズ1–2）は着手可。
- **フェーズ3 完了前**にマスターが手動スモークを実施し、結果を本 §14 に追記（パターン A/B へ更新）。
- NG 時は Reserved smoke-fix（フェーズ0-2）を実施してからフェーズ3 続行。

### フェーズ1 対象コード確認（1-6）

| コード | 経路 | ImportPage の ErrorBox |
|--------|------|------------------------|
| E2075 `MANIFEST_PARTIAL_INVALID` | `Importer.validatePartialState`、open/resume IPC | Resume 経路・不正 partial パック open で `toPayload` → ErrorBox |
| E2071 `NOT_A_PARTIAL_PACKAGE` | `Importer` 完了パックへの resume | Resume ページ中心。Import の通常 import では稀 |
| E8001 `CHECKSUM_MISMATCH` | `Importer.verifyChecksum`（import 読み込み時） | import 失敗時に ErrorBox 表示可。**§13 + 実装確認済みのため E8001 も有効化** |

`probePackage` の `version_incompatible` 等は **ProbeErrorPanel** 経路（今回対象外）。
