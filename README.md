# DockerMigrator

**Docker Desktop 向けの移行・バックアップ用デスクトップツール（PoC）** — イメージのエクスポート／インポート、Compose プロジェクトのまるごとパック（`.dmig`）、差分エクスポート用スナップショットなどを GUI から操作します。

[![Node.js](https://img.shields.io/badge/node.js-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Desktop-2496ED?logo=docker&logoColor=white)](https://www.docker.com/products/docker-desktop/)

**リポジトリ**: [github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator](https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator)

---

## 目次

- [概要](#概要)
- [主な機能](#主な機能)
- [リポジトリ構成](#リポジトリ構成)
- [動作要件](#動作要件)
- [開発とビルド](#開発とビルド)
- [バージョンと Git タグ](#バージョンと-git-タグ)
- [GitHub Releases](#github-releases)
- [ドキュメント](#ドキュメント)
- [注意事項](#注意事項)
- [コントリビューション](#コントリビューション)

---

## 概要

本リポジトリの本体アプリは **`dmig/`** 以下の **Electron + React + TypeScript** アプリケーションです。Docker Engine API（[dockerode](https://github.com/apocas/dockerode)）を用いてローカルの Docker Desktop と通信し、USB 等への退避や別マシンへの持ち込みを想定したワークフローを提供します。

現行バージョン（`dmig/package.json` の `version`）: **`0.3.0-poc`**（概念実証。本番運用前提の保証はありません）。

Git タグ: **`v0.3.0-poc`**（Phase 6 第3回 manifest 1.1 + 第4回 UI 改革）、**`v0.2.0-poc`**、**`v0.1.0-poc`**。詳細は [CHANGELOG.md](./CHANGELOG.md) と [GitHub Releases](https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/releases) を参照。

### UI の入口（Phase 6 第4回）

サイドバーは **移行元 / 移行先 / 共通** の 3 グループ。起動時は **移行元の概要**（`source-overview`）が開きます。

| 層 | 役割 |
|----|------|
| **概要ページ** | グループ単位の「地図」（できること・作業カード） |
| **ヘルプ / 用語集** | 用語と詳細フロー（`#hash` 深リンク） |
| **StepIndicator** | 作業ページ上部の現在地（移行元 3 段 / 移行先 2 段、クリックでジャンプ可） |
| **NextStepFooter** | 画面下端の「次にやること」案内（Docker 未接続時は起動案内のみ） |
| **設定** | 既定エクスポート先・前回ページ復元（`dmig-settings.json`） |

設計メモ: [docs/dmig-ui-redesign-v0.1.md](./docs/dmig-ui-redesign-v0.1.md)、仕様書 §12。

---

## 主な機能

| 領域 | 内容 |
|------|------|
| **イメージ** | 選択イメージのエクスポート（`docker save` 系）／パッケージからのインポート |
| **Compose** | `com.docker.compose.project` 由来のプロジェクト一覧、bind / `.env` 周りの扱い、まるごとパックのエクスポート・インポート |
| **差分・スナップショット** | 基底スナップショットに対する差分エクスポート（フル／デルタ）やプレビュー用の計算 |
| **事前検証** | 出力先パス、空き容量、サイズ推定（圧縮目安）などの preflight |
| **運用ショートカット** | Compose 向け `stop` / `pull`、dangling イメージの `prune`（確認ダイアログ付き）など（ホストの `docker` CLI 経由） |
| **中断・再開 (manifest 1.1)** | `partialState` / `ChunkRef`（**`contentKind` + `contentId`**）、エラー **E2070–E2075**、Importer 入口分離、Exporter 原子書き込み、Import 再開 UI まで Phase 6 第3回で実装完了。詳細は [正本 v1.0](./docs/dmig-manifest-1.1.md) を参照。 |

詳細な設計思想やデータ種別の整理はリポジトリ直下の **[仕様書.txt](./仕様書.txt)** を参照してください。

---

## リポジトリ構成

| パス | 説明 |
|------|------|
| **`dmig/`** | Electron アプリ（メインプロセス・プリロード・レンダラー・共有型） |
| **`docs/`** | 開発日記・設計ドラフトなど |
| **`仕様書.txt`** | プロダクト設計・用語の整理（日本語） |
| **`AGENTS.md`** | AI／エージェント向けの運用メモ（リモート・push・README 更新方針） |

---

## 動作要件

- **Node.js** 22 以上（`dmig/package.json` の `engines` に準拠）
- **Docker Desktop**（ローカルで Docker Engine が利用可能なこと）
- 開発時は対象 OS 上で **Electron が動作する環境**（Windows を主対象とした PoC）

---

## 開発とビルド

```bash
cd dmig
npm install
npm run dev          # 開発サーバ（electron-vite）
npm run typecheck    # TypeScript 検査
npm run lint         # ESLint
npm run build        # 本番ビルド（out/）
npm run build:win    # Windows 向けパッケージ（electron-builder）
npm run build:linux  # Linux 向けパッケージ
```

リポジトリルートから **動作点検（自動）**:

```bash
python scripts/run_smoke_check.py
```

`typecheck` / `lint` / `test` / `build` と Docker 確認のあと、手動 UI チェックリストを表示します。詳細は [docs/testing/smoke-checklist.md](./docs/testing/smoke-checklist.md)。

**今後のマイルストーン（M6–M13）**: [docs/milestones/M6-M13-roadmap.md](./docs/milestones/M6-M13-roadmap.md)

- 生成物・依存は **`dmig/.gitignore`** に従い、`node_modules/`・`out/`・`release/` などはコミットしません。

---

## バージョンと Git タグ

アプリのソース上のバージョンは **`dmig/package.json` の `version`** を正とします。Git のタグは **リリース可能な単位**で付与し、次の慣習を推奨します。

| 種別 | 推奨タグ例 | 用途 |
|------|------------|------|
| **通常リリース** | `v0.2.0` | [Semantic Versioning 2.0.0](https://semver.org/lang/ja/) に沿った安定版 |
| **プレリリース** | `v0.2.0-beta.1` | テスト配布・フィードバック用 |
| **PoC / 実験** | `v0.2.0-poc` | 現行のように `package.json` と揃えたマーカー付きタグも可 |

**付け方（annotated 推奨）**

```bash
git checkout main
git pull origin main
# package.json の version を上げたコミットが先頭であること
git tag -a v0.2.0 -m "release: v0.2.0"
git push origin v0.2.0
```

- **annotated tag**（`-a`）を推奨します。`git describe` や GitHub Releases のchangelog生成と相性が良いです。
- 既に公開したタグを書き換える場合は **`git tag -f` と `git push --force`** が必要になり、利用者の混乱につながるため原則避けてください。

---

## GitHub Releases

タグを push したら、必要に応じて **GitHub の Releases** から該当タグを選び、以下を載せるとよいです。

- **変更要約**（ユーザー向けの箇条書き）
- **互換性**（Docker Desktop の目安バージョン、OS）
- **成果物**（`electron-builder` で生成したインストーラや zip を Assets に添付する場合）

手動作成の手順は GitHub 公式ドキュメント「[Managing releases in a repository](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)」を参照してください。

---

## ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [CHANGELOG.md](./CHANGELOG.md) | リリース単位の変更履歴 |
| [仕様書.txt](./仕様書.txt) | 設計提案・データ種別・アーキテクチャ |
| [docs/](./docs/) | 開発日記、manifest ドラフトなど |
| [AGENTS.md](./AGENTS.md) | エージェント向け運用（リモート URL、push、README 同期） |

---

## 注意事項

- **本ツールはマルウェアではありません**が、Docker イメージやボリュームには機密が含まれ得ます。取り扱いは **自社・自己ラボの資産**に限定し、`.env` やレジストリ認証の取り扱いには十分注意してください。
- PoC のため、**大容量データや本番クリティカルな退避の唯一の手段**としては使わないでください。

---

## コントリビューション

- **既定ブランチ**: `main`。変更はプルリクエストまたは小さな直接コミットの方針はチーム運用に合わせてください。
- **`origin` は本リポジトリ（上記 GitHub URL）** とし、修正後は **`git push` まで完了させる**運用を推奨します（詳細は [AGENTS.md](./AGENTS.md)）。
- **README のメンテナンス**: 機能追加・要件変更・バージョン／タグ方針の変更があったら、**同一変更に README を含めるか、直後のコミットで README を更新**し、内容と乖離させないでください。

---

## ライセンス

未整備です。配布・再利用ポリシーを決めたら本節とリポジトリルートの `LICENSE` を追加してください。
