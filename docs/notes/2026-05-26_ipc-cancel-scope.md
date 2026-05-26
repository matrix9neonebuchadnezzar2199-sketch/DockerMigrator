# Main IPC cancel 横展開スコープ（UPDATE-05 フェーズ2）

**記録日**: 2026-05-26  
**判定**: UPDATE-05 では **要件整理のみ**。実装は UPDATE-06 へ送る。

## 現状（UPDATE-03 までで cancel 対応済み）

| IPC / 操作 | jobToken | 備考 |
|------------|----------|------|
| `exportImages` / `resumeExport` | あり | `dmig:cancel`、B-20 案B |
| `exportCompose` / `resumeComposePack` | あり | 同上 |
| `runRollback` | あり | `RunRollbackResult.cancelled` |

## 候補（長時間化の可能性）

| IPC | 優先度 | cancel の現実性 | UI 候補 | UPDATE-05 |
|-----|--------|-----------------|--------|-------------|
| `listComposeProjects` | 中 | プロジェクト数が多い環境で有効 | Compose 一覧読込中 | **見送り** |
| `listImages` | 低 | 通常は数秒以内 | Export 初回一覧 | 見送り |
| `listVolumes` | 低 | 同上 | Compose import | 見送り |
| `scanSecrets` | 中 | 大規模 compose で遅延 | Compose export 前 | 見送り |
| `computeDiff` / dry-run | 中 | 大パックで遅延 | Dry-run ページ | 見送り |

## 判断（UPDATE-05）

- 0.5.x 安定化の主目的は B-37 等の UX 修正。cancel 横展開は **設計・優先度づけのみ** 行い、実装は UPDATE-06 で 1 IPC ずつ着手する。
- 最初の実装候補（UPDATE-06）: `listComposeProjects` または `scanSecrets`（マスター環境で遅延が再現した方）。

## 実装パターン（参照）

UPDATE-03 rollback と同型: optional `jobToken` 追加、`jobRegistry` 登録、ループ内 `signal.aborted`、中断時 `cancelled: true` で部分結果返却。IPC は **追加のみ**。
