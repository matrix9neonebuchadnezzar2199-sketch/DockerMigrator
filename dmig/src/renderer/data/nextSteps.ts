import type { PageKey } from '../App.js';

/** Step D（StepIndicator）用フロー内ステップ参照。ラベルは `flowSteps.ts`。 */
export type FlowStepRef = {
  group: 'source' | 'target';
  index: number;
};

/** ページごとの「次にやること」定義（完全静的）。 */
export type NextStepEntry = {
  description: string;
  ctaLabel?: string;
  ctaTarget?: PageKey;
  /** Step D 用。overview / help は省略可。 */
  flowStep?: FlowStepRef;
  /** false のときフッター非表示（既定 true）。 */
  showFooter?: boolean;
};

export const NEXT_STEPS_BY_PAGE: Record<PageKey, NextStepEntry> = {
  'source-overview': {
    description: 'まずプロジェクト一覧を確認しましょう。',
    ctaLabel: 'プロジェクトを選ぶ',
    ctaTarget: 'compose',
  },
  compose: {
    description:
      'このページの手順 1 から順に .dmig パックを書き出してください。Docker イメージだけの書き出しはサイドバー「パックを書き出す」を使います。',
    showFooter: false,
    flowStep: { group: 'source', index: 1 },
  },
  export: {
    description: '書き出し完了後、.dmig フォルダを USB 等にコピーしてください。',
    flowStep: { group: 'source', index: 2 },
  },
  resume: {
    description: 'フォルダを選び、中断したパックを一覧から再開できます。',
    flowStep: { group: 'source', index: 3 },
  },
  'target-overview': {
    description: '持ち込んだ .dmig パックを選んで内容を確認しましょう。',
    ctaLabel: 'パックを読み込む',
    ctaTarget: 'import',
    flowStep: { group: 'target', index: 1 },
  },
  import: {
    description: '内容を確認したら、ページ内の取り込みを実行してください。',
    flowStep: { group: 'target', index: 2 },
  },
  help: {
    description: '',
    showFooter: false,
  },
  settings: {
    description: '',
    showFooter: false,
  },
  logs: {
    description: '',
    showFooter: false,
  },
  dryrun: {
    description: '',
    showFooter: false,
  },
  rollback: {
    description: 'フォルダを選び、取り消し可能なパックからロールバックを実行できます。',
    showFooter: false,
  },
};

/** フッター表示用エントリ。非表示ページは null。 */
export function getNextStepForPage(page: PageKey): NextStepEntry | null {
  const entry = NEXT_STEPS_BY_PAGE[page];
  if (entry.showFooter === false) return null;
  return entry;
}
