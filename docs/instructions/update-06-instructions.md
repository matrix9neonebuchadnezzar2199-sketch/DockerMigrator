# UPDATE-06 指示書 v0.2

**ステータス**: マスター承認済み（B+C ハイブリッド / 0.6.0 スコープ限定 / M7 は 0.6.0 完了後）  
**前提**: hotfix-2（`0.5.2.2-poc`）クローズ済み。§14 パターン A。  
**通読ノート**: [docs/notes/2026-05-27_update02-readnote.md](../notes/2026-05-27_update02-readnote.md) §20

---

## リリース分割（確定）

| リリース | バージョン | スコープ | 工数目安 |
|----------|------------|----------|----------|
| **hotfix-3** | `0.5.2.3-poc` | **U6-03** Electron ハードニング（段階リリース、下記） | 0.5〜1.5 日 |
| **UPDATE-06** | `0.6.0-poc` | **U6-01** importCompose ゲート、**U6-02** path traversal、**U6-05** ラウンドトリップ拡張 | 3〜5 日 |
| **UPDATE-07** | `0.7.0-poc` | **U6-04** IPC zod、**U6-06** manifest Zod、**P2**、繰越（IPC cancel / Importer UI） | 1〜2 週間 |
| **M7** | TBD | 設定 v2（別計画） | **0.6.0-poc 完了後**キックオフ。UPDATE-07 と**並行しない** |

---

## スコープ一覧（ID マスター）

| 優先度 | ID | リリース | 内容 |
|--------|-----|----------|------|
| P0 | U6-03 | hotfix-3 | Electron ハードニング（CSP / navigation / webPreferences 明示化 → 任意 `sandbox: true`） |
| P0 | U6-01 | UPDATE-06 | `importCompose` → `Importer.openAsBase` |
| P0 | U6-02 | UPDATE-06 | `safeJoinUnder` + manifest 由来パス検証 + tar 展開ガード |
| P1 | U6-05 | UPDATE-06 | ラウンドトリップ拡張（delta / resume / Compose Import） |
| P1 | U6-04 | UPDATE-07 | IPC 入口 zod |
| P1 | U6-06 | UPDATE-07 | manifest Zod 一元化 |
| P2 | U6-07〜09 | UPDATE-07 | checksums atomic、compose config 上限、alpine digest |
| 繰越 | — | UPDATE-07 | [ipc-cancel-scope](../notes/2026-05-26_ipc-cancel-scope.md)、[importer-ui-design](../notes/2026-05-26_importer-ui-design.md) |

---

## フェーズ表

### hotfix-3（`0.5.2.3-poc`）— U6-03

| 段 | 内容 | コミット | 規模 | 検証 |
|----|------|----------|------|------|
| **第 1 弾** | CSP、navigation ガード、webPreferences 明示化 | C1〜C3 | S | 起動、Export/Import、DevTools、lazy guides |
| **第 2 弾** | `sandbox: true`（任意） | C4 | XS | 第 1 弾 OK 後。NG なら C4 のみロールバックして 0.5.2.3 リリース |
| **リリース** | CHANGELOG / version / 日記 / §14 注記 | C5 | XS | `npm test` / `build` / 実機 |

詳細実装計画: [hotfix-3-electron-hardening-plan.md](./hotfix-3-electron-hardening-plan.md)

### UPDATE-06（`0.6.0-poc`）

| フェーズ | ID | 内容 | コミット目安 | 規模 |
|----------|-----|------|--------------|------|
| 1 | U6-01 | `compose.ts` importCompose ゲート | 1 + test | XS |
| 2 | U6-02 | `safeJoinUnder` + 適用箇所 + テスト | 2〜3 | M |
| 3 | U6-05 | roundtrip 拡張（delta / resume / compose import） | 1〜2 | M |
| 4 | — | CHANGELOG / roadmap / §14 追記 / 日記 | 1 | XS |

**実装順序**: U6-01 → U6-02 → U6-05（U6-02 完了後に U6-05 で回帰を固める）。

### UPDATE-07（`0.7.0-poc`）— 概要のみ（本書では詳細未展開）

1. U6-04（IPC zod）  
2. U6-06（manifest Zod）— 設計・ADR 検討時間を見込む  
3. P2 + 繰越  

---

## U6-03 段階分け方針（合意）

1. **第 1 弾（必須）**: CSP、`will-navigate` / `setWindowOpenHandler`、`webPreferences` の安全側を**明示**（暗黙既定に依存しない）。
2. **第 2 弾（条件付き）**: `sandbox: true`。preload / `contextBridge` との相性を実機で確認。
3. 第 2 弾でブロッカーが出た場合: 第 2 弾のみ revert し **0.5.2.3-poc は第 1 弾のみでリリース**。`sandbox` は hotfix-4 候補または ADR に「見送り理由」を記録。

---

## 共通ルール

| 項目 | hotfix-3 | UPDATE-06 / 07 |
|------|----------|----------------|
| ブランチ | `main` 直 push | 同左 |
| コミット suffix | `(hotfix-3 U6-03 Cn)` | `(UPDATE-06 …)` / `(UPDATE-07 …)` |
| 検証 | typecheck / lint / test / build / 実機スモーク | 同左 + §14 相当 |
| 手動スモーク | 起動・設定バージョン表示・Export→Import・DevTools | 新規パック manifest + path 攻撃フィクスチャ（U6-02 後） |

---

## 参照

- [hotfix-3-electron-hardening-plan.md](./hotfix-3-electron-hardening-plan.md) — CSP / navigation 具体案
- [dmig-serialized-data-contracts.md](../architecture/dmig-serialized-data-contracts.md)
- `.cursor/rules/54-dmig-data-contracts.mdc`
- `dmig/src/main/core/exportImport.roundtrip.test.ts`
