# hotfix-3 実装計画 — U6-03 Electron ハードニング

**目標バージョン**: `0.5.2.3-poc`  
**親指示書**: [update-06-instructions.md](./update-06-instructions.md) v0.2  
**着手 GO**: マスター確認後（本書承認後に実装）

---

## 1. 変更対象ファイル

| ファイル | 段 | 変更内容 |
|----------|-----|----------|
| `dmig/src/renderer/index.html` | C1 | 本番向け CSP `<meta>`（`file://` 読み込み用） |
| `dmig/src/main/security/csp.ts` | C1 | dev / prod の CSP 文字列定義 + `session` ヘッダ注入（**新規**） |
| `dmig/src/main/security/navigationGuards.ts` | C2 | `will-navigate` / `setWindowOpenHandler`（**新規**） |
| `dmig/src/main/index.ts` | C2, C3, C4 | ガード適用、`webPreferences` 明示化、任意 `sandbox` |
| `dmig/src/main/security/csp.test.ts` | C1 | prod CSP に `connect-src 'none'` 等が含まれる軽量テスト（**新規・任意**） |
| `dmig/CHANGELOG.md` | C5 | `[0.5.2.3-poc]` |
| `dmig/package.json` | C5 | `version` |
| `docs/notes/2026-05-27_update02-readnote.md` | C5 | §14 に hotfix-3 注記（Electron 第 1/2 弾） |
| `docs/2026-05-26_開発日記.html` | C5 | エントリ追記 |

**触らない**: preload（`contextBridge` のみ）、IPC ハンドラ、Renderer ビジネスロジック。

---

## 2. CSP 方針（Electron 制約）

### 2.1 課題

| モード | 読み込み元 | CSP の効き方 |
|--------|------------|--------------|
| **開発** | `ELECTRON_RENDERER_URL` → `http://localhost:5173` | Vite が HTML を配信。`<meta>` は index 経由で効くが、**HMR 用 `unsafe-inline` / `ws:` が必要** |
| **本番** | `loadFile` → `file://.../renderer/index.html` | **`session.webRequest` だけでは `file://` にヘッダを付けにくい**ことがある → **`<meta http-equiv>` を併用** |

**方針**: **二層**

1. **本番**: `index.html` の `<meta Content-Security-Policy>`（`file://` 向け）
2. **開発**: `app.whenReady` 前に `session.defaultSession.webRequest.onHeadersReceived` で `http://localhost:*` 応答に **開発用 CSP** を注入（Vite HMR 許可）

Renderer は **外部 HTTP を使わない**（Docker 操作は main + IPC）。よって本番 `connect-src 'none'` が原則成立。

### 2.2 本番 CSP 案（`index.html` meta）

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
/>
```

| ディレクティブ | 値 | 理由 |
|----------------|-----|------|
| `default-src` | `'self'` | 既定を同一オリジン（file バンドル）に |
| `script-src` | `'self'` | Vite ビルドは外部スクリプトなし。インライン script 不要 |
| `style-src` | `'self'` | `styles.css` + バンドル CSS。インライン style 最小なら `'unsafe-inline'` 不要（実機で確認） |
| `connect-src` | `'none'` | Renderer からの `fetch`/XHR 禁止（IPC のみ） |
| `object-src` / `base-uri` / `form-action` / `frame-ancestors` | 制限 | 埋め込み・リダイレクト攻撃面削減 |

**`unsafe-inline` を付けない理由**: React 19 + Vite 本番ビルドは通常インライン script 不要。スモークで画面が真っ白なら `style-src 'self' 'unsafe-inline'` のみ追加検討（script には付けない）。

### 2.3 開発 CSP 案（main `onHeadersReceived`）

```text
default-src 'self' http://localhost:5173 http://127.0.0.1:5173;
script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173 http://127.0.0.1:5173;
style-src 'self' 'unsafe-inline' http://localhost:5173 http://127.0.0.1:5173;
connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:5173;
img-src 'self' data: http://localhost:5173 http://127.0.0.1:5173;
```

| 緩和 | 理由 |
|------|------|
| `'unsafe-inline'` / `'unsafe-eval'`（script） | Vite client / React Refresh |
| `ws:` | HMR WebSocket |
| `http://localhost:5173` | dev server 本体 |

**ポート固定**: electron-vite 既定 5173。変更時は `csp.ts` の定数を 1 箇所で更新。

**実装スケッチ** (`csp.ts`):

```typescript
import { session } from 'electron';

export function installContentSecurityPolicy(isPackaged: boolean): void {
  if (isPackaged) {
    return; // 本番は index.html meta に委ねる
  }
  const devCsp = buildDevCsp();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('http://localhost:') && !details.url.startsWith('http://127.0.0.1:')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [devCsp];
    callback({ responseHeaders: headers });
  });
}
```

`app.whenReady()` 内で `createWindow()` の**前**に `installContentSecurityPolicy(app.isPackaged)` を 1 回呼ぶ（`session.defaultSession` は ready 後のみ利用可）。

### 2.4 リスクと緩和

| リスク | 緩和 |
|--------|------|
| 本番で style が効かない | 実機スモーク。必要なら `style-src` のみ `unsafe-inline` |
| dev で HMR が切れる | dev CSP の `ws:` / `unsafe-eval` を維持。Console に CSP violation を確認 |
| 将来 Renderer が `fetch` する | `connect-src` を緩める前に ADR。現状は IPC 設計と整合 |

---

## 3. Navigation ガード（C2）

**新規**: `dmig/src/main/security/navigationGuards.ts`

```typescript
import type { BrowserWindow } from 'electron';

function isAllowedMainNavigation(url: string, isDev: boolean): boolean {
  if (isDev) {
    return (
      url.startsWith('http://localhost:') ||
      url.startsWith('http://127.0.0.1:') ||
      url === 'about:blank'
    );
  }
  // 本番: file:// のみ（アプリ配下）
  return url.startsWith('file://');
}

export function attachNavigationGuards(win: BrowserWindow, isDev: boolean): void {
  const wc = win.webContents;

  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  wc.on('will-navigate', (event, url) => {
    if (!isAllowedMainNavigation(url, isDev)) {
      event.preventDefault();
    }
  });

  // サブフレーム・新ウィンドウ（Electron 22+）
  wc.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}
```

`createWindow()` 内で `loadURL` / `loadFile` の**前**に `attachNavigationGuards(win, !app.isPackaged)`。

**意図**: フィッシング的な外部 URL への遷移・`window.open` 経由の脱出を拒否。ユーザーがブラウザで開く必要があるリンクは将来「外部ブラウザで開く」（`shell.openExternal`）を main 経由で別途設計（本 hotfix では未実装）。

---

## 4. webPreferences 明示化（C3）

現状（暗黙既定に依存）:

```typescript
webPreferences: {
  preload: resolvePreload(),
  contextIsolation: true,
  nodeIntegration: false,
},
```

**変更後（第 1 弾）**:

```typescript
webPreferences: {
  preload: resolvePreload(),
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  enableWebSQL: false,
  // sandbox: true,  // C4 のみ。第 1 弾ではコメントアウトまたは未設定
},
```

コメント（日本語）で各フラグの意図を 1 行ずつ記載（`02-coding-style` 準拠）。

---

## 5. 第 2 弾 — `sandbox: true`（C4）

```typescript
sandbox: true,
```

| 確認項目 | 期待 |
|----------|------|
| `window.dmig` API | preload 経由で動作（`contextBridge` は sandbox 下でも可） |
| Export / Import | IPC 往復 OK |
| DevTools | 開発時 detach モードで従来どおり |
| 起動失敗 | preload パス・CJS バンドルエラー → revert C4 |

**既知**: `electron.vite` preload コメントに「サンドボックス上の preload」とあり、**理論上は対応済み**。それでも実機必須。

---

## 6. コミット計画（確定案）

| ID | メッセージ例 | 内容 |
|----|--------------|------|
| C1 | `fix(security): add CSP for dev session and prod renderer (hotfix-3 U6-03 C1)` | `csp.ts` + `index.html` meta + `index.ts` で install 呼び出し |
| C2 | `fix(security): block external navigation and window.open (hotfix-3 U6-03 C2)` | `navigationGuards.ts` + `index.ts` |
| C3 | `fix(security): document safe webPreferences defaults (hotfix-3 U6-03 C3)` | `webPreferences` 明示 + コメント |
| C4 | `fix(security): enable renderer sandbox (hotfix-3 U6-03 C4)` | `sandbox: true`（GO 後・第 1 弾スモーク OK 後） |
| C5 | `chore(release): bump to 0.5.2.3-poc and document hotfix-3 (hotfix-3 U6-03 C5)` | CHANGELOG / package.json / 日記 / readnote |

各コミット前: `npm run typecheck` / `npm run lint`。C5 前: `npm test` / `npm run build` / 実機スモーク。

---

## 7. 実機スモークチェックリスト（第 1 弾完了時）

- [ ] 設定画面に `0.5.2.3-poc`（C5 後）
- [ ] 移行元概要 → Image Export → 新規パック → Import（§14 相当）
- [ ] Compose Export → Import（任意、時間あれば）
- [ ] DevTools Console に **CSP violation が大量に出ない**
- [ ] Help / ガイド lazy 読み込み（`StaticPageGuides`）が表示される
- [ ] 外部リンクを仕込んだテスト HTML は**行わない**（本番 HTML に手を入れない）

第 2 弾追加時は上記を再実行。

---

## 8. ロールバック手順（C4 のみ失敗時）

1. `sandbox: true` 行を削除（または `false`）
2. C4 コミットを revert（`git revert <c4-sha>`）
3. C5 で `0.5.2.3-poc` リリース（第 1 弾のみ）
4. readnote §14 に「sandbox は見送り、hotfix-4 候補」と 1 行記載

### 8.1 C4 revert 時の CHANGELOG / リリース文言（C1〜C3 のみ出荷時）

`[0.5.2.3-poc]` セクションは第 1 弾のみ列挙し、末尾に次を必ず入れる:

```markdown
### Security (Electron, wave 1)

- Content-Security-Policy: production meta tag + dev session header (localhost:5173)
- Navigation guards: deny `window.open`, restrict `will-navigate` to app origins
- Explicit safe `webPreferences` (contextIsolation, no nodeIntegration, webSecurity)

### Note

- Renderer `sandbox: true` was evaluated in development but reverted before release due to
  compatibility issues with preload or smoke tests. Revisit in hotfix-4 or UPDATE-07.
```

readnote §14 には 1 行: 「hotfix-3: U6-03 第 1 弾のみ。`sandbox: true` は実機で NG のため revert、次回検討。」

### 8.2 CSP と dev / 本番の差（hotfix-3 時点）

- **本番ビルド（packaged）**: Vite ビルド時に `index.html` へ CSP meta を注入（`connect-src 'none'` 等）。
- **開発（`npm run dev`）**: ソース `index.html` には meta を置かず、`session.webRequest` で localhost:5173 応答に dev CSP ヘッダを付与（C1-fix2）。実機 Console で違反が残る場合の整理・本番同等の検証手順は **UPDATE-06** で対応予定。

---

## 9. 実装しないもの（スコープ外）

- `shell.openExternal` ラッパー（将来のヘルプ URL 用）
- Renderer 内 `<a href="https://...">` の洗い出し（現状なし想定）
- `webSecurity: false` への変更
- preload の権限削減（別タスク）

---

## 10. マスター GO 後の Agent 手順

1. C1 → 実機 dev 起動確認（HMR・画面）
2. C2 → ナビゲーション拒否の手動確認は任意（DevTools で `location.href='https://example.com'` は不要。コードレビューで十分）
3. C3 → 差分確認のみ
4. マスター実機スモーク OK 宣言
5. C4 → 再スモーク
6. C5 → push
