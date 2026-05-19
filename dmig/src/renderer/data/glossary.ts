import type { PageKey } from '../App.js';

/** 用語集の 1 エントリ。 */
export type GlossaryEntry = {
  id: string;
  term: string;
  reading?: string;
  body: string;
  relatedPage?: PageKey;
};

/** 用語集（表示順）。 */
export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    id: 'dmig-package',
    term: '.dmig パッケージ',
    reading: 'でぃーえむあいじー',
    body:
      'Docker のイメージや Compose プロジェクトをまとめた移行用フォルダ（またはそのフォルダに付けた名前）です。中に manifest.json やデータファイルが入ります。USB などにフォルダごとコピーして別の PC へ持ち運びます。',
    relatedPage: 'export',
  },
  {
    id: 'manifest',
    term: 'manifest（manifest.json）',
    reading: 'まにふぇすと',
    body:
      'パッケージの「設計図」となる JSON ファイルです。どのイメージ・ボリューム・Compose プロジェクトが含まれるか、中断状態（partialState）があるかなどが書かれています。Import や再開の前にこのファイルを読み取って検証します。',
    relatedPage: 'import',
  },
  {
    id: 'partial-state',
    term: '中断状態（partialState）',
    reading: 'ちゅうだんじょうたい',
    body:
      'エクスポートが途中で止まったときに manifest に記録される情報です。「どのチャンクまで書き終わったか」が分かるので、同じ PC 上でエクスポートを再開できます。',
    relatedPage: 'source-overview',
  },
  {
    id: 'pending-chunks',
    term: '未完了チャンク（pendingChunks）',
    reading: 'みかんりょうちゃんく',
    body:
      'まだ書き出しが終わっていないデータのかたまりです。中断パックを再開するとき、残っているチャンクだけを続きから処理します。',
    relatedPage: 'source-overview',
  },
  {
    id: 'interrupted-pack',
    term: '中断パック',
    reading: 'ちゅうだんぱっく',
    body:
      'エクスポートが完了していない .dmig パッケージのことです。サイドバーの「中断したパックを再開」からフォルダを選んで続きから書き出せます。Import 画面から開いた場合も再開できます。',
    relatedPage: 'source-overview',
  },
  {
    id: 'compose-project',
    term: 'Compose プロジェクト',
    reading: 'こんぽーずぷろじぇくと',
    body:
      'docker compose でまとめて動かしているアプリの単位です。本ツールは Docker が付けた com.docker.compose.project ラベルから、稼働中・過去に起動したプロジェクトを検出します。',
    relatedPage: 'compose',
  },
  {
    id: 'bind-mount',
    term: 'バインドマウント（bind mount）',
    reading: 'ばいんどまうんと',
    body:
      'Compose のサービスがホスト PC 上のフォルダを直接マウントする設定です。エクスポート時に「フォルダの中身を tar で同梱するか」「パスだけ記録するか」を選べます。',
    relatedPage: 'compose',
  },
  {
    id: 'secret-scan',
    term: 'シークレット検出（.env）',
    reading: 'しーくれっとけんしゅつ',
    body:
      'Compose プロジェクト付近の .env などから、パスワードや API キーらしき文字列を見つける機能です。USB 移行では秘密情報の扱いを慎重に選べます。',
    relatedPage: 'compose',
  },
  {
    id: 'docker-image',
    term: 'Docker イメージ（repository:tag）',
    reading: 'どっかーいめーじ',
    body:
      'コンテナの元になるテンプレートです。一覧では nginx:latest のような名前で表示されます。エクスポートで選んだイメージだけが .dmig に含まれます。',
    relatedPage: 'export',
  },
  {
    id: 'named-volume',
    term: '名前付きボリューム',
    reading: 'なまえつきぼりゅーむ',
    body:
      'Docker が管理する永続データ領域です。Compose プロジェクトをまるごとパックするとき、必要なボリュームの中身も一緒に書き出します。',
    relatedPage: 'compose',
  },
  {
    id: 'export',
    term: 'エクスポート（書き出し）',
    reading: 'えくすぽーと',
    body:
      'この PC の Docker からデータを取り出して .dmig パッケージを作る作業です。移行元の PC で行います。',
    relatedPage: 'export',
  },
  {
    id: 'import',
    term: 'インポート（読み込み）',
    reading: 'いんぽーと',
    body:
      '別の PC で作った .dmig からイメージや Compose をこの PC の Docker に戻す作業です。移行先の PC で行います。',
    relatedPage: 'import',
  },
  {
    id: 'snapshot',
    term: 'スナップショット（差分の基準）',
    reading: 'すなっぷしょっと',
    body:
      '過去のエクスポート状態を記録したものです。Compose ページで「前回から変わったプロジェクトだけ」を選んで書き出すときの比較基準になります。',
    relatedPage: 'compose',
  },
  {
    id: 'probe-package',
    term: 'パッケージ検証（probe）',
    reading: 'ぱっけーじけんしょう',
    body:
      'manifest.json を読み、パッケージが完了済みか中断中か壊れていないかを調べる処理です。Import の「読み込み」や中断パック一覧の前に実行されます。',
    relatedPage: 'import',
  },
  {
    id: 'resume-export',
    term: 'エクスポート再開',
    reading: 'えくすぽーとさいかい',
    body:
      '中断したパッケージの書き出しを続きから行う機能です。同じ出力先フォルダに対して、未完了チャンクだけを追加します。',
    relatedPage: 'source-overview',
  },
  {
    id: 'schema-version',
    term: 'スキーマバージョン（schemaVersion）',
    reading: 'すきーまばーじょん',
    body:
      'manifest の形式の版番号です。1.0 と 1.1 など、ツールのバージョンに合わせた形式しか正しく読めない場合があります。',
  },
  {
    id: 'chunk-ref',
    term: 'チャンク参照（ChunkRef）',
    reading: 'ちゃんくさんしょう',
    body:
      'manifest 内で「どのイメージ・ボリューム・Compose の何番目のかたまりか」を指す記述です。中断・再開の単位になります。',
  },
  {
    id: 'preflight',
    term: '事前検証（preflight）',
    reading: 'じぜんけんしょう',
    body:
      '書き出し前に USB の空き容量やおおよそのサイズを確認する処理です。容量不足を早めに知るために使います。',
    relatedPage: 'compose',
  },
  {
    id: 'dry-run',
    term: 'ドライラン',
    reading: 'どらいらん',
    body:
      '本番の書き出しを行わず、容量・シークレット・bind mount・パッケージ状態などを検査する機能です。問題を検出するのみで、自動修正や実行のブロックはしません。',
    relatedPage: 'dryrun',
  },
];

/** 用語名・本文・よみの部分一致フィルタ。 */
export function filterGlossaryEntries(entries: GlossaryEntry[], query: string): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.term.toLowerCase().includes(q) ||
      e.body.toLowerCase().includes(q) ||
      (e.reading?.includes(q) ?? false),
  );
}
