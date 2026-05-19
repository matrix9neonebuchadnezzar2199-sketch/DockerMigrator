import React from 'react';
import type { PageKey } from '../App.js';

function NavItem({
  page,
  current,
  label,
  onChange,
}: {
  page: PageKey;
  current: PageKey;
  label: React.ReactNode;
  onChange: (p: PageKey) => void;
}) {
  const active = current === page;
  return (
    <div
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={() => onChange(page)}
      onKeyDown={(e) => e.key === 'Enter' && onChange(page)}
      role="button"
      tabIndex={0}
    >
      {label}
    </div>
  );
}

export const Sidebar: React.FC<{
  page: PageKey;
  onChange: (p: PageKey) => void;
  dockerVersion: string;
}> = ({ page, onChange, dockerVersion }) => (
  <aside className="sidebar">
    <h1>🐳 dmig</h1>
    <nav className="sidebar-nav" aria-label="メインメニュー">
      <section className="sidebar-group" aria-labelledby="sidebar-group-source">
        <h2 id="sidebar-group-source" className="sidebar-group-title">
          <span aria-hidden="true">📤</span> 移行元での作業
        </h2>
        <NavItem page="source-overview" current={page} label="概要" onChange={onChange} />
        <NavItem page="compose" current={page} label="プロジェクトを選ぶ" onChange={onChange} />
        <NavItem page="export" current={page} label="パックを書き出す" onChange={onChange} />
        <NavItem page="resume" current={page} label="中断したパックを再開" onChange={onChange} />
      </section>

      <section className="sidebar-group" aria-labelledby="sidebar-group-target">
        <h2 id="sidebar-group-target" className="sidebar-group-title">
          <span aria-hidden="true">📥</span> 移行先での作業
        </h2>
        <NavItem page="target-overview" current={page} label="概要" onChange={onChange} />
        <NavItem page="import" current={page} label="パックを読み込む" onChange={onChange} />
      </section>

      <section className="sidebar-group sidebar-group-common" aria-labelledby="sidebar-group-common">
        <h2 id="sidebar-group-common" className="sidebar-group-title">
          <span aria-hidden="true">⚙</span> 共通
        </h2>
        <NavItem
          page="help"
          current={page}
          label={
            <>
              <span aria-hidden="true">❓ </span>
              ヘルプ / 用語集
            </>
          }
          onChange={onChange}
        />
      </section>
    </nav>
    <div className="sidebar-docker-version">
      Docker: {dockerVersion}
    </div>
  </aside>
);
