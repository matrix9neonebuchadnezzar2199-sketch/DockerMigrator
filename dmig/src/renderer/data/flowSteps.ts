import type { PageKey } from '../App.js';
import { NEXT_STEPS_BY_PAGE } from './nextSteps.js';

/** パイプライン内の 1 ステップ表示。 */
export type FlowStepDefinition = {
  index: number;
  label: string;
};

/** ステップ番号から遷移先 PageKey（Step D: クリックナビ）。 */
export const FLOW_STEP_PAGE: Record<'source' | 'target', Record<number, PageKey>> = {
  source: {
    1: 'compose',
    2: 'export',
    3: 'resume',
  },
  target: {
    1: 'target-overview',
    2: 'import',
  },
};

/** 移行元作業フロー（`flowStep.group === 'source'`）。 */
export const SOURCE_FLOW_PIPELINE: FlowStepDefinition[] = [
  { index: 1, label: 'プロジェクトを選ぶ' },
  { index: 2, label: 'パックを書き出す' },
  { index: 3, label: '中断パックを再開' },
];

/** 移行先作業フロー（`flowStep.group === 'target'`）。 */
export const TARGET_FLOW_PIPELINE: FlowStepDefinition[] = [
  { index: 1, label: '移行先の概要' },
  { index: 2, label: 'パックを読み込む' },
];

export type FlowIndicatorState = {
  group: 'source' | 'target';
  groupLabel: string;
  steps: FlowStepDefinition[];
  currentIndex: number;
};

/** 現在ページ用のインジケータ状態。`flowStep` が無いページは null。 */
export function getFlowIndicatorForPage(page: PageKey): FlowIndicatorState | null {
  const flowRef = NEXT_STEPS_BY_PAGE[page].flowStep;
  if (!flowRef) return null;

  const steps = flowRef.group === 'source' ? SOURCE_FLOW_PIPELINE : TARGET_FLOW_PIPELINE;
  return {
    group: flowRef.group,
    groupLabel: flowRef.group === 'source' ? '移行元の作業フロー' : '移行先の作業フロー',
    steps,
    currentIndex: flowRef.index,
  };
}

/** ステップクリック時の遷移先。定義外は null。 */
export function getPageForFlowStep(group: 'source' | 'target', index: number): PageKey | null {
  return FLOW_STEP_PAGE[group][index] ?? null;
}
