# コードレビュー R-3 指示書 — `ipc.ts` のハンドラ分割（モジュール化）

**対象モデル**: Composer2
**作業日**: 2026-05-18（マスター承認後）
**前提コミット**: `5e6716d`（Phase 6 第3回 step 6 完了 + 日記ハッシュ反映済み）
**作業ブランチ**: `main` に直接コミット → push（既存運用どおり）

---

## 0. 背景

`dmig/src/main/ipc.ts` は **765 行 / 21 個の `ipcMain.handle` を抱える単一ファイル**になっており、Phase 6 第3回の機能追加（`probePackage` / `resumeExport`）で更に肥大化した。レビューでは以下が問題提起されている:

- **読みづらい**: ハンドラの責務（イメージ / Compose / スナップショット / 差分 / 報告書 等）が混在し、関連処理を grep 前提でしか辿れない。
- **テストしづらい**: ハンドラ単位で副作用（`new Exporter(...)` 等）を作っているため、後段でハンドラ単位の単体試験を入れる際に `registerIpcHandlers(win)` 全体を回す必要がある。
- **マージコンフリクト発生源**: 第4回以降の改修が全部この 1 ファイルに集中する。

本タスクは **ロジックを一切変えずに**、ハンドラを **責務別モジュール** に分割し、`registerIpcHandlers(win)` は登録のオーケストレータに専念させることをゴールとする。

**重要**: 本タスクは **R-3 単独**で扱う。R-1（Importer 二重読み 1 パス化）/ R-2（`DOCKER_HOST` 取り扱い）は別タスクで実施するため、本タスクでは **触らない**（後述 §5）。

---

## 1. 作業の Success Criteria

このタスクは以下が全て成立した時点で完了とする:

1. `dmig/src/main/ipc/` ディレクトリが新設され、責務別の登録モジュール（`registerImageHandlers` / `registerComposeHandlers` 等、§3.1 で固定）に分割されている。
2. `dmig/src/main/ipc.ts` は **オーケストレータのみ**になり、各モジュールを順に呼ぶ薄いファイルになっている（目安: **150 行以下**、ヘルパ含む。完全に空にする必要はない）。
3. **IPC チャンネル名・引数型・戻り値型・進捗イベント** は一切変わらない（preload `dmig/src/preload/index.ts` を変更しない）。
4. 既存テスト（`npm run test`）が**そのまま緑**。テストの追加・改変は本タスクでは行わない。
5. `npm run typecheck` / `npm run lint` / `npm run build` が緑。`build` 後の `out/main/index.js` のサイズが大きく増えていない（バンドル設定上、import 経路が増えるだけで実コードは同等のはず）。
6. 開発日記 `docs/2026-05-18_開発日記.html` に entry を追加（時刻は作業開始時の `Get-Date -Format HH:mm`、scope は `tool`、種別 `dev`）。
7. `main` ブランチに 2 コミット（本体 + 日記ハッシュ反映）で push 済み。

途中で疑義があれば手を止めてマスターに確認すること。

---

## 2. 触ってよいファイル / 触ってはいけないファイル

### 触ってよい

- `dmig/src/main/ipc.ts`（オーケストレータ化）
- `dmig/src/main/ipc/`（新規ディレクトリ。複数モジュールを作成）
- `docs/2026-05-18_開発日記.html`（追記のみ）

### 触ってはいけない

- 上記以外のソース（Importer / Exporter / DockerAdapter / 各 Page / preload / 共有型 等）
- テストファイル（`*.test.ts`）。本タスクは振る舞い不変なのでテスト改変は不要。
- 既存の **ハンドラ内ロジック**。コードを **そのまま移送する**だけにする。
- IPC チャンネル名（`dmig:export` 等）。**1 文字も変えない**。
- `registerIpcHandlers` の呼び出し側（`dmig/src/main/index.ts` 等）。

「ついで refactor」は禁止（`00-karpathy-guidelines §3` Surgical Changes）。下記アンチパターンは特に避ける:

- ハンドラ内で `try/catch` の書き方や `toPayload(e)` の使い方を「揃える」改修。
- ハンドラ内で使われている変数名のリネーム。
- `new Exporter(docker)` を `registerIpcHandlers` のスコープに移して使い回す等の**ライフサイクル変更**。

---

## 3. 分割方針（設計確定済み）

### 3.1 モジュール構成

`dmig/src/main/ipc/` 配下に以下を作る:

```
dmig/src/main/ipc/
├── shared.ts                  // toPayload, applyDeltaManifestInPlace, 共通型 import を集約
├── system.ts                  // ping, listImages, listVolumes, cancel, selectDirectory, pruneDanglingImages
├── exportImages.ts            // dmig:export, dmig:resumeExport
├── importImages.ts            // dmig:import, dmig:readManifest, dmig:probePackage
├── compose.ts                 // dmig:listComposeProjects, dmig:composeLifecycle, dmig:scanSecrets, dmig:exportCompose, dmig:importCompose
├── preflight.ts               // dmig:preflight, dmig:saveErrorReport
└── snapshot.ts                // dmig:listSnapshots, dmig:deleteSnapshot, dmig:computeDiff
```

各モジュールは次のシグネチャを公開:

```typescript
export function registerXxxHandlers(deps: HandlerDeps): void;
```

`HandlerDeps` は `dmig/src/main/ipc/shared.ts` に定義し、最低限以下を持つ:

```typescript
export interface HandlerDeps {
  win: BrowserWindow;
  docker: DockerAdapter;
}
```

`docker` は **`registerIpcHandlers` で 1 回だけ `new DockerAdapter()` し、各モジュールに渡す**。現状コードと同じく単一インスタンス共有を維持する。

### 3.2 ハンドラ → モジュール対応（厳密に守る）

| チャンネル | 移動先モジュール |
|---|---|
| `dmig:ping` | `system.ts` |
| `dmig:listImages` | `system.ts` |
| `dmig:listVolumes` | `system.ts` |
| `dmig:cancel` | `system.ts` |
| `dmig:selectDirectory` | `system.ts` |
| `dmig:pruneDanglingImages` | `system.ts` |
| `dmig:export` | `exportImages.ts` |
| `dmig:resumeExport` | `exportImages.ts` |
| `dmig:import` | `importImages.ts` |
| `dmig:readManifest` | `importImages.ts` |
| `dmig:probePackage` | `importImages.ts` |
| `dmig:listComposeProjects` | `compose.ts` |
| `dmig:composeLifecycle` | `compose.ts` |
| `dmig:scanSecrets` | `compose.ts` |
| `dmig:exportCompose` | `compose.ts` |
| `dmig:importCompose` | `compose.ts` |
| `dmig:preflight` | `preflight.ts` |
| `dmig:saveErrorReport` | `preflight.ts` |
| `dmig:listSnapshots` | `snapshot.ts` |
| `dmig:deleteSnapshot` | `snapshot.ts` |
| `dmig:computeDiff` | `snapshot.ts` |

`dmig:resumeExport` のように **Importer + Exporter + ComposeExporter を協調させる** ハンドラは、現状コードを **そのまま `exportImages.ts` に移送**する（Export 系の終端処理として扱う）。

### 3.3 共通ヘルパ

`dmig/src/main/ipc/shared.ts` には:

- `toPayload(e: unknown): DmigErrorPayload` — 現状 `ipc.ts` 末尾にあるものを移送。
- `applyDeltaManifestInPlace(...)` — Compose 系で使われている。Compose ハンドラからしか呼ばないため **`compose.ts` の内部関数** にしてもよい。判断: **`shared.ts` に置き、必要なモジュールから import** する（責務上「manifest 整形」は将来 import 系でも使う可能性あり）。
- 上記 2 関数のみ。新規ユーティリティの追加は禁止。

### 3.4 `ipc.ts` の最終形（目安）

```typescript
import { BrowserWindow } from 'electron';
import { DockerAdapter } from './core/DockerAdapter.js';
import { registerSystemHandlers } from './ipc/system.js';
import { registerImageExportHandlers } from './ipc/exportImages.js';
import { registerImageImportHandlers } from './ipc/importImages.js';
import { registerComposeHandlers } from './ipc/compose.js';
import { registerPreflightHandlers } from './ipc/preflight.js';
import { registerSnapshotHandlers } from './ipc/snapshot.js';

export function registerIpcHandlers(win: BrowserWindow) {
  const docker = new DockerAdapter();
  const deps = { win, docker };

  registerSystemHandlers(deps);
  registerImageExportHandlers(deps);
  registerImageImportHandlers(deps);
  registerComposeHandlers(deps);
  registerPreflightHandlers(deps);
  registerSnapshotHandlers(deps);
}
```

ヘルパ関数 / 補助型は **`ipc.ts` には残さない**（すべて `ipc/` 配下へ）。

---

## 4. 実行手順

1. `git status` / `git log -1` で `main` の先端が `5e6716d` であることを確認。
2. `dmig/src/main/ipc/` ディレクトリ作成。
3. `shared.ts` を作成し `toPayload` / `applyDeltaManifestInPlace` を移送（**コードは無変更で複写**）。
4. 各モジュール（`system.ts` / `exportImages.ts` / ...）を順に作成。各モジュールでは:
   - `registerXxxHandlers(deps: HandlerDeps): void` を export。
   - ハンドラ本体は **元コードを `ipcMain.handle(...) => {...}` のままコピー**。`win` / `docker` は `deps` から取り出す。
   - import 文は必要なものだけにする（不要 import が残らないように）。
5. `ipc.ts` を §3.4 のオーケストレータ形に置換。`toPayload` / `applyDeltaManifestInPlace` の **元の場所からは削除**（`shared.ts` に移ったため）。
6. `cd dmig && npm run typecheck && npm run lint && npm run test && npm run build` で緑を確認。
7. アプリ実起動の手検証は **不要**（IPC 表面は不変なため typecheck + 既存 19 テスト + build で十分）。マスターが「念のため」と言ったときのみ `npm run dev` を起動する。
8. 開発日記に entry 追加。`Commit: pending` で 1 本目をコミット。
9. push → コミットハッシュを日記に反映 → 2 本目をコミット → push。

---

## 5. やってはいけないこと（再掲・重要）

- ハンドラ内のロジックを **行単位で**改変する。コードは「切り取り→貼り付け」のみ。
- IPC チャンネル名や引数・戻り値の型を変える。
- `new DockerAdapter()` を複数回呼ぶ / モジュール毎に作る。**`registerIpcHandlers` の 1 回だけ**。
- `Importer` の二重読みを「ついで」に直す（R-1 で別タスク化）。
- `execFile('docker', ...)` の環境変数（`DOCKER_HOST`）対応を「ついで」に入れる（R-2 で別タスク化）。
- 共通エラー処理を抽象化する（`withErrorPayload(async () => {...})` 等のラッパ導入禁止。本タスクのスコープを超える）。
- テストファイルを編集する。
- preload / Renderer を編集する。

---

## 6. コミット粒度と push

### コミット 1: 本体

```
refactor(main): split ipc.ts into responsibility-scoped modules
```

本文（`-m` 第二引数で渡す）:

```
ipc.ts (765 行) を ipc/ 配下の責務別モジュール
(system / exportImages / importImages / compose / preflight / snapshot)
に分割。IPC チャンネル名・引数型・戻り値型・進捗イベントは不変。
ハンドラ内ロジックは無変更（行単位の切り出しのみ）。
toPayload と applyDeltaManifestInPlace は ipc/shared.ts に集約。
registerIpcHandlers は DockerAdapter を 1 回生成して各モジュールに
HandlerDeps として渡すオーケストレータに薄くした。
```

対象: `dmig/src/main/ipc.ts` / `dmig/src/main/ipc/*.ts`（新規）/ `docs/2026-05-18_開発日記.html`（pending 状態）

### コミット 2: 日記ハッシュ反映

```
docs(diary): record commit hash for ipc split refactor
```

対象: `docs/2026-05-18_開発日記.html` のみ。

push:

```powershell
git push origin main
```

---

## 7. 開発日記テンプレート

`docs/2026-05-18_開発日記.html` の **目次** `<tbody>` 末尾、`</tbody>` 直前に追加:

```html
      <tr>
        <td>HH:MM</td>
        <td>コードレビュー R-3: <code>ipc.ts</code> を <code>ipc/</code> 配下の責務別モジュールに分割（振る舞い不変）</td>
        <td><span class="tag tag-ok">OK</span></td>
        <td><a href="#entry-HHMM">詳細</a></td>
      </tr>
```

`</main>` 直前に追加:

```html
<section class="entry" id="entry-HHMM">
  <h2>コードレビュー R-3: <code>ipc.ts</code> のモジュール分割</h2>
  <div class="meta">
    <span class="date">2026-05-18 HH:MM</span>
    <span class="tag tag-type">dev</span>
    <span class="tag tag-scope">tool</span>
    <span class="tag tag-ok">OK</span>
  </div>

  <h3>概要</h3>
  <p><code>dmig/src/main/ipc.ts</code>（765 行・21 ハンドラ）を <code>ipc/</code> 配下の責務別モジュール（<code>system</code> / <code>exportImages</code> / <code>importImages</code> / <code>compose</code> / <code>preflight</code> / <code>snapshot</code>）に分割した。IPC チャンネル名・引数型・戻り値型・進捗イベントは一切変更していない。<code>registerIpcHandlers</code> は <code>DockerAdapter</code> を 1 回だけ生成し <code>HandlerDeps</code> として各モジュールに渡すオーケストレータに薄くした。共通ヘルパ <code>toPayload</code> / <code>applyDeltaManifestInPlace</code> は <code>ipc/shared.ts</code> に集約。</p>

  <h3>変更ファイル</h3>
  <ul class="changes">
    <li><span class="op op-add">+</span> <code>dmig/src/main/ipc/shared.ts</code></li>
    <li><span class="op op-add">+</span> <code>dmig/src/main/ipc/system.ts</code></li>
    <li><span class="op op-add">+</span> <code>dmig/src/main/ipc/exportImages.ts</code></li>
    <li><span class="op op-add">+</span> <code>dmig/src/main/ipc/importImages.ts</code></li>
    <li><span class="op op-add">+</span> <code>dmig/src/main/ipc/compose.ts</code></li>
    <li><span class="op op-add">+</span> <code>dmig/src/main/ipc/preflight.ts</code></li>
    <li><span class="op op-add">+</span> <code>dmig/src/main/ipc/snapshot.ts</code></li>
    <li><span class="op op-mod">~</span> <code>dmig/src/main/ipc.ts</code></li>
    <li><span class="op op-mod">~</span> <code>docs/2026-05-18_開発日記.html</code></li>
  </ul>

  <h3>設計判断</h3>
  <p>「ついで refactor」を排除するため、ハンドラ本体は <strong>行単位の切り出し</strong>のみとし、<code>try/catch</code> の整形・変数名統一・共通ラッパ導入は本タスクでは行わなかった。<code>DockerAdapter</code> のライフサイクル（<code>registerIpcHandlers</code> 1 回生成）も既存維持。R-1（Importer 1 パス化）と R-2（<code>DOCKER_HOST</code> 取り扱い）は別タスクで実施する。</p>

  <h3>検証</h3>
  <ul>
    <li><code>npm run typecheck</code> / <code>npm run lint</code> / <code>npm run test</code>（19 tests / 緑）/ <code>npm run build</code></li>
    <li>Commit: pending</li>
  </ul>
</section>
```

---

## 8. 完了報告フォーマット

作業完了時、次の項目を 1 メッセージで報告すること:

1. 作成・変更ファイル（add/mod 別）
2. `typecheck` / `lint` / `test`（テスト件数）/ `build` の結果
3. コミット 1 / コミット 2 のハッシュ
4. `origin/main` の先端ハッシュ
5. 残課題（無ければ「無し」）

---

## 9. PowerShell シェル注意

コミットメッセージは **HEREDOC ではなく `-m` を 2 つ並べる**:

```powershell
git commit -m "refactor(main): split ipc.ts into responsibility-scoped modules" `
  -m "ipc.ts (765 行) を ipc/ 配下の責務別モジュール ... (本文)"
```

backtick 行継続でも 1 行詰めでも可。HEREDOC は PowerShell では失敗する。
