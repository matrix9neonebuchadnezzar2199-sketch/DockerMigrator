import React from 'react';

/**
 * ツールチップ（title）で補足説明を出す小さなヘルプボタン。
 * アイコンは title / aria-label と一致させる。
 */
export const HelpTip: React.FC<{ explanation: string }> = ({ explanation }) => (
  <button type="button" className="help-tip" title={explanation} aria-label={explanation}>
    📖
  </button>
);
