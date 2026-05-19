import React, { useEffect, useMemo, useState } from 'react';
import type { PageKey } from '../App.js';
import { filterGlossaryEntries, GLOSSARY_ENTRIES } from '../data/glossary.js';

export type HelpTab = 'guide' | 'glossary';

const RELATED_PAGE_LABELS: Record<PageKey, string> = {
  'source-overview': '移行元での作業 — 概要',
  compose: 'プロジェクトを選ぶ',
  export: 'パックを書き出す',
  resume: '中断したパックを再開',
  'target-overview': '移行先での作業 — 概要',
  import: 'パックを読み込む',
  help: 'ヘルプ / 用語集',
};

function applyHashToTab(
  setTab: React.Dispatch<React.SetStateAction<HelpTab>>,
): number | undefined {
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return undefined;
  setTab('glossary');
  return requestAnimationFrame(() => {
    document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  });
}

export const HelpPage: React.FC<{ onNavigate?: (page: PageKey) => void }> = ({ onNavigate }) => {
  const [tab, setTab] = useState<HelpTab>('guide');
  const [filterQuery, setFilterQuery] = useState('');

  const filteredEntries = useMemo(
    () => filterGlossaryEntries(GLOSSARY_ENTRIES, filterQuery),
    [filterQuery],
  );

  useEffect(() => {
    let rafId = applyHashToTab(setTab);
    const onHashChange = () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      rafId = applyHashToTab(setTab);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="page-shell help-page">
      <div className="page-two-col">
        <div className="page-primary">
          <h2>ヘルプ / 用語集</h2>

          <div className="help-tabs" role="tablist" aria-label="ヘルプの表示切替">
            <button
              type="button"
              role="tab"
              id="help-tab-guide"
              className={`help-tab ${tab === 'guide' ? 'active' : ''}`}
              aria-selected={tab === 'guide'}
              onClick={() => setTab('guide')}
            >
              使い方ガイド
            </button>
            <button
              type="button"
              role="tab"
              id="help-tab-glossary"
              className={`help-tab ${tab === 'glossary' ? 'active' : ''}`}
              aria-selected={tab === 'glossary'}
              onClick={() => setTab('glossary')}
            >
              用語集
            </button>
          </div>

          {tab === 'guide' && (
            <div className="help-guide-panel" role="tabpanel" aria-labelledby="help-tab-guide">
              <section className="help-section">
                <h3>移行元での作業</h3>
                <ol>
                  <li>
                    サイドバー「<strong>プロジェクトを選ぶ</strong>」で Compose
                    プロジェクトを選び、必要ならバインドマウントや .env のシークレット検出を確認してからパックを書き出します。
                  </li>
                  <li>
                    または「<strong>パックを書き出す</strong>」で Docker イメージだけを選び、USB
                    などのフォルダへ .dmig パッケージを作成します。
                  </li>
                  <li>書き出し前の事前検証（preflight）で空き容量を確認できます。</li>
                  <li>途中で止めた場合は manifest に中断状態が残り、同じ PC で再開できます。</li>
                </ol>
              </section>

              <section className="help-section">
                <h3>移行先での作業</h3>
                <ol>
                  <li>USB などにコピーした .dmig フォルダを移行先 PC へ持ち運びます（フォルダごとコピーで構いません）。</li>
                  <li>
                    サイドバー「<strong>パックを読み込む</strong>」でパッケージフォルダを選び、manifest
                    を検証してからイメージや Compose をインポートします。
                  </li>
                  <li>
                    Compose 同梱パックは「パックを読み込む」ではなく「プロジェクトを選ぶ」ページのインポートタブから取り込みます（Import
                    ページはイメージ中心のため）。
                  </li>
                </ol>
              </section>

              <section className="help-section">
                <h3>中断パックの再開</h3>
                <ol>
                  <li>
                    サイドバー「<strong>中断したパックを再開</strong>」で USB などの親フォルダを選び、未完了の
                    .dmig を一覧します。
                  </li>
                  <li>カードから再開を選ぶと、未完了チャンクだけ書き出しを続けます。</li>
                  <li>
                    Import ページで中断パック（ok_partial）を開いた場合も、再開ダイアログから同じ再開処理に進めます（入口が違うだけです）。
                  </li>
                </ol>
              </section>

              <section className="help-section">
                <h3>よくある質問</h3>
                <dl className="help-faq">
                  <dt>USB はどの形式でもよいですか？</dt>
                  <dd>
                    .dmig は通常のフォルダです。NTFS / exFAT など、両方の PC で読めるファイルシステムの USB
                    にフォルダごとコピーしてください。
                  </dd>
                  <dt>中断パックを Import から開くのと Resume ページの違いは？</dt>
                  <dd>
                    どちらも同じエクスポート再開処理です。Resume ページはフォルダを選んで中断パックを探す専用入口、Import
                    は読み込み前に中断を検知したときのショートカットです。
                  </dd>
                  <dt>Compose 同梱パックを Import ページで開いてはいけないのはなぜ？</dt>
                  <dd>
                    Import ページはイメージの読み込み向けです。Compose プロジェクトごと戻す場合は「プロジェクトを選ぶ」のインポートタブを使ってください。
                  </dd>
                </dl>
              </section>

              <p className="help-static-guides-note">
                各作業ページの右上にも、その画面に合わせた詳しい説明（解説パネル）があります。用語の意味は「用語集」タブまたは下の一覧で確認できます。
              </p>
            </div>
          )}

          {tab === 'glossary' && (
            <div className="help-glossary-panel" role="tabpanel" aria-labelledby="help-tab-glossary">
              <label className="glossary-filter-label" htmlFor="glossary-filter-input">
                用語を検索
              </label>
              <input
                id="glossary-filter-input"
                type="search"
                className="glossary-filter"
                aria-label="用語を検索"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                autoComplete="off"
              />

              {filteredEntries.length === 0 ? (
                <p className="glossary-empty">該当する用語がありません</p>
              ) : (
                <div className="glossary-list">
                  {filteredEntries.map((entry) => (
                    <article key={entry.id} id={entry.id} className="glossary-entry">
                      <h3 className="glossary-term">{entry.term}</h3>
                      {entry.reading ? (
                        <p className="glossary-reading" lang="ja">
                          {entry.reading}
                        </p>
                      ) : null}
                      <p className="glossary-body">{entry.body}</p>
                      {entry.relatedPage && onNavigate ? (
                        <button
                          type="button"
                          className="glossary-related-link"
                          onClick={() => onNavigate(entry.relatedPage!)}
                        >
                          関連ページ: {RELATED_PAGE_LABELS[entry.relatedPage]}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="page-guide-rail" aria-label="ヘルプのヒント">
          <div className="page-guide help-rail-hint">
            <p>
              <strong>用語集</strong>タブではキーワードで絞り込めます。URL の #用語id で特定の用語へジャンプできます。
            </p>
            <p>manifest や partialState など、サイドバーから退けた技術用語はここで説明しています。</p>
          </div>
        </aside>
      </div>
    </div>
  );
};
