# dmig 手動スモークチェックリスト（M5）

Phase 6 第4回完了後の最小確認。lab 環境・テスト用 Docker のみ。

## 前提

- [ ] `cd dmig && npm run dev` で起動
- [ ] Docker Desktop 稼働

## 移行元フロー

- [ ] 起動時 **移行元の概要** が表示される
- [ ] StepIndicator（上）と NextStepFooter（下）が表示される
- [ ] 概要カードから「プロジェクトを選ぶ」で Compose へ
- [ ] ヘルプ / 用語集 → 用語フィルタ → `#partial-state` 深リンク
- [ ] 設定 → 「前回ページを復元」を ON → 再起動で直前ページに戻る

## Docker 未接続（任意）

- [ ] Docker 停止時、Footer に起動案内（CTA なし）

## 移行先

- [ ] 移行先概要 → パックを読み込む → Import
- [ ] StepIndicator が 2 段で step 2 がハイライト（Import 時）

## ビルド（任意）

- [ ] `npm run build` 成功
- [ ] `npm run build:win`（Windows のみ）
