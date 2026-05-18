# コードレビュー R-2 指示書 — `DockerAdapter` の `DOCKER_HOST` 尊重

**対象モデル**: Composer2
**作業日**: 2026-05-18（マスター承認後）
**前提コミット**: `ebb71b9`（R-1 importer onepass の日記ハッシュ反映済み。`main` の先端）
**作業ブランチ**: `main` に直接コミット → push（既存運用どおり）

---

## 0. 背景

`dmig/src/main/core/DockerAdapter.ts` のコンストラクタは現状、**OS だけを見て socket パスを固定**している:

```typescript
this.docker = new Docker(
  process.platform === 'win32'
    ? { socketPath: '//./pipe/docker_engine' }
    : { socketPath: '/var/run/docker.sock' },
);
```

一方、`docker` CLI を `execFile` で呼ぶ箇所が 2 か所ある（R-3 で IPC モジュール化済み）:

- `dmig/src/main/ipc/system.ts` — `docker image prune -f`
- `dmig/src/main/ipc/compose.ts` — `docker compose -f ... stop|pull`

子プロセスは `process.env` を継承するため、ユーザーが `DOCKER_HOST=tcp://remote:2375` のような環境で本アプリを起動した場合、**`docker compose stop` は remote daemon を相手にし、直後の `docker.listComposeProjects()`（`DockerAdapter` 経由）は local socket を相手にする**という整合性の崩れが起こる。

### dockerode / docker-modem 側の挙動（確認済）

`docker-modem` の `defaultOpts()` は、引数なし `new Docker()` の場合に `process.env.DOCKER_HOST` を完全解釈する:

- `unix://...` → `socketPath`
- `npipe://...` → `socketPath`
- `tcp://...` → `host` / `port` / `protocol`（`DOCKER_TLS_VERIFY === '1'` や `port === '2376'` で `https`）
- `ssh://...` → `protocol: 'ssh'` + `SSH_AUTH_SOCK`
- `DOCKER_CERT_PATH` / `DOCKER_CLIENT_TIMEOUT` / `DOCKER_PATH_PREFIX` も尊重

ところが `Modem` のコンストラクタ内部は `Object.assign({}, optDefaults, options)` で **呼び出し側の `options` が `optDefaults` を上書きする**。さらに `this.host` が未設定（= 呼び出し側が `socketPath` を渡した場合）には強制的に `this.socketPath = opts.socketPath` が採用される。  
**現状の `DockerAdapter` は意図せず `DOCKER_HOST` を完全に握りつぶしている**。

本タスクの目的は、レビュー指摘どおり「**`DockerAdapter` が `DOCKER_HOST` を尊重する**」状態にすることで、`docker` CLI と接続先が常に一致するようにすることである。

**重要**: 本タスクは **R-2 単独**で扱う。R-1 / R-3 はすでに完了済み。本タスクでは `execFile('docker', ...)` 側には**触らない**（子プロセスは元から env を継承するので、`DockerAdapter` を直すだけで両者が揃う）。

---

## 1. 作業の Success Criteria

このタスクは以下が全て成立した時点で完了とする:

1. `DockerAdapter` のコンストラクタが次のロジックになっている:
   - **`process.env.DOCKER_HOST` が空でない** → `new Docker()` を **引数なし** で呼ぶ（dockerode の `defaultOpts()` に解釈を委ねる）。
   - **`DOCKER_HOST` 未設定** → 従来どおりプラットフォーム別の `socketPath` を明示渡しする（**振る舞い完全保持**）。
2. `DOCKER_HOST` の取得は **コンストラクタ実行時に一度だけ**読む（モジュール初期化時の static キャプチャは不可。Electron の `app.on('ready')` 前後で env が異なる可能性は無いが、テスタビリティ上もインスタンスごとに読む）。
3. `DockerAdapter` の **他メソッド（`ping` / `listImages` / `saveImageStream` / `loadImageStream` / `inspectVolume` / `exportVolumeStream` / `importVolumeStream` / `ensureImage` / `listComposeProjects` / `resolveImageId`）は 1 文字も変更しない**。
4. `execFile('docker', ...)` を呼ぶ 2 箇所（`ipc/system.ts`, `ipc/compose.ts`）も**触らない**。子プロセスへの `env` 受け渡しは Node のデフォルト挙動（親プロセスの env を継承）に任せる。
5. preload / Renderer / 共有型は不変。
6. 既存テスト（`npm run test` で 19 件、3 ファイル）が**そのまま緑**。テストの追加・改変は本タスクでは行わない。
7. `npm run typecheck` / `npm run lint` / `npm run build` が緑。
8. 開発日記 `docs/2026-05-18_開発日記.html` に entry を追加（時刻は作業開始時の `Get-Date -Format HH:mm`、scope は `tool`、種別 `dev`）。
9. `main` ブランチに 2 コミット（本体 + 日記ハッシュ反映）で push 済み。

途中で疑義があれば手を止めてマスターに確認すること。

---

## 2. 触ってよいファイル / 触ってはいけないファイル

### 触ってよい

- `dmig/src/main/core/DockerAdapter.ts`（**コンストラクタのみ**）
- `docs/2026-05-18_開発日記.html`（追記のみ）

### 触ってはいけない

- `DockerAdapter` の **コンストラクタ以外のメソッド**全て
- `dmig/src/main/ipc/system.ts` / `dmig/src/main/ipc/compose.ts`（`execFile` 側）
- `@shared/types.ts` / `@shared/codes.ts`
- `dmig/src/preload/index.ts`
- Renderer（`dmig/src/renderer/**`）
- テストファイル（`*.test.ts`）
- IPC チャンネル名・エラーコード

「ついで refactor」は禁止（`00-karpathy-guidelines §3` Surgical Changes）。下記アンチパターンは特に避ける:

- `ping()` のエラーメッセージに `DOCKER_HOST` 情報を追記する。
- `DOCKER_TLS_VERIFY` / `DOCKER_CERT_PATH` を独自に解釈する（**dockerode に任せる**。本タスクで `process.env.DOCKER_HOST` 以外を `DockerAdapter` のコードから直接読まない）。
- `execFile('docker', ...)` に `env: { ...process.env, DOCKER_HOST: ... }` を渡す等の対称改修（子プロセスは元から継承するため不要）。
- `findDefaultUnixSocket` 相当のロジックを自分で書く（dockerode が既に持っている）。
- 接続失敗時のエラーコード細分化（`DOCKER_HOST_INVALID` 等の新設）。

---

## 3. 変更方針（設計確定済み）

### 3.1 `DockerAdapter` コンストラクタの新形

**変更前**:
```typescript
constructor() {
  this.docker = new Docker(
    process.platform === 'win32'
      ? { socketPath: '//./pipe/docker_engine' }
      : { socketPath: '/var/run/docker.sock' },
  );
}
```

**変更後**:
```typescript
constructor() {
  // DOCKER_HOST が設定されている場合は dockerode のデフォルト解釈に委ねる。
  // (unix:// / npipe:// / tcp:// / ssh:// と DOCKER_TLS_VERIFY / DOCKER_CERT_PATH 等を docker-modem が自動展開する)
  // 未設定の場合は従来どおり OS 別の socket パスを明示し、振る舞いを完全に保つ。
  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost && dockerHost.length > 0) {
    this.docker = new Docker();
  } else {
    this.docker = new Docker(
      process.platform === 'win32'
        ? { socketPath: '//./pipe/docker_engine' }
        : { socketPath: '/var/run/docker.sock' },
    );
  }
}
```

**ポイント**:
- `dockerHost && dockerHost.length > 0` で空文字列も「未設定」扱いとする（PowerShell で `$env:DOCKER_HOST = ""` した状態を含む保守的判定）。
- コメントは設計意図のみ（**なぜこの分岐か**）。「`if` で分岐する」のような自明コメントは入れない。
- 既存メソッド（`ping` / `listImages` 等）は **完全に無変更**。

### 3.2 `execFile('docker', ...)` 側の取り扱い

**何もしない**。`child_process.execFile` は親プロセスの `process.env` を子に継承するため:

- ユーザーが `DOCKER_HOST=tcp://remote:2375` を設定してアプリを起動 → 子 `docker` プロセスもその env を見る。
- 本タスクで `DockerAdapter` を `DOCKER_HOST` 尊重に直したことで、**dockerode 経由と `docker` CLI 経由の接続先が一致**する。

`ipc/system.ts` / `ipc/compose.ts` には `env: ...` の明示渡しを **入れない**（既定動作の上書きで挙動を変えない原則）。

### 3.3 TLS / SSH / 証明書

- `DOCKER_TLS_VERIFY` / `DOCKER_CERT_PATH` / `SSH_AUTH_SOCK` は **dockerode 側が `defaultOpts()` 内で自動解釈する**（§0 で確認済）。
- 本タスクでは `DockerAdapter` から **これらの env を一切直接参照しない**。`DOCKER_HOST` の有無だけを見て分岐する。
- UI 側でユーザーに「接続先」を表示する機能追加は本タスクのスコープ外（必要なら別タスク）。

### 3.4 互換性と影響範囲

- `DOCKER_HOST` 未設定の通常起動: 振る舞い完全保持（OS 別 `socketPath` を明示渡し）。既存テスト・既存運用とも影響ゼロ。
- `DOCKER_HOST=unix:///custom/path/docker.sock`: dockerode が `socketPath` に展開。`execFile('docker')` は元から尊重。両者一致。
- `DOCKER_HOST=tcp://remote:2375`: dockerode が `host` / `port` / `protocol=http` に展開。`execFile('docker')` も同 daemon を相手にする。両者一致。
- `DOCKER_HOST=tcp://remote:2376` + `DOCKER_TLS_VERIFY=1` + `DOCKER_CERT_PATH=...`: dockerode が `https` + 証明書ファイル読み込みまで実施。`docker` CLI も同条件。両者一致。
- `DOCKER_HOST=ssh://user@host`: dockerode が SSH トンネル経由で接続。`docker` CLI も SSH context を使用。両者一致。

---

## 4. 実行手順

1. `git status` / `git log -1` で `main` の先端が `ebb71b9` であることを確認。
2. `dmig/src/main/core/DockerAdapter.ts` のコンストラクタを §3.1 のとおり書き換え。他メソッドは無変更。
3. `cd dmig && npm run typecheck && npm run lint && npm run test && npm run build` で緑を確認。
4. 手動起動による検証は **不要**（IPC 表面・既存 19 テスト・typecheck で十分。`DOCKER_HOST` 未設定の通常起動では振る舞い完全保持）。マスターが「念のため」と言ったときのみ `npm run dev` を起動する。
5. 開発日記に entry 追加。`Commit: pending` で 1 本目をコミット。
6. push → コミットハッシュを日記に反映 → 2 本目をコミット → push。

---

## 5. やってはいけないこと（再掲・重要）

- `DockerAdapter` の **コンストラクタ以外**を変更する。
- `execFile('docker', ...)` 呼び出し側に env 関連の改修を入れる（`ipc/system.ts` / `ipc/compose.ts`）。
- `DOCKER_TLS_VERIFY` / `DOCKER_CERT_PATH` / `SSH_AUTH_SOCK` を `DockerAdapter` のコードから直接読む。
- `ping()` / `listImages()` 等のエラーメッセージに `DOCKER_HOST` 情報を追記する。
- 新しいエラーコードを `@shared/codes.ts` に追加する。
- 接続先を UI に表示する機能を追加する（別タスク）。
- preload / Renderer / 共有型を変更する。
- テストファイルを編集する。

---

## 6. コミット粒度と push

### コミット 1: 本体

タイトル:
```
feat(docker): honor DOCKER_HOST in DockerAdapter
```

本文（`-m` 第二引数で渡す）:
```
DOCKER_HOST が設定されている場合は new Docker() を引数なしで呼び、
dockerode (docker-modem) の defaultOpts() に解釈を委ねる
(unix:// / npipe:// / tcp:// / ssh:// と DOCKER_TLS_VERIFY /
DOCKER_CERT_PATH 等の標準 env を自動展開)。未設定の場合は従来どおり
OS 別の socketPath を明示渡しする。これにより docker CLI を子プロセスで
呼ぶ箇所 (ipc/system.ts, ipc/compose.ts) と dockerode 経由の接続先が
常に一致する。execFile 側は env 継承で自然に整合するため未変更。
他メソッド (ping/listImages 等)・IPC・preload・Rendererは不変。
```

対象: `dmig/src/main/core/DockerAdapter.ts` / `docs/2026-05-18_開発日記.html`（pending 状態）

### コミット 2: 日記ハッシュ反映

タイトル:
```
docs(diary): record commit hash for DOCKER_HOST adapter change
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
        <td>コードレビュー R-2: <code>DockerAdapter</code> が <code>DOCKER_HOST</code> を尊重するよう変更（<code>docker</code> CLI と接続先一致）</td>
        <td><span class="tag tag-ok">OK</span></td>
        <td><a href="#entry-HHMM">詳細</a></td>
      </tr>
```

`</main>` 直前に追加:

```html
<section class="entry" id="entry-HHMM">
  <h2>コードレビュー R-2: <code>DockerAdapter</code> の <code>DOCKER_HOST</code> 尊重</h2>
  <div class="meta">
    <span class="date">2026-05-18 HH:MM</span>
    <span class="tag tag-type">dev</span>
    <span class="tag tag-scope">tool</span>
    <span class="tag tag-ok">OK</span>
  </div>

  <h3>概要</h3>
  <p>指示書 <code>docs/instructions/code-review-r2-dockerhost-instructions.md</code> に従い、<code>DockerAdapter</code> のコンストラクタを <strong><code>DOCKER_HOST</code> が設定されている時は <code>new Docker()</code> を引数なしで呼ぶ</strong>形に変更。<code>docker-modem</code> の <code>defaultOpts()</code> が <code>unix://</code> / <code>npipe://</code> / <code>tcp://</code> / <code>ssh://</code> と <code>DOCKER_TLS_VERIFY</code> / <code>DOCKER_CERT_PATH</code> / <code>SSH_AUTH_SOCK</code> を自動展開する。<code>DOCKER_HOST</code> 未設定なら従来どおり OS 別の <code>socketPath</code> を明示渡しして振る舞いを完全保持。<code>execFile('docker', ...)</code> 側（<code>ipc/system.ts</code> / <code>ipc/compose.ts</code>）は子プロセスが <code>process.env</code> を継承するため未変更で接続先が一致する。<code>DockerAdapter</code> の他メソッド・IPC チャンネル・preload・Rendererは不変。</p>

  <h3>変更ファイル</h3>
  <ul class="changes">
    <li><span class="op op-mod">~</span> <code>dmig/src/main/core/DockerAdapter.ts</code></li>
    <li><span class="op op-mod">~</span> <code>docs/2026-05-18_開発日記.html</code></li>
  </ul>

  <h3>設計判断</h3>
  <p>選択肢は (A) <code>DockerAdapter</code> 側で <code>DOCKER_HOST</code> を尊重 / (B) <code>execFile</code> 側で env を上書きして socket 固定 / (C) <code>DOCKER_HOST</code> が設定されていたら拒否、の三案。マスターが (A) を選択。理由: <strong>Docker Desktop の context 機能やリモート daemon を意図的に使うユーザー</strong>を弾かず、<code>docker</code> CLI と <code>dockerode</code> 経由を同じ daemon に揃えるのが最も自然。TLS / SSH / 証明書まわりは <code>docker-modem</code> が完備しているため、本タスクで <code>DockerAdapter</code> から <code>DOCKER_HOST</code> 以外の env を直接読むことは禁じた（Surgical Changes）。</p>

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

1. 変更ファイル（mod のみ。本タスクで add は発生しない）
2. `typecheck` / `lint` / `test`（テスト件数）/ `build` の結果
3. コミット 1 / コミット 2 のハッシュ
4. `origin/main` の先端ハッシュ
5. 残課題（無ければ「無し」。R-1 / R-3 は完了済、本 R-2 でレビュー指摘 3 件を完了の旨を記載）

---

## 9. PowerShell シェル注意

コミットメッセージは **HEREDOC ではなく `-m` を 2 つ並べる**:

```powershell
git commit -m "feat(docker): honor DOCKER_HOST in DockerAdapter" `
  -m "DOCKER_HOST が設定されている場合は ... (本文)"
```

backtick 行継続でも 1 行詰めでも可。HEREDOC は PowerShell では失敗する。
