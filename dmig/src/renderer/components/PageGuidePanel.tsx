import React, { useState } from 'react';

/**
 * ページ単位の詳細解説（メイン右の `page-guide-rail` 内に配置想定）。
 * 各項目のヘルプマークは置かず、ここに表・アイコン付きで集約する。
 */
export const PageGuidePanel: React.FC<{
  /** トグル行に表示する短いラベル */
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => {
  const [open, setOpen] = useState(true);

  return (
    <aside className="page-guide">
      <button
        type="button"
        className="page-guide-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="page-guide-toggle-chevron" aria-hidden="true">
          {open ? '▼' : '▶'}
        </span>
        <span className="page-guide-toggle-label">{title}</span>
      </button>
      {open && <div className="page-guide-body">{children}</div>}
    </aside>
  );
};
