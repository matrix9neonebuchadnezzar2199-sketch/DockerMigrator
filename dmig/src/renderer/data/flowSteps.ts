import type { PageKey } from '../App.js';
import { NEXT_STEPS_BY_PAGE } from './nextSteps.js';

/** パイプライン内の 1 ステップ表示。 */
export type FlowStepDefinition = {
  index: number;
  label: string;
};

/** 移行元作業フロー（`flowStep.group === 'source'`）。 */
export const SOURCE_FLOW_PIPELINE: FlowStepDefinition[] = [
  { index: 1, label: 'プロジェクトを選ぶ' },
  { index: 2, label: 'パックを書き出す' },
  { index: 3, label: '中断パックを再開' },
];

/** 移行先作業フロー（`flowStep.group === 'target'`）。 */
export const TARGET_FLOW_PIPELINE: FlowStepDefinition[] = [
  { index: 1, label: 'パックを読み込む' },
];

export type FlowIndicatorState = {
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
    groupLabel: flowRef.group === 'source' ? '移行元の作業フロー' : '移行先の作業フロー',
    steps,
    currentIndex: flowRef.index,
  };
}
