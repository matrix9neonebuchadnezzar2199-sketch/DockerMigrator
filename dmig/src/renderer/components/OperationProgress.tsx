import React from 'react';
import type { ProgressEvent } from '../../shared/types.js';
import { ProgressBar, type ProgressBarProps } from './ProgressBar.js';

type OperationProgressProps = {
  /** true の間だけ表示 */
  active: boolean;
  progress: ProgressEvent | null;
  /** progress が null のときのプレースホルダ（読み込み開始直後など） */
  fallback?: ProgressEvent | null;
  variant?: ProgressBarProps['variant'];
};

/**
 * 長時間操作の進捗表示（ページ先頭の inline バーを想定）。
 */
export const OperationProgress: React.FC<OperationProgressProps> = ({
  active,
  progress,
  fallback = null,
  variant = 'inline',
}) => {
  if (!active) {
    return null;
  }
  return <ProgressBar variant={variant} progress={progress ?? fallback} />;
};
