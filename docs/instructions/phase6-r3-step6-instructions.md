# Phase 6 第3回 step 6 指示書 — CHANGELOG / 正本 v1.0 昇格 / 仕様書 §11

**対象モデル**: Composer2
**作業日**: 2026-05-18
**前提コミット**: `762f15b`（step 5 完了 + 日記ハッシュ反映済み）
**作業ブランチ**: `main` に直接コミット → push（既存運用どおり）

---

## 0. 背景（読まずに作業しない）

Phase 6 第3回（manifest 1.1 / 中断・再開）は step 1〜5 で **コード実装が完了**している。残るは **ドキュメント側の昇格**のみ。

- **step 1**: 型定義 + エラーコード E2070–E2075（`47f40c1`）
- **step 1.5**: `ChunkRef.contentKind` + 正本 v0.2（`82e2538` / `3dd77ec`）
- **step 3**: Importer 入口分離 / `dmig:probePackage` / E2075 検証（`b991483`）
- **step 4**: Exporter `partialState` 段階 A / `ManifestWriter` / `resumeExport` IPC（`c3c80b2`）
- **step 5**: Import UI（`probePackage` → `gateImportAfterProbe` → `ResumeConfirmDialog` / `ProbeErrorPanel`）と Export/Compose 失敗時の `ResumeHintBanner`（`c3af0bd` / `762f15b`）

本 step 6 では **コードを触らない**。下記 3 つの文書だけを整える。

---

## 1. 作業の Success Criteria（先に書く）

このタスクは以下が全て成立した時点で完了とする:

1. ルート直下に `CHANGELOG.md` が新規作成され、Keep a Changelog 準拠の形式で `## [0.2.0-poc] - 2026-05-18` 節に Phase 6 第3回の変更が **Added / Changed / Fixed** で記載されている。リンクとして `v0.1.0-poc` 以降の compare URL を末尾に置く。
2. `docs/dmig-manifest-1.1.md` が **新規作成**され、`docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md` の内容を **v1.0 として昇格・整形**したものになっている。`draft-v0.2.md` は **削除せず残す**（履歴用）が、冒頭に「本書は v1.0 (`dmig-manifest-1.1.md`) に昇格済み。本ファイルは履歴のために保持」と一文だけ追記する。
3. `仕様書.txt` §11 のヘッダと「正本」参照行が **正本 v1.0** (`docs/dmig-manifest-1.1.md`) を指すよう書き換わっている。本文要約は現状維持で構わない（参照先パスと「v0.2 → v1.0」のラベル更新のみ）。
4. `README.md` の §主な機能の「中断・再開 (manifest 1.1)」行が `docs/dmig-manifest-1.1.md`（正本 v1.0）を指すリンクに更新されている。「順次実装中」→「Phase 6 第3回で実装完了」に文言を改める。
5. `dmig/package.json` の `version` を **`0.2.0-poc`** に上げる。`dmig/src/main/core/Exporter.ts` の `DMIG_VERSION` と `dmig/src/main/core/manifest/composeExportManifestSession.ts` の `dmigVersion: '1.0.0'` も **`'0.2.0-poc'`** に同期する（CHANGELOG の節番号と一致させる）。**テスト固定値（`Exporter.partialState.test.ts` 等）は触らない**。
6. 開発日記 `docs/2026-05-18_開発日記.html` に `#entry-1500`（時刻はマスター承認後実時刻でよい、デフォルトは作業開始時の `Get-Date -Format HH:mm`）として step 6 エントリを追加。目次にも 1 行追記。種別 `dev`、scope は `docs` と `tool` を併記、検証は `npm run typecheck` / `lint` / `test` / `build`。
7. `dmig/` で `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` がすべて緑（version 文字列を上げただけなので影響軽微の想定）。
8. すべて `main` にコミットして `origin/main` に push 済み。コミット粒度は §6 を参照。

**Success Criteria はマスター（ユーザー）の追加指示で増減しうる**。途中で疑義があれば手を止めて確認すること。

---

## 2. 触ってよいファイル / 触ってはいけないファイル

### 触ってよい

- `CHANGELOG.md`（新規）
- `docs/dmig-manifest-1.1.md`（新規、v1.0 昇格版）
- `docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md`（**冒頭 1 行追記のみ**、本文改変禁止）
- `仕様書.txt`（§11 のヘッダ・参照行のみ。それ以外の節は触らない）
- `README.md`（§主な機能の「中断・再開」行のみ）
- `dmig/package.json`（`version` のみ）
- `dmig/src/main/core/Exporter.ts`（定数 `DMIG_VERSION` のみ）
- `dmig/src/main/core/manifest/composeExportManifestSession.ts`（`dmigVersion` リテラルのみ）
- `docs/2026-05-18_開発日記.html`（追記のみ。既存セクションの破壊禁止）

### 触ってはいけない

- 上記以外のソース（Importer / IPC / Preload / Renderer 各ページ / styles.css / 型定義 等）
- テストファイル（`*.test.ts`）— 固定値の `dmigVersion: '1.0.0'` も**そのまま**にする
- 他リポジトリ、`.cursor/` 配下のルール
- `仕様書.txt` の §11 以外の節

「ついで refactor」は禁止（`00-karpathy-guidelines §3` Surgical Changes）。

---

## 3. 詳細手順

### 3.1 CHANGELOG.md（新規）

ルート直下 `F:\Cursor\DockerMigrator\CHANGELOG.md` に以下の構造で作成する。

```markdown
# Changelog

本リポジトリのリリース単位の変更履歴。Keep a Changelog 準拠（[https://keepachangelog.com/ja/1.1.0/](https://keepachangelog.com/ja/1.1.0/)）。
バージョン番号は `dmig/package.json` の `version` を正とする。

## [Unreleased]

（次のリリースに向けた未公開変更をここに積む）

## [0.2.0-poc] - 2026-05-18

### Added

- `dmig` manifest schemaVersion **1.1**: 中断・再開のための `partialState`（`pendingChunks` / `lastUpdatedAt` / `checksumPolicy` / `interruptionReason`）と `ChunkRef`（`contentKind` + `contentId` + `chunkIndex` + `byteOffset` / `byteLength` / `expectedSha256`）を導入。
- Importer 入口の分離: `openAsBase` / `openForResume` / `probe`、IPC `dmig:probePackage`、preload `window.dmig.probePackage`、`ProbeSummary`。
- Exporter 段階 A の `partialState` 書き込み（1 entry = 1 chunk、`expectedSha256` は全ゼロ 64 文字のプレースホルダ）と `ManifestWriter`（`write-file-atomic` ベースの原子書き換え）。
- IPC `dmig:resumeExport` / preload `window.dmig.resumeExport`、`ResumeExportRequest`（`packageDir` + `jobToken` + 任意 `compressionLevel`）。
- Renderer Import ページ: `probePackage` → `gateImportAfterProbe`（共有）で分岐、`ResumeConfirmDialog` から `resumeExport` 起動・実行中は `cancel(jobToken)`、異常系は `ProbeErrorPanel`。
- Renderer Export / Compose ページ: エクスポート失敗時に `ResumeHintBanner` で Import からの再開を案内（文言は `@shared/uiCopy.ts`）。
- エラーコード **E2070–E2075**（`INVALID_BASE_PACKAGE` / `NOT_A_PARTIAL_PACKAGE` / `CHUNK_CHECKSUM_MISMATCH` / `EXPORT_PREVIOUS_IS_PARTIAL` / `CHAIN_CONTAINS_PARTIAL` / `MANIFEST_PARTIAL_INVALID`）。
- 仕様書 §11 と正本 `docs/dmig-manifest-1.1.md`（v1.0）を新設。

### Changed

- ページレイアウトを `page-shell` + `page-two-col` に統一し、解説を右レール (`page-guide-rail`) に集約。`HelpTip` は廃止。
- `DmigManifest` を `schemaVersion: '1.1'` 既定で出力。1.0 は読み込み互換のみ維持。

### Fixed

- 該当なし（実装は新規導入のため）。

[Unreleased]: https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/compare/v0.2.0-poc...HEAD
[0.2.0-poc]: https://github.com/matrix9neonebuchadnezzar2199-sketch/DockerMigrator/compare/v0.1.0-poc...v0.2.0-poc
```

注意:

- Markdown の見出しレベルは上記どおり。
- リリースリンク末尾は実在の compare URL を使う（`v0.1.0-poc` タグは既存）。
- 既に `## [Unreleased]` に積みたい変更が無いので空節として残す（次回リリースで積み始める）。

### 3.2 正本 v1.0 昇格

#### 3.2.1 新規ファイル

`F:\Cursor\DockerMigrator\docs\dmig-manifest-1.1.md` を作成。中身は `docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md` の **コピー**を以下の差し替えだけ加えたもの:

- **タイトル行**: `# dmig manifest schemaVersion 1.1 / 中断・再開機能（v1.0）`
- **冒頭バナー**: 既存の `**Draft v0.2.2**(...)` を以下に置換する:

```markdown
**Version**: v1.0（Phase 6 第3回完了時点の確定版）
**文書日付**: 2026-05-18
**根拠コミット**: `47f40c1`（型）、`b991483`（Importer/probe）、`c3c80b2`（Exporter 段階 A / resumeExport）、`c3af0bd`（Import UI / 再開ダイアログ / 案内帯）
**履歴ドラフト**: `docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md`
```

- **§0「本書の位置づけ」**: 「本書は Phase 6 第3回の着手段階のドラフトであり、実装過程で不整合が見つかれば随時改訂する。」を「**本書は Phase 6 第3回完了時点の確定仕様 (v1.0) である**。以降の改修は別ドラフトを起こし v1.1 等で昇格する。」に書き換える。
- **「v0.1 → v0.2」の冒頭サマリ節**: 削除する（履歴はドラフト側に残る）。
- **§12「未確定事項（v0.3 以降）」**: そのまま残してよい。タイトルだけ「未確定事項（v1.1 以降への持ち越し）」に変更。
- **末尾「変更履歴」**: 既存の v0.1/v0.2/v0.2.2 行のあとに次の 1 行を追加:
  - `- **v1.0** (2026-05-18): Phase 6 第3回完了に伴い v0.2.2 を確定版として昇格。仕様変更なし、見出し・参照のみ調整。`

それ以外の本文・表・コードブロック・JSON 例は **一切変更しない**。意味論的変更は禁止。

#### 3.2.2 ドラフト側の追記

`docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md` の **タイトル直下（`# dmig manifest schemaVersion 1.1 / 中断・再開機能` の次行）** に以下を 1 段落だけ挿入する:

```markdown
> **Note**: 本書は **v1.0** (`docs/dmig-manifest-1.1.md`) として昇格済み。本ファイルは v0.1 → v0.2.2 までのドラフト履歴を残す目的で保持している。最新仕様の参照は正本 v1.0 を見ること。
```

本文は触らない。

### 3.3 仕様書 §11 の参照更新

`仕様書.txt` の §11 ヘッダおよび「正本」行を以下に書き換える:

- 旧:
  ```
  ## 11. dmig manifest 1.1 / 中断・再開（Phase 6 第3回ドラフト v0.1 → **v0.2**）

  **正本**: `DockerMigrator/docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md`（v0.2: `ChunkRef.contentKind` 追加・`contents` オブジェクト構造の明文化）
  ```
- 新:
  ```
  ## 11. dmig manifest 1.1 / 中断・再開（Phase 6 第3回完了 — 正本 v1.0）

  **正本**: `DockerMigrator/docs/dmig-manifest-1.1.md`（v1.0、2026-05-18 昇格）
  **履歴ドラフト**: `DockerMigrator/docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md`
  ```

§11.1 / §11.2 / §11.3 の本文は触らない。

### 3.4 README.md の文言更新

`README.md` の表「主な機能」内、`| **中断・再開 (manifest 1.1)** |` 行のみを次に置換する:

- 旧:
  ```
  | **中断・再開 (manifest 1.1)** | `partialState` / `ChunkRef`（**`contentKind` + `contentId`**）とエラー **E2070–E2075** を `dmig` に追加済み。Importer 入口分離・Exporter 原子書き込み・UI は [正本ドラフト v0.2](./docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md) に沿って順次実装中。 |
  ```
- 新:
  ```
  | **中断・再開 (manifest 1.1)** | `partialState` / `ChunkRef`（**`contentKind` + `contentId`**）、エラー **E2070–E2075**、Importer 入口分離、Exporter 原子書き込み、Import 再開 UI まで Phase 6 第3回で実装完了。詳細は [正本 v1.0](./docs/dmig-manifest-1.1.md) を参照。 |
  ```

§概要の `0.1.0-poc` 表記は **§4 の version 更新後に手動で `0.2.0-poc` に同期**する（README 内 2 か所以上ある可能性があるので grep して全部）。CHANGELOG への導線は README §ドキュメントの表に 1 行追加してもよい:

```
| [CHANGELOG.md](./CHANGELOG.md) | リリース単位の変更履歴 |
```

### 3.5 version 同期

```
dmig/package.json                                   "version": "0.1.0-poc" → "0.2.0-poc"
dmig/src/main/core/Exporter.ts                      const DMIG_VERSION = '1.0.0' → '0.2.0-poc'
dmig/src/main/core/manifest/composeExportManifestSession.ts  dmigVersion: '1.0.0' → dmigVersion: '0.2.0-poc'
```

**テストの `dmigVersion: '1.0.0'` 固定値は変更しない**（テストはフィクスチャの値そのもので動いており、製品 version との同期義務はない）。`Importer.openedPackage.test.ts` で `dmigVersion: '2.0.0'` を `version_incompatible` の駆動として使っている箇所もそのまま。

### 3.6 開発日記の追記

`docs/2026-05-18_開発日記.html` に以下を加える。

#### 目次行追加（`<tbody>` 末尾の `</tbody>` の直前に挿入）

```html
      <tr>
        <td>HH:MM</td>
        <td>Phase 6 第3回 step 6: CHANGELOG 新設・正本 v1.0 昇格・仕様書 §11 / README 参照更新・version 0.2.0-poc</td>
        <td><span class="tag tag-ok">OK</span></td>
        <td><a href="#entry-HHMM">詳細</a></td>
      </tr>
```

`HH:MM` は作業開始時刻（PowerShell `Get-Date -Format HH:mm`）に置換し、`#entry-HHMM` の HHMM もそれに合わせる。

#### 本文セクション追加（`</main>` の直前に挿入）

```html
<section class="entry" id="entry-HHMM">
  <h2>Phase 6 第3回 step 6: CHANGELOG 新設・正本 v1.0 昇格</h2>
  <div class="meta">
    <span class="date">2026-05-18 HH:MM</span>
    <span class="tag tag-type">dev</span>
    <span class="tag tag-scope">docs</span>
    <span class="tag tag-scope">tool</span>
    <span class="tag tag-ok">OK</span>
  </div>

  <h3>概要</h3>
  <p>Phase 6 第3回（manifest 1.1 / 中断・再開）の実装完了に伴い、ドキュメント側を確定版に昇格した。<code>CHANGELOG.md</code> を Keep a Changelog 形式で新設し <code>0.2.0-poc</code> 節に第3回の Added / Changed をまとめた。<code>docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md</code> を <code>docs/dmig-manifest-1.1.md</code> に v1.0 として昇格し、ドラフト側は履歴として残し冒頭で正本を参照させた。<code>仕様書.txt</code> §11 と <code>README.md</code> の中断・再開行も正本 v1.0 を指すよう更新。<code>dmig/package.json</code> および <code>DMIG_VERSION</code> / <code>composeExportManifestSession</code> の <code>dmigVersion</code> を <code>0.2.0-poc</code> に同期。</p>

  <h3>変更ファイル</h3>
  <ul class="changes">
    <li><span class="op op-add">+</span> <code>CHANGELOG.md</code></li>
    <li><span class="op op-add">+</span> <code>docs/dmig-manifest-1.1.md</code></li>
    <li><span class="op op-mod">~</span> <code>docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md</code>（冒頭 Note のみ）</li>
    <li><span class="op op-mod">~</span> <code>仕様書.txt</code>（§11 ヘッダ・参照行のみ）</li>
    <li><span class="op op-mod">~</span> <code>README.md</code></li>
    <li><span class="op op-mod">~</span> <code>dmig/package.json</code></li>
    <li><span class="op op-mod">~</span> <code>dmig/src/main/core/Exporter.ts</code> / <code>dmig/src/main/core/manifest/composeExportManifestSession.ts</code></li>
    <li><span class="op op-mod">~</span> <code>docs/2026-05-18_開発日記.html</code></li>
  </ul>

  <h3>設計判断</h3>
  <p>ドラフト v0.2.2 を v1.0 として昇格する際、本文・表・JSON 例・型サンプルは一切変更しない方針を採った。仕様の意味論変更は別ドラフトに起こす運用とし、本 step 6 は「参照経路の確定」と「変更履歴の単一窓口化（CHANGELOG）」にスコープを絞った。version は SemVer のマイナー上げに相当する追加（中断・再開機能の導入）として <code>0.2.0-poc</code> を採用。</p>

  <h3>検証</h3>
  <ul>
    <li><code>npm run typecheck</code> / <code>npm run lint</code> / <code>npm run test</code> / <code>npm run build</code>（<code>dmig</code>）</li>
    <li>Commit: pending</li>
  </ul>
</section>
```

最後にコミット後、`Commit: pending` を実ハッシュに書き換える追記コミットを 1 本入れる（既存運用と同じ）。

---

## 4. 実行順序（推奨）

1. `git status` / `git log -1` で現状確認。`main` の先端が `762f15b` であることを確認。
2. CHANGELOG.md 作成（§3.1）。
3. `docs/dmig-manifest-1.1.md` 作成（§3.2.1）。
4. ドラフト側に Note 追記（§3.2.2）。
5. 仕様書 §11 更新（§3.3）。
6. README 更新（§3.4） — version 表記もここで揃える。
7. version 同期（§3.5） — 3 ファイル。
8. `cd dmig && npm run typecheck && npm run lint && npm run test && npm run build` で緑を確認。
9. 開発日記の目次・本文を追記（§3.6）。`Commit: pending` のまま 1 本目をコミット。
10. コミット → push（§6）。
11. 日記の `pending` を実ハッシュに置換 → 2 本目をコミット → push。

---

## 5. やってはいけないこと（再掲）

- 製品コードに **ロジック変更**を加える（version 文字列以外を触らない）。
- 既存テストの固定値を「揃えるため」に書き換える。
- ドラフト v0.2.2 の本文を編集する（冒頭 Note 追加のみ可）。
- `仕様書.txt` の §11 以外の節を編集する。
- 自分の判断で `0.2.0` や `1.0.0` 等、`poc` を外した version を採用する。
- `dmig-manifest-1.1-partial-resume-draft-v0.2.md` のファイル名変更・削除。
- 日記の既存セクションを削除・統合する。

---

## 6. コミット粒度と push

以下の 2 コミットに分ける。両方を `origin/main` に push する。

### コミット 1: 昇格本体

```
docs: promote manifest 1.1 spec to v1.0 and add CHANGELOG

Phase 6 第3回完了に伴うドキュメント昇格。draft v0.2.2 を
docs/dmig-manifest-1.1.md (v1.0) として昇格し、仕様書 §11 と
README の参照を正本に揃えた。Keep a Changelog 準拠の
CHANGELOG.md を新設し 0.2.0-poc 節に第3回の変更を集約。
dmig/package.json / DMIG_VERSION / composeExportManifestSession
の dmigVersion を 0.2.0-poc に同期。
```

対象: `CHANGELOG.md` / `docs/dmig-manifest-1.1.md` / `docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md` / `仕様書.txt` / `README.md` / `dmig/package.json` / `dmig/src/main/core/Exporter.ts` / `dmig/src/main/core/manifest/composeExportManifestSession.ts` / `docs/2026-05-18_開発日記.html`（pending 状態）

### コミット 2: 日記ハッシュ反映

```
docs(diary): record commit hash for Phase 6 step 6 entry
```

対象: `docs/2026-05-18_開発日記.html` のみ。

push:

```powershell
git push origin main
```

---

## 7. 完了報告フォーマット（マスター宛て）

作業完了時、次の項目を 1 メッセージで報告すること:

1. 作成・変更ファイルの一覧（add/mod 別）
2. `npm run typecheck` / `lint` / `test` / `build` の結果（OK/NG）
3. コミット 1 / コミット 2 のハッシュ
4. `origin/main` の先端ハッシュ
5. 残課題があれば箇条書き（無ければ「無し」と書く）

---

## 8. 参考（コミット作業のシェル注意）

PowerShell 環境のため、コミットメッセージは **HEREDOC ではなく `-m` 複数指定**を使うこと:

```powershell
git commit -m "docs: promote manifest 1.1 spec to v1.0 and add CHANGELOG" `
  -m "Phase 6 第3回完了に伴うドキュメント昇格。..."
```

backtick 行継続を使うか、1 行に詰めるか、いずれでも可。HEREDOC (`$(cat <<'EOF' ... EOF)`) は PowerShell では失敗する（過去に詰まった経緯あり）。
