# dmig 動作確認用サンプル

## myapp プロジェクト

dmig の Phase 5 機能を一通り確認するための Compose プロジェクト。

### 起動手順

```bash
cd docs/samples/myapp
docker compose up -d
```

起動すると、コンテナにラベル `com.docker.compose.project=myapp-dev` が
付与され、dmig から検出可能になる。

### 確認できる機能

- Compose プロジェクト検出（ラベル逆引き）
- ビルドコンテキスト同梱（web サービス）
- 既存イメージ同梱（postgres:16-alpine）
- named volume の中身同梱（pgdata）
- bind mount のユーザー選択（./logs）
- シークレット検出（.env 内の5項目）
  - API_KEY (sk_test_*)
  - DB_PASSWORD (*_PASSWORD)
  - AWS_SECRET_ACCESS_KEY (AKIA*)
  - JWT_SECRET (eyJ*)

### 後片付け

```bash
docker compose down -v
```
