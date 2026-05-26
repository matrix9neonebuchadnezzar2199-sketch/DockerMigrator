# dev / 本番 CSP 検証手順（UPDATE-06）

hotfix-3 で導入した Content-Security-Policy の、開発（`npm run dev`）と本番ビルドの確認手順。lab 環境・ローカルのみ。

## 前提

- Main プロセス変更後は **`npm run dev` を完全再起動**（ステイル main 回避）。
- DevTools の **Electron Security Warning**（`webSecurity` / `allowRunningInsecureContent` 等）は開発ビルドでは出続けてよい（許容）。
- **CSP violation**（`Refused to …`）が HMR 中に大量に出る場合は NG。

## 1. 開発（session ヘッダ注入）

| # | 手順 | 合格 |
|---|------|------|
| 1 | `cd dmig && npm run dev` で起動 | アプリ画面が表示される |
| 2 | 付属 DevTools → **Network** → ドキュメント（`localhost:5173` の `/` または `index.html`）を選択 | |
| 3 | Response Headers に **`Content-Security-Policy`** がある | OK |
| 4 | ヘッダ値に `ws://localhost:5173`（または使用中ポート）と `'unsafe-eval'` が含まれる | OK |
| 5 | Console に **CSP violation が連続しない**（画面操作・HMR 後も） | OK |
| 6 | 設定画面のバージョン表示、移行元の `listImages` / Compose 一覧が動く | OK |

### ヘッダが見えないとき

1. Main を再起動したか（`installContentSecurityPolicy` は `app.whenReady` 内）。
2. Network で **Document** 型の最初の HTML 応答を見ているか（`file://` や `devtools://` ではない）。
3. `ELECTRON_RENDERER_URL` の host/port が Vite と一致しているか（非標準ポート時は `rendererCsp.ts` の `resolveDevRendererCspConfig` が URL から解決）。

## 2. 本番同等（ビルド成果物の meta）

| # | 手順 | 合格 |
|---|------|------|
| 1 | `cd dmig && npm run build` | 成功 |
| 2 | `out/renderer/index.html` を開く | `<meta http-equiv="Content-Security-Policy"` がある |
| 3 | meta の `content` に **`connect-src 'none'`** がある | OK |
| 4 | （任意）`npm run start`（preview）で起動し、主要画面が真っ白にならない | OK |

自動確認: `npm test` の `rendererCsp.test.ts`（`injectProdRendererCspMeta`）が本番 meta 形状を検証。

## 3. 既知の許容差分（dev vs prod）

| 項目 | dev | prod |
|------|-----|------|
| 適用経路 | `session.webRequest` ヘッダ | `index.html` meta |
| `script-src` | `'unsafe-inline' 'unsafe-eval'` + Vite オリジン | `'self'` のみ |
| `connect-src` | HMR 用 `ws:` / `http://localhost:*` | `'none'` |
| `frame-ancestors` | dev CSP に含む（ヘッダ） | meta では無効のため未記載 |

## 4. 回帰コマンド

```bash
cd dmig
npm run typecheck
npm run lint
npm test
npm run build
```

リポジトリルート: `python scripts/run_smoke_check.py`

## 参照

- [hotfix-3-electron-hardening-plan.md](../instructions/hotfix-3-electron-hardening-plan.md) §2 / §8.2
- `dmig/src/shared/rendererCsp.ts` — CSP 文字列の単一ソース
- `dmig/src/main/security/csp.ts` — dev ヘッダ注入
