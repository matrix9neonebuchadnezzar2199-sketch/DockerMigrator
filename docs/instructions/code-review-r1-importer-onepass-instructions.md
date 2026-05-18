# コードレビュー R-1 指示書 — Importer の manifest 二重読み 1 パス化

**対象モデル**: Composer2
**作業日**: 2026-05-18（マスター承認後）
**前提コミット**: `6ed609c`（R-3 IPC 分割の日記ハッシュ反映済み。`main` の先端）
**作業ブランチ**: `main` に直接コミット → push（既存運用どおり）

---

## 0. 背景

R-3（`ipc.ts` の責務別分割）でレビュー指摘 3 件のうち IPC の構造問題は解消したが、**Importer 自身の入口の重複**は残っている。

`dmig/src/main/core/Importer.ts` で `manifest.json` を `fs.readFile` + `JSON.parse` する経路が **3 つ並立**している:

| 経路 | 利用元 |
|---|---|
| `readManifest(packageDir)` | `dmig:readManifest` IPC ハンドラ |
| `probe(packageDir)` 内部の `readManifest` | `dmig:probePackage` IPC ハンドラ |
| `importImages(req)` 冒頭の `readManifest` | `dmig:import` IPC ハンドラ、`ComposeImporter.importProjects` |

第3回で `openAsBase` / `openForResume` が導入され「`OpenedPackage` 中心の入口」が既に確立されているのに、**`importImages` だけが旧 API（生 `packageDir` を受けて自分で読む）のまま放置**されている。結果、

- 同一 IPC 呼び出し（`dmig:import`）の中で manifest が **無駄に 2 回 parse される**（ハンドラ側で `openAsBase` を呼べば 1 回で済む）。
- 完了 / 中断 / 異常の判定責務が `importImages` と `openAsBase` の両方に重複している。

本タスクは **`Importer.importImages` を `OpenedPackageBase` を受け取る形に書き換え**、Main 側で「1 IPC 呼び出し = 1 回 manifest 読み」を保証することをゴールとする。

**重要**: 本タスクは **R-1 単独**で扱う。R-2（`DOCKER_HOST` 取り扱い）は別タスクで実施するため、本タスクでは **触らない**（後述 §5）。

---

## 1. 作業の Success Criteria

このタスクは以下が全て成立した時点で完了とする:

1. `Importer.importImages` のシグネチャが次の形になっている:
   ```typescript
   async importImages(opened: OpenedPackageBase, selectedImages: string[], signal?: AbortSignal): Promise<void>
   ```
2. 旧シグネチャ（`importImages(req: ImportRequest, signal?)`）は **存在しない**（オーバーロードによる残置も不可）。
3. `importImages` の内部から `readManifest` 呼び出しが消えている（`opened.manifest` を直接参照する）。
4. **IPC チャンネル名・引数型・戻り値型・進捗イベント** は一切変わらない。`@shared/types.ts` の `ImportRequest` の構造も不変。
5. preload (`dmig/src/preload/index.ts`) と Renderer は **1 行も変更しない**。
6. 既存テスト（`npm run test` で 19 件、3 ファイル）が**そのまま緑**。テストの追加・改変は本タスクでは行わない。
7. `npm run typecheck` / `npm run lint` / `npm run build` が緑。
8. 開発日記 `docs/2026-05-18_開発日記.html` に entry を追加（時刻は作業開始時の `Get-Date -Format HH:mm`、scope は `tool`、種別 `dev`）。
9. `main` ブランチに 2 コミット（本体 + 日記ハッシュ反映）で push 済み。

途中で疑義があれば手を止めてマスターに確認すること。

---

## 2. 触ってよいファイル / 触ってはいけないファイル

### 触ってよい

- `dmig/src/main/core/Importer.ts`（`importImages` のシグネチャと冒頭処理）
- `dmig/src/main/ipc/importImages.ts`（`dmig:import` ハンドラの呼び方）
- `dmig/src/main/core/ComposeImporter.ts`（`importImages` 呼び出しの 1 箇所）
- `docs/2026-05-18_開発日記.html`（追記のみ）

### 触ってはいけない

- `@shared/types.ts`（`ImportRequest` 型は不変）
- `dmig/src/preload/index.ts`
- Renderer（`dmig/src/renderer/**`）
- `dmig/src/main/core/importer/OpenedPackage.ts`（型定義は不変）
- `Importer.openAsBase` / `openForResume` / `probe` / `readManifest` / `validatePartialState` 等の **他メソッド**
- テストファイル（`*.test.ts`）。本タスクは振る舞い不変なのでテスト改変は不要。
- IPC チャンネル名（`dmig:import` 等）。**1 文字も変えない**。

「ついで refactor」は禁止（`00-karpathy-guidelines §3` Surgical Changes）。下記アンチパターンは特に避ける:

- `importImages` 内部のループ・進捗イベント形状を「揃える」改修。
- 変数名（`targets` / `entry` / `rel` / `filepath` 等）のリネーム。
- `verifyChecksum` / `loadOne` の挙動変更。
- `ImportRequest` を `OpenedPackageBase` に置換する preload / Renderer 連鎖変更（明確にスコープ外）。

---

## 3. 変更方針（設計確定済み）

### 3.1 `Importer.importImages` のシグネチャ

**変更前**:
```typescript
async importImages(req: ImportRequest, signal?: AbortSignal): Promise<void> {
  const manifest = await this.readManifest(req.packageDir);
  const targets = manifest.contents.images.filter((e) => req.selectedImages.includes(e.name));
  // ...
}
```

**変更後**:
```typescript
async importImages(
  opened: OpenedPackageBase,
  selectedImages: string[],
  signal?: AbortSignal,
): Promise<void> {
  const manifest = opened.manifest;
  const targets = manifest.contents.images.filter((e) => selectedImages.includes(e.name));
  // 以降は req.packageDir → opened.packageDir に機械的置換するだけ。
}
```

**機械的置換ルール**:
- `req.packageDir` → `opened.packageDir`
- `req.selectedImages` → `selectedImages`（引数）
- `await this.readManifest(req.packageDir)` の行は **削除**
- それ以外のロジック・ループ構造・進捗イベントの中身は **1 文字も変えない**

### 3.2 `dmig:import` ハンドラの修正（`ipc/importImages.ts`）

**変更前**:
```typescript
ipcMain.handle('dmig:import', async (_e, req: ImportRequest) => {
  const controller = jobRegistry.register(req.jobToken);
  const importer = new Importer(docker);
  // ...
  try {
    await importer.importImages(req, controller.signal);
    // ...
```

**変更後**:
```typescript
ipcMain.handle('dmig:import', async (_e, req: ImportRequest) => {
  const controller = jobRegistry.register(req.jobToken);
  const importer = new Importer(docker);
  const tracker = new ProgressTracker();
  const onProg = (ev: ProgressEvent) => {
    win.webContents.send('dmig:progress', tracker.enrich(ev));
  };
  importer.on('progress', onProg);
  try {
    const opened = await importer.openAsBase(req.packageDir);
    await importer.importImages(opened, req.selectedImages, controller.signal);
    return { ok: true as const, data: undefined };
  } catch (e) {
    return { ok: false as const, error: toPayload(e) };
  } finally {
    importer.off('progress', onProg);
    jobRegistry.unregister(req.jobToken);
  }
});
```

**ポイント**:
- `openAsBase` は **`try` ブロックの内側**で呼ぶ。例外が `try/catch` に拾われ `toPayload(e)` で正規化される（`E2070` 中断 package、`E2075` 不正 partial 等を含む）。
- `controller` の `register` / `unregister`、`importer.on/off`、`tracker` の流れは **既存どおり**。
- `dmig:readManifest` / `dmig:probePackage` ハンドラは **触らない**。

### 3.3 `ComposeImporter` 内部の呼び出し修正

`dmig/src/main/core/ComposeImporter.ts` L87-93 の `imageImporter.importImages(...)` 呼び出しを新シグネチャに合わせる。

**変更前**:
```typescript
if (allImages.size > 0) {
  await this.imageImporter.importImages(
    {
      packageDir: req.packageDir,
      selectedImages: [...allImages],
    },
    signal,
  );
}
```

**変更後**:
```typescript
if (allImages.size > 0) {
  const opened: OpenedPackageBase = {
    mode: 'base',
    packageDir: req.packageDir,
    manifest: dmigManifest,
  };
  await this.imageImporter.importImages(opened, [...allImages], signal);
}
```

**ポイント**:
- `dmigManifest` は `importProjects(req, dmigManifest, signal)` の引数として既に渡ってきている。**再読込は発生しない**（Compose 側はもともと「呼び出し元が渡した manifest を信用する」契約だった）。
- `OpenedPackageBase` の import は `import type { OpenedPackageBase } from './importer/OpenedPackage.js';` を `ComposeImporter.ts` の import 群に追加。
- L21 の `DmigManifest` import は **そのまま残す**（`importProjects` の引数型として使われている）。

### 3.4 `ImportRequest` 型と preload の扱い

- `@shared/types.ts` の `ImportRequest` は **完全に不変**。Renderer 側は `{ packageDir, selectedImages, jobToken }` を送り続ける。
- IPC ハンドラ層で `req.packageDir` を `openAsBase` に渡し、`req.selectedImages` を新 `importImages` に渡す形で **アダプト**する。**Renderer / preload には 1 文字の変更も入らない**。

### 3.5 後方互換オーバーロードを設けない

旧 `importImages(req: ImportRequest, signal?)` のオーバーロード残置は **禁止**。  
理由: 利用箇所は IPC ハンドラ 1 箇所 + ComposeImporter 1 箇所のみで、両方ともこのタスクで同時に書き換える。残置すると新 API 経由かどうかを後で判別できなくなる。

---

## 4. 実行手順

1. `git status` / `git log -1` で `main` の先端が `6ed609c` であることを確認。
2. `dmig/src/main/core/Importer.ts` の `importImages` シグネチャと冒頭 2 行（`readManifest` 呼び出しと `manifest` の取得）を §3.1 に従って書き換え。それ以降のループ・進捗イベント・ヘルパ呼び出しは **無変更**。`req.packageDir` / `req.selectedImages` の置換のみ機械的に実施。
3. `dmig/src/main/ipc/importImages.ts` の `dmig:import` ハンドラを §3.2 に従って差し替え（`openAsBase` を `try` 内で 1 行追加 + `importImages` の引数を `(opened, req.selectedImages, controller.signal)` に変更）。
4. `dmig/src/main/core/ComposeImporter.ts` の `imageImporter.importImages(...)` 呼び出しを §3.3 に従って 1 箇所書き換え。`OpenedPackageBase` 型の import を追加。
5. `cd dmig && npm run typecheck && npm run lint && npm run test && npm run build` で緑を確認。
6. アプリ実起動の手検証は **不要**（IPC 表面は不変。テスト 19 件と typecheck で十分）。マスターが「念のため」と言ったときのみ `npm run dev` を起動する。
7. 開発日記に entry 追加。`Commit: pending` で 1 本目をコミット。
8. push → コミットハッシュを日記に反映 → 2 本目をコミット → push。

---

## 5. やってはいけないこと（再掲・重要）

- `Importer.importImages` のループ・進捗イベント・`verifyChecksum` / `loadOne` の内部を「ついで」に直す。
- `ImportRequest` 型を変更する。preload / Renderer を変更する。
- `Importer.readManifest` / `openAsBase` / `openForResume` / `probe` / `validatePartialState` の **シグネチャや内部ロジック**を変更する（`importImages` の入口だけが対象）。
- 新しいユーティリティ関数（`makeOpenedBase(...)` 等）を追加する。`ComposeImporter` 内では **インラインで 1 リテラル**にする（§3.3 のとおり）。
- `DockerAdapter` を触る（R-2 のスコープ）。
- IPC チャンネル名や引数・戻り値の型を変える。
- `dmig:probePackage` の結果を Main 側でキャッシュして `dmig:import` で再利用する仕組みを入れる（IPC 跨ぎの状態管理は本タスクの枠外）。
- テストファイルを編集する。

---

## 6. コミット粒度と push

### コミット 1: 本体

タイトル:
```
refactor(importer): pass OpenedPackageBase into importImages
```

本文（`-m` 第二引数で渡す）:
```
importImages のシグネチャを (opened: OpenedPackageBase, selectedImages,
signal?) に変更し、内部の readManifest 呼び出しを削除。
ipc/importImages.ts の dmig:import ハンドラで openAsBase を呼んで
opened を組み立てる形に変更し、Main 側で「1 IPC 呼び出し = 1 回
manifest 読み」を保証。ComposeImporter は既に保持している
dmigManifest から OpenedPackageBase をインライン生成して渡す。
IPC チャンネル名・引数型・戻り値型・進捗イベント・preload・Renderer
は不変。
```

対象: `dmig/src/main/core/Importer.ts` / `dmig/src/main/ipc/importImages.ts` / `dmig/src/main/core/ComposeImporter.ts` / `docs/2026-05-18_開発日記.html`（pending 状態）

### コミット 2: 日記ハッシュ反映

タイトル:
```
docs(diary): record commit hash for importer onepass refactor
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
        <td>コードレビュー R-1: <code>Importer.importImages</code> を <code>OpenedPackageBase</code> 受け取りに変更（manifest 二重読み解消）</td>
        <td><span class="tag tag-ok">OK</span></td>
        <td><a href="#entry-HHMM">詳細</a></td>
      </tr>
```

`</main>` 直前に追加:

```html
<section class="entry" id="entry-HHMM">
  <h2>コードレビュー R-1: Importer の manifest 二重読み解消</h2>
  <div class="meta">
    <span class="date">2026-05-18 HH:MM</span>
    <span class="tag tag-type">dev</span>
    <span class="tag tag-scope">tool</span>
    <span class="tag tag-ok">OK</span>
  </div>

  <h3>概要</h3>
  <p><code>Importer.importImages</code> のシグネチャを <code>(opened: OpenedPackageBase, selectedImages: string[], signal?: AbortSignal)</code> に変更し、内部の <code>readManifest</code> 呼び出しを削除した。IPC ハンドラ <code>dmig:import</code> 側で <code>openAsBase(req.packageDir)</code> を呼んで <code>OpenedPackageBase</code> を組み立て、新シグネチャに流す。これにより 1 回の <code>dmig:import</code> 呼び出しで <code>manifest.json</code> が <strong>1 回しか</strong> parse されない。<code>ComposeImporter</code> は <code>importProjects(req, dmigManifest, signal)</code> として既に <code>DmigManifest</code> を保持しているため、インラインで <code>OpenedPackageBase</code> を組み立てて新 API に渡す（こちらも追加読込なし）。<code>ImportRequest</code> 型・IPC チャンネル名・preload・Renderer は不変。</p>

  <h3>変更ファイル</h3>
  <ul class="changes">
    <li><span class="op op-mod">~</span> <code>dmig/src/main/core/Importer.ts</code></li>
    <li><span class="op op-mod">~</span> <code>dmig/src/main/ipc/importImages.ts</code></li>
    <li><span class="op op-mod">~</span> <code>dmig/src/main/core/ComposeImporter.ts</code></li>
    <li><span class="op op-mod">~</span> <code>docs/2026-05-18_開発日記.html</code></li>
  </ul>

  <h3>設計判断</h3>
  <p>後方互換オーバーロード（旧 <code>importImages(req: ImportRequest, signal?)</code>）は残置せず、呼び出し元 2 箇所（IPC ハンドラ + <code>ComposeImporter</code>）を同時に書き換える方針を採った。理由: 呼び出し元が少数かつ本タスクで全て掌握できるため、両入口を残すと「新 API 経由かどうか」を後で判別できなくなる。<code>ComposeImporter</code> 内では補助関数を作らずインラインリテラルで <code>OpenedPackageBase</code> を生成（Surgical Changes、再利用予定が無い）。</p>

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

1. 変更ファイル（mod のみ。本タスクで add は発生しない想定）
2. `typecheck` / `lint` / `test`（テスト件数）/ `build` の結果
3. コミット 1 / コミット 2 のハッシュ
4. `origin/main` の先端ハッシュ
5. 残課題（無ければ「無し」。R-2 が残っている旨は記載してよい）

---

## 9. PowerShell シェル注意

コミットメッセージは **HEREDOC ではなく `-m` を 2 つ並べる**:

```powershell
git commit -m "refactor(importer): pass OpenedPackageBase into importImages" `
  -m "importImages のシグネチャを ... (本文)"
```

backtick 行継続でも 1 行詰めでも可。HEREDOC は PowerShell では失敗する。
