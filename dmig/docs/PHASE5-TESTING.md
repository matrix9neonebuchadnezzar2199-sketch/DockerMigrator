# Phase 5 動作確認手順

## 事前準備

### 1. サンプル Compose プロジェクトを起動

```bash
cd docs/samples/myapp
docker compose up -d
```

これでラベル `com.docker.compose.project=myapp-dev` のコンテナが起動し、
dmig から検出可能になる。

### 2. dmig を開発モードで起動

```bash
cd ../../../
npm run dev
```

## エクスポート手順

1. サイドバーの「🎯 Compose まるごと」をクリック
2. 「エクスポート」タブが選択されていることを確認
3. `myapp-dev` プロジェクトが一覧に表示されることを確認
   - 表示内容: 2 services (web running / db running), 1 volume (pgdata), 1 bind mount (./logs)
4. チェックボックスで `myapp-dev` を選択
5. 「出力先」の「📂 選択...」で出力先ディレクトリを指定（USBドライブ等）
6. 「▶ エクスポート開始」をクリック
7. **bind mount ダイアログ** が表示される
   - `./logs` の処理を選択（推奨: 「パスのみ記録」、テストなら「同梱」も試す）
8. **シークレット警告ダイアログ** が表示される
   - .env から複数項目検出される想定（API_KEY、DB_PASSWORD、AWS 系、JWT 等）
   - 「除外」「マスク」「同梱」のいずれかを選択
9. プログレスバーで進捗を確認
10. 完了メッセージと出力先パスが表示される

## 期待される出力構造

```
<outputDir>/dmig-2026-05-14T...dmig/
├── manifest.json
├── checksums.sha256
├── images/
│   ├── myapp-web_dev.tar.zst
│   └── postgres_16-alpine.tar.zst
├── volumes/
│   ├── myapp-dev_pgdata.tar.zst
│   └── myapp-dev_pgdata.meta.json
└── compose/
    └── myapp-dev/
        ├── project-manifest.json
        ├── compose.yaml
        ├── .env または .env.masked （除外時は無し）
        ├── build-contexts/
        │   └── web.tar.zst
        └── bind-mounts/  （「同梱」を選んだ場合のみ）
            └── logs.tar.zst
```

## インポート手順（別端末 or 同端末で確認）

1. 同端末で確認する場合、まず `docker compose down -v` で myapp-dev を削除
2. dmig の「インポート」タブを選択
3. 「📂 選択...」で出力した .dmig ディレクトリを指定
4. パッケージ情報が表示される
5. 各プロジェクトの「展開先」を「📂」で指定
6. 「▶ インポート開始」
7. プログレスバーで進捗を確認
8. 完了後:
   - イメージが `docker images` に存在することを確認
   - ボリュームが `docker volume ls` に存在することを確認
   - 展開先ディレクトリに compose.yaml が配置されていることを確認
9. 展開先で `docker compose up -d` を実行し、再起動できることを確認

## トラブルシューティング

### Compose プロジェクトが検出されない

- 一度も `docker compose up` していないプロジェクトは検出対象外（仕様）
- `docker ps -a --filter "label=com.docker.compose.project"` でラベルが付与されているか確認

### tar コマンドが見つからない

- Windows: Git for Windows のインストール or WSL2 経由のパスを通す
- Phase 5.1 でフォールバック実装予定（tar-stream パッケージ）

### bind mount の展開でパーミッションエラー

- インポート時の展開先パスへの書き込み権限を確認

### シークレットが検出されない

- スキャナの対象は .env ファイルのみ（compose.yaml の environment: は Phase 6 対応予定）
