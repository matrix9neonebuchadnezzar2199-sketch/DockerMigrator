import React from 'react';
import type { PageKey } from '../App.js';

export const TargetOverviewPage: React.FC<{ onNavigate: (page: PageKey) => void }> = ({
  onNavigate,
}) => (
  <div className="page-shell overview-page">
    <div className="page-two-col">
      <div className="page-primary">
        <h2>移行先での作業 — 概要</h2>

        <section className="overview-section" aria-labelledby="target-overview-purpose">
          <h3 id="target-overview-purpose">このグループでできること</h3>
          <p>
            他のマシンから持ってきた <code>.dmig</code> パックを、このマシンに取り込みます。
          </p>
        </section>

        <section className="overview-section" aria-labelledby="target-overview-flow">
          <h3 id="target-overview-flow">作業の流れ</h3>
          <ol className="overview-flow-list">
            <li>
              <strong>パックを読み込む</strong> — <code>.dmig</code> パックを選択し、内容を確認します。
            </li>
            <li>
              <strong>取り込み実行</strong> — 必要なイメージとボリュームをこのマシンに展開します。
            </li>
          </ol>
        </section>

        <section className="overview-section" aria-labelledby="target-overview-pages">
          <h3 id="target-overview-pages">このグループの作業ページ</h3>
          <div className="overview-cards">
            <article className="overview-card overview-card-primary">
              <h4 className="overview-card-title">
                <span aria-hidden="true">📥 </span>
                パックを読み込む
              </h4>
              <p className="overview-card-desc">
                .dmig パックを選択して、イメージとボリュームを取り込みます。
              </p>
              <button
                type="button"
                className="overview-card-open overview-card-open-primary"
                onClick={() => onNavigate('import')}
              >
                このページを開く →
              </button>
            </article>
          </div>
        </section>

        <p className="overview-help-note">
          Compose 同梱パックの取り込みは「プロジェクトを選ぶ」ページのインポートタブから行います。詳細はヘルプを参照してください。
        </p>
      </div>

      <aside className="page-guide-rail" aria-label="概要のヒント">
        <div className="page-guide overview-rail-hint">
          <p>USB などにコピーした .dmig フォルダを選んで読み込みを開始します。</p>
        </div>
      </aside>
    </div>
  </div>
);
