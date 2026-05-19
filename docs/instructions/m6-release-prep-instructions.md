# M6 リリース整備 指示書

**ファイル**: `docs/instructions/m6-release-prep-instructions.md`  
**ベースコミット**: `78bb5d8`  
**対象タグ**: `v0.3.0-poc`

## §0 前提

- 現在 `main` 先端は `78bb5d8`（D-009〜D-012 反映済み）。
- `CHANGELOG.md` の `[0.3.0-poc]` は M1 で昇格済み（`[Unreleased]` は空）。M6 では Release 本文のリポジトリ保存と検証が主目的。
- テスト 101 passed / 1 skipped（win32 symlink）。
- §9.1 Phase↔M 対応表は仕様書に追加済み。
- タグ `v0.3.0-poc` は M1–M5 完了時（`1983681` 付近）に既存。M6 完了コミットへの付け替えは行わない（履歴維持）。

## §1 スコープ

**In scope**

- Release 本文を `docs/releases/v0.3.0-poc.md` として作成しリポジトリ保存
- `CHANGELOG.md` の `[Unreleased]` テンプレート整備（既に昇格済みなら確認のみ）
- `npm run build:win` を手動実行し成果物を確認（添付はしない）
- `python scripts/run_smoke_check.py` を実行し pass を確認
- §9.1 対応表が D-009 順序を正しく反映しているか最終確認
- GitHub Release を Draft で作成（公開タイミングは別判断、`gh` 利用可時）
- ロードマップ M6 を「完了」に更新

**Out of scope**

- バイナリ添付（M13 でインストーラ正式化）
- 英訳 Release 本文
- CI 自動化
- スモークテストの拡充（追加項目は M8 以降）
- タグの force 付け替え

## §2 ファイル一覧

**新規**

- `docs/releases/v0.3.0-poc.md` — Release 本文（日本語単独）

**変更**

- `CHANGELOG.md` — `[Unreleased]` 空テンプレート（必要時）
- `docs/milestones/M6-M13-roadmap.md` — M6 ステータス「完了」
- `docs/2026-05-19_開発日記.html` — M6 完了エントリ

**確認のみ**

- `仕様書.txt` §9.1 — D-009 順序の整合性

## §3 手順

（マスター確定版。実施時は M1 済み項目をスキップ可能。）

### Step 1: 事前確認

1. `git status` でクリーンを確認。
2. `git log --oneline -1` でベースコミットを確認。
3. `仕様書.txt` §9.1 — 着手順 **M6 → M8 → M9 → M10 → M7 → M11 → M12 → M13** を目視確認。
4. `docs/milestones/M6-M13-roadmap.md` の D-009 と一致を確認。

### Step 2: Release 本文作成

`docs/releases/v0.3.0-poc.md` を新規作成（骨子は指示書原本 §3 Step 2）。

### Step 3: CHANGELOG

- 既に `[0.3.0-poc]` がある場合: `[Unreleased]` テンプレートのみ整備。
- 未昇格の場合のみ `## [0.3.0-poc] - 2026-05-19` へ昇格。

### Step 4: ビルド・スモーク

1. `cd dmig && npm run build:win`
2. `python scripts/run_smoke_check.py`

### Step 5〜7: ロードマップ・日記・コミット

§4〜§5 参照。

## §4 完了条件

1. `docs/releases/v0.3.0-poc.md` がリポジトリに含まれる。
2. `npm run build:win` ローカル完走（ログ手元保存）。
3. `python scripts/run_smoke_check.py` が pass。
4. §9.1 / D-009 整合確認済み。
5. ロードマップ M6 が「完了」。
6. 開発日記に M6 完了エントリ（SHA 補正済み）。
7. GitHub Release Draft（`gh` 可時。不可なら手順を日記に記載）。
8. `typecheck` / `lint` / `test` / `build` がエラー 0（コード変更なしでも実行可）。

## §5 コミット計画（3 本）

1. `docs: add v0.3.0-poc release notes and Unreleased template`
2. `docs: mark M6 complete in roadmap and diary`
3. `docs(diary): set M6 commit SHAs in entry-XXXX`

## §6 補足

- Release Draft 公開はマスター判断。
- §9.1 不整合は M6 内で修正（D-011）。
