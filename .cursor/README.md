# cursor-config

Cursor IDE 設定 (`.cursor/` 配下) のマシン間同期用 private repository。

## 構成

```
.cursor/
├── rules/        # ワークスペースルール (.mdc 形式、AI 振る舞い・コーディング規約・OPSEC 等)
├── skills/       # プロジェクト固有 skill 置き場 (現状 .gitkeep のみ)
├── templates/    # 開発日記テンプレート等の HTML テンプレート
└── mcp.json      # MCP server 設定 (空ベース)
```

## 同期方針

| 動作 | コマンド |
|---|---|
| ルール変更を共有 | `git add . && git commit -m "feat(rules): ..." && git push` |
| 別マシンで取り込み | `git pull` |
| コンフリクト時 | 手動マージ。ルールファイルは独立性が高いのでコンフリクトは稀 |

コミットメッセージは Conventional Commits (`F:\Cursor\.cursor\rules\05-git-conventions.mdc` §1) に従う。scope は `rules` / `skills` / `templates` / `meta` を使う。

## 別マシンでのセットアップ

### 前提
- Git for Windows (>= 2.40) がインストール済み
- Cursor IDE がインストール済み
- GitHub アカウント `matrix9neonebuchadnezzar2199-sketch` で認証済み (Git Credential Manager 経由 or PAT)

### 手順

```powershell
# 既存 .cursor がある場合は退避
if (Test-Path F:\Cursor\.cursor) {
    $stamp = Get-Date -Format yyyyMMdd_HHmmss
    Rename-Item F:\Cursor\.cursor "F:\Cursor\.cursor.backup_$stamp"
}

# clone
git clone https://github.com/matrix9neonebuchadnezzar2199-sketch/cursor-config.git F:\Cursor\.cursor

# 初回 pull で credential 入力ダイアログが出るので対応
cd F:\Cursor\.cursor
git status
```

### 認証 (PAT を使う場合)

1. https://github.com/settings/tokens?type=beta で Fine-grained PAT を発行
2. Repository access: Only select repositories → `cursor-config`
3. Permissions → Repository permissions → **Contents: Read and write** / **Metadata: Read-only**
4. Expiration: 90 日
5. 初回 `git push` / `git pull` 時のダイアログで username に GitHub アカウント名、password に発行した PAT を入力 → Windows Credential Manager に保存される

### 認証 (GCM のブラウザ認証を使う場合)

PAT 不要。初回 git 操作時に Git Credential Manager のポップアップが起動するので、ブラウザで GitHub にサインインして Authorize するだけ。

## 含まないもの (`.gitignore` で除外)

- `private/`、`local/`、`*.local.*` — 個人作業用
- `*.secret`、`*.token`、`.env*` — シークレット予防
- 開発日記 (`F:\Cursor\docs\YYYY-MM-DD_開発日記.html`) — そもそも `.cursor/` 配下ではないので対象外

## 関連

- 親ディレクトリ `F:\Cursor` 自体は git 管理外 (各ツール repo が独立して存在する作業領域)
- 開発日記は別 repo 化 (or 同期しない) 運用
