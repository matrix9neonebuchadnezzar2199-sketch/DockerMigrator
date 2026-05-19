# M9 ドライラン UI 指示書

**ファイル**: `docs/instructions/m9-dryrun-ui-instructions.md`  
**ベースコミット**: `601edfa`  
**スコープ**: Validator / preflight 統合 UI（Phase 6 §A 対応）

## §0 前提

- M8 完了済み、テスト 112 passed / 1 skipped。
- バックエンドの Validator / preflight 実装は「一部あり」とロードマップ記載。具体的なエントリポイントは Step 1 調査で確定する。
- ドライラン UI は未着手。独立ページ + 各作業ページ内ボタンのハイブリッド配置（C3）。
- 仕様書 §12 は M8 で §12.11 まで使用済み、M9 は §12.12 を割り当て。
- ベースライン確認: `npm run typecheck && npm run build` がエラー 0 であること。

## §1 スコープ

**In scope**

- バックエンド既存 Validator / preflight の実装調査（Step 1）
- 新 IPC `dmig:runDryRun` 統合ハンドラ（F2、調査結果次第で F1 にダウングレード可）
- 独立ページ `PageKey: 'dryrun'` をサイドバー共通グループに追加
- Compose ページ / Export ページに「ドライラン実行」ボタンを追加
- 結果表示: フラットリスト（重大度バッジ + メッセージ + 該当項目）+ レベルフィルタ + テキスト検索 + TSV コピー
- 検証対象は Compose プロジェクト単位（preflight）と Export 対象パック単位（書き出し前検証）の両方
- glossary `RELATED_PAGE_LABELS` に `dryrun` を追加
- 仕様書 §12.12、CHANGELOG `[Unreleased]`、ロードマップ M9 ステータス、開発日記エントリ

**Out of scope**

- 自動修正（E1: 検出のみ、M12 で再検討）
- 手動チェックリスト（同上）
- ドライラン結果の永続化（M12 運用拡張）
- カテゴリ別タブ / ツリー表示（D1 フラット採用）
- Lucide アイコン置換（M13 で一括）

## §2 ファイル一覧

**新規**

- `dmig/src/renderer/pages/DryRunPage.tsx` — 独立ページ
- `dmig/src/renderer/pages/DryRunPage.test.tsx` — テスト 5‑7 件
- `dmig/src/renderer/components/DryRunResultList.tsx` — 結果表示コンポーネント（独立ページ / 作業ページ内ボタン共用）
- `dmig/src/renderer/components/DryRunResultList.test.tsx` — テスト 3‑4 件
- `dmig/src/renderer/hooks/useDryRun.ts` — IPC 呼び出しと状態管理
- `dmig/src/renderer/hooks/useDryRun.test.ts` — テスト 2‑3 件
- `dmig/src/main/ipc/dryRun.ts` — 統合ハンドラ（F2 採用時。F1 の場合は既存ハンドラ流用で本ファイルは不要）
- `dmig/src/main/ipc/dryRun.test.ts` — テスト 2‑3 件
- `dmig/src/shared/types.ts` への型追記（`DryRunRequest`, `DryRunResult`, `DryRunFinding`）

**変更**

- `dmig/src/renderer/App.tsx` — `PageKey` に `'dryrun'` 追加、ルーティング
- `dmig/src/renderer/components/Sidebar.tsx` — 共通グループに「ドライラン」項目追加（HelpPage / LogsPage の近傍）
- `dmig/src/renderer/components/Sidebar.test.tsx` — クリックテスト +1
- `dmig/src/renderer/pages/ComposePage.tsx` — 「ドライラン実行」ボタン + 結果セクション
- `dmig/src/renderer/pages/ExportPage.tsx` — 同上
- `dmig/src/renderer/data/glossary.ts` — `RELATED_PAGE_LABELS` に `dryrun: 'ドライラン'` 追加
- `dmig/src/renderer/styles.css` — `.dryrun-*` クラス
- `dmig/src/preload/index.ts` — `runDryRun` API 公開
- `dmig/src/main/index.ts` — `registerDryRunIpc()` 呼び出し（F2 採用時）
- `CHANGELOG.md` — `[Unreleased]` Added
- `仕様書.txt` — §12.12 追加
- `docs/milestones/M6-M13-roadmap.md` — M9 ステータス更新
- `docs/2026-05-XX_開発日記.html` — `#entry-XXXX`

## §3 手順

### Step 1: バックエンド調査

1. `dmig/src/main/core/` を `grep -ri "validator\|preflight\|dryRun\|drySpace\|capacity"` で検索し、既存 Validator / preflight 実装を特定。
2. 既存 IPC ハンドラを `dmig/src/main/ipc/` でリストアップ、戻り値の型を `shared/types.ts` から確認。
3. 調査結果サマリを **指示書 Step 1 完了報告として共有**:
   - 既存 Validator のエントリポイント（関数名 / ファイルパス）
   - 既存 IPC ハンドラの本数と戻り値構造
   - F2（新規統合 IPC）/ F1（既存流用）どちらが適切か判断材料
4. F1 適用が妥当と判断した場合は Step 4 を「既存 IPC を `useDryRun` から呼ぶだけ」に縮約。F2 のままなら Step 4 で新規ハンドラを実装。

**Step 1 完了時点でマスター承認を取得** してから Step 2 以降に進む。

#### Step 1 調査結果（2026-05-19）

| 区分 | エントリポイント | IPC / 型 |
|------|------------------|----------|
| 容量・サイズ推定 | `SizeEstimator` (`core/SizeEstimator.ts`) + `SpaceChecker` (`core/SpaceChecker.ts`) | `dmig:preflight` → `PreflightRequest` / `PreflightResult` (`ipc/preflight.ts`) |
| シークレット | `SecretScanner` (`core/SecretScanner.ts`) | `dmig:scanSecrets` → `Record<string, SecretScanResult[]>` (`ipc/compose.ts`) |
| パッケージ検証 | `Importer.probe` | `dmig:probePackage` → `ProbeSummary` (`ipc/importImages.ts`) |
| bind mount | エクスポート時 `bindMountChoices` のみ（事前自動検査 API なし） | — |
| `Validator` クラス | **存在しない** | — |

**F1/F2 推奨**: **F2** — `dmig:runDryRun` で上記を順次呼び `DryRunFinding[]` に正規化。Renderer から 3 IPC を直列呼び出しする F1 は UX・テスト・カテゴリ統合が不利。

### Step 2: 型定義

`shared/types.ts` に以下を追加:

```ts
export type DryRunSeverity = 'info' | 'warn' | 'error';

export interface DryRunFinding {
  id: string;
  severity: DryRunSeverity;
  category: string;
  message: string;
  target?: string;
  hint?: string;
}

export type DryRunMode = 'compose-project' | 'export-pack';

export interface DryRunRequest {
  mode: DryRunMode;
  projectDir?: string;
  packageDir?: string;
}

export interface DryRunResult {
  findings: DryRunFinding[];
  startedAt: string;
  finishedAt: string;
  warnings: string[];
}
```

### Step 3: useDryRun フック

- 状態: `{ status: 'idle' | 'running' | 'done' | 'error', result: DryRunResult | null, error: string | null }`
- API: `run(request: DryRunRequest)`, `reset()`
- テスト: idle → running → done 遷移、error 遷移、reset 動作。

### Step 4: IPC 実装（F2 採用時）

- `dmig/src/main/ipc/dryRun.ts` に `registerDryRunIpc()` を実装。
- `mode === 'compose-project'`: 既存 preflight 系ハンドラを順次呼び、結果を `DryRunFinding[]` に正規化。
- `mode === 'export-pack'`: 既存 Validator 系ハンドラを呼び、同様に正規化。
- 既存ハンドラがエラー型を返す場合、`severity: 'error'` で findings に追加。
- タイムアウト・例外は `warnings` 配列に格納。
- テスト: モック Validator で findings 生成、エラーパス、タイムアウト警告。

F1 採用時は本 Step を「既存 IPC のラッパー関数を Renderer 側 hook 内に書く」に置換。

### Step 5: DryRunResultList コンポーネント

- props: `findings: DryRunFinding[]`, `warnings: string[]`
- 上部: レベルフィルタ（info / warn / error チェックボックス）+ 検索ボックス + TSV コピーボタン
- 行表示: `[重大度バッジ] [カテゴリ] target — message`、`hint` がある行は折りたたみ可能
- 空結果時: 「検出された問題はありません」表示
- ARIA: `role="list"`, 各行 `role="listitem"`
- LogsPage と同じ UX パターンを流用、CSS クラス命名のみ変更（`.dryrun-finding-*`）
- テスト: 重大度フィルタ、検索、空結果、TSV コピー。

### Step 6: DryRunPage 実装

- 上部: モード選択（Compose プロジェクト / Export パック）+ 対象ディレクトリ選択 + 「実行」ボタン
- 中部: `useDryRun` の status に応じた表示（実行中スピナー、エラーメッセージ、結果）
- 下部: `DryRunResultList` で findings 表示
- 結果が出たら StaticPageGuides 形式の補足説明（次のアクション案内）
- テスト: モード切替、対象選択、実行成功、実行エラー、空結果。

### Step 7: ComposePage / ExportPage への組み込み

- 各ページの作業エリア下部に「ドライラン実行」セクションを追加。
- ボタンクリックで `useDryRun.run({ mode, projectDir/packageDir })` を呼び、`DryRunResultList` を同セクション内に表示。
- 結果が `severity: 'error'` を含む場合は、ページ本体の主要アクション（エクスポート / プロジェクト確定）ボタンに視覚的警告（ツールチップ「ドライランでエラー検出。確認してください」）を表示。**ブロックはしない**（E1 検出のみ方針）。
- テスト: ボタンクリックで `useDryRun.run` が呼ばれること、結果表示、エラー時の警告ツールチップ。

### Step 8: サイドバー / ルーティング / Glossary

- `Sidebar.tsx` 共通グループに「ドライラン」項目を追加（順序: 概要 / ログ / **ドライラン** / ヘルプ）。
- `App.tsx` `PageKey` に `'dryrun'` 追加。
- `glossary.ts` `RELATED_PAGE_LABELS` に `dryrun: 'ドライラン'` 追加。

### Step 9: ドキュメント更新

- `仕様書.txt` §12.12「ドライラン UI」追加: 配置、モード、結果表示、検出のみ方針、警告ツールチップ。
- `CHANGELOG.md` `[Unreleased]` Added に 1‑2 行。
- `docs/milestones/M6-M13-roadmap.md` M9 ステータスを「完了（pending SHA）」に更新、D-009 対応行にチェック。
- 開発日記 `#entry-XXXX` 追加、SHA は最終コミットで補正。

### Step 10: 検証

1. `npm run typecheck` — エラー 0。
2. `npm run lint` — エラー・警告 0。
3. `npm run test` — 全件 pass、件数増加（112 → 約 122‑127）。
4. `npm run build` — 成功。
5. `npm run dev` 手動確認:
   - サイドバー共通「ドライラン」を開ける。
   - Compose プロジェクトモードで対象ディレクトリ選択 → 実行 → 結果表示。
   - Export パックモードで同様。
   - ComposePage / ExportPage 内のドライランボタンが動作し、エラー検出時に主要アクションに警告ツールチップ。
   - フィルタ / 検索 / TSV コピーが動作。
   - 結果が空のケースで「検出された問題はありません」表示。

## §4 完了条件

1. Step 1 調査結果がマスター承認済み（F1/F2 確定）。
2. `DryRunPage` がサイドバー共通グループから開け、両モードで動作する。
3. ComposePage / ExportPage 内ボタンが動作し、結果が同ページに表示される。
4. エラー検出時に主要アクションへ警告ツールチップが出るが、ブロックはしない。
5. レベルフィルタ・検索・TSV コピー・空結果表示が動作。
6. typecheck / lint / test / build がエラー 0。
7. テスト件数が 112 → 約 122‑127 に増加。
8. 仕様書 §12.12、ロードマップ M9、CHANGELOG、開発日記が更新済み。
9. 5‑6 本のコミットで `main` に push 済み。

## §5 コミット計画（5 本構成、SHA 補正含めると 6 本）

1. `docs: add Phase M9 dry-run UI instructions`
2. `feat(main): add dryRun IPC handler integrating validator and preflight`（F1 時は削除し Renderer に統合）
3. `feat(ui): add DryRunPage, hook, and result list`
4. `feat(ui): integrate dry-run button into Compose and Export pages`
5. `docs: complete M9 dry-run UI`
6. （必要なら）`docs(diary): set M9 commit SHAs in entry-XXXX`

## §6 補足

- Step 1 調査結果次第で Step 2 以降が変動する点が M9 の最大の不確実性。
- バインドマウントやシークレット検出が既存 Validator にあるなら、findings の `category` に正しくマッピングするのが UX 改善の要点。
- 結果 100 件超は PoC では仮想スクロールなし（M13 検討）。
- TSV: `severity\tcategory\ttarget\tmessage\thint`
- ComposePage / ExportPage 内の結果はページ遷移で破棄（M12 で永続化検討）。
