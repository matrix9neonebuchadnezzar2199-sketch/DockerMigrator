import React from 'react';
import type { PageKey } from '../App.js';

type WorkCard = {
  page: PageKey;
  icon: string;
  title: string;
  description: string;
  primary?: boolean;
};

const SOURCE_WORK_CARDS: WorkCard[] = [
  {
    page: 'compose',
    icon: '📁',
    title: 'プロジェクトを選ぶ',
    description: 'Compose プロジェクトを検出して、移行対象を選びます。',
    primary: true,
  },
  {
    page: 'export',
    icon: '📦',
    title: 'パックを書き出す',
    description: '選んだプロジェクトを .dmig パックとして出力します。',
  },
  {
    page: 'resume',
    icon: '▶',
    title: '中断したパックを再開',
    description: '前回中断した書き出しを、続きから完了させます。',
  },
];

export const SourceOverviewPage: React.FC<{ onNavigate: (page: PageKey) => void }> = ({
  onNavigate,
}) => (
  <div className="page-shell overview-page">
    <div className="page-two-col">
      <div className="page-primary">
        <h2>移行元での作業 — 概要</h2>

        <section className="overview-section" aria-labelledby="source-overview-purpose">
          <h3 id="source-overview-purpose">このグループでできること</h3>
          <p>
            Docker プロジェクトを別のマシンに持っていくため、必要なイメージ・ボリューム・設定をひとつのパック（
            <code>.dmig</code>）にまとめて書き出します。
          </p>
        </section>

        <section className="overview-section" aria-labelledby="source-overview-flow">
          <h3 id="source-overview-flow">作業の流れ</h3>
          <ol className="overview-flow-list">
            <li>
              <strong>プロジェクトを選ぶ</strong> — Docker Compose のプロジェクト一覧から、持っていきたいものを選びます。
            </li>
            <li>
              <strong>パックを書き出す</strong> — 選んだプロジェクトを <code>.dmig</code> パックとして書き出します。USB
              メモリ等に保存できます。
            </li>
            <li>
              <strong>（中断時）再開する</strong> — 書き出しが途中で止まった場合は、続きから再開できます。
            </li>
          </ol>
        </section>

        <section className="overview-section" aria-labelledby="source-overview-pages">
          <h3 id="source-overview-pages">このグループの作業ページ</h3>
          <div className="overview-cards">
            {SOURCE_WORK_CARDS.map((card) => (
              <article
                key={card.page}
                className={`overview-card${card.primary ? ' overview-card-primary' : ''}`}
              >
                <h4 className="overview-card-title">
                  <span aria-hidden="true">{card.icon} </span>
                  {card.title}
                </h4>
                <p className="overview-card-desc">{card.description}</p>
                <button
                  type="button"
                  className={`overview-card-open${card.primary ? ' overview-card-open-primary' : ''}`}
                  onClick={() => onNavigate(card.page)}
                >
                  このページを開く →
                </button>
              </article>
            ))}
          </div>
        </section>

        <p className="overview-help-note">
          用語の意味や詳しい手順は、サイドバー「ヘルプ / 用語集」で確認できます。
        </p>
      </div>

      <aside className="page-guide-rail" aria-label="概要のヒント">
        <div className="page-guide overview-rail-hint">
          <p>左のカードから作業を始めましょう。よく使う「プロジェクトを選ぶ」が一番上です。</p>
        </div>
      </aside>
    </div>
  </div>
);
