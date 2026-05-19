import React from 'react';
import {
  Download,
  FolderOpen,
  HelpCircle,
  LayoutList,
  Package,
  PlayCircle,
  Settings,
  Upload,
} from 'lucide-react';
import type { PageKey } from '../App.js';

const ICON_SIZE = 16;

function NavItem({
  page,
  current,
  label,
  icon,
  onChange,
}: {
  page: PageKey;
  current: PageKey;
  label: string;
  icon: React.ReactNode;
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
      <span className="nav-item-icon" aria-hidden="true">
        {icon}
      </span>
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
    <h1 className="sidebar-brand">
      <Package size={18} aria-hidden="true" /> dmig
    </h1>
    <nav className="sidebar-nav" aria-label="メインメニュー">
      <section className="sidebar-group" aria-labelledby="sidebar-group-source">
        <h2 id="sidebar-group-source" className="sidebar-group-title">
          <Upload size={ICON_SIZE} aria-hidden="true" /> 移行元での作業
        </h2>
        <NavItem
          page="source-overview"
          current={page}
          label="概要"
          icon={<LayoutList size={ICON_SIZE} />}
          onChange={onChange}
        />
        <NavItem
          page="compose"
          current={page}
          label="プロジェクトを選ぶ"
          icon={<FolderOpen size={ICON_SIZE} />}
          onChange={onChange}
        />
        <NavItem
          page="export"
          current={page}
          label="パックを書き出す"
          icon={<Package size={ICON_SIZE} />}
          onChange={onChange}
        />
        <NavItem
          page="resume"
          current={page}
          label="中断したパックを再開"
          icon={<PlayCircle size={ICON_SIZE} />}
          onChange={onChange}
        />
      </section>

      <section className="sidebar-group" aria-labelledby="sidebar-group-target">
        <h2 id="sidebar-group-target" className="sidebar-group-title">
          <Download size={ICON_SIZE} aria-hidden="true" /> 移行先での作業
        </h2>
        <NavItem
          page="target-overview"
          current={page}
          label="概要"
          icon={<LayoutList size={ICON_SIZE} />}
          onChange={onChange}
        />
        <NavItem
          page="import"
          current={page}
          label="パックを読み込む"
          icon={<Download size={ICON_SIZE} />}
          onChange={onChange}
        />
      </section>

      <section className="sidebar-group sidebar-group-common" aria-labelledby="sidebar-group-common">
        <h2 id="sidebar-group-common" className="sidebar-group-title">
          <Settings size={ICON_SIZE} aria-hidden="true" /> 共通
        </h2>
        <NavItem
          page="help"
          current={page}
          label="ヘルプ / 用語集"
          icon={<HelpCircle size={ICON_SIZE} />}
          onChange={onChange}
        />
        <NavItem
          page="settings"
          current={page}
          label="設定"
          icon={<Settings size={ICON_SIZE} />}
          onChange={onChange}
        />
      </section>
    </nav>
    <div className="sidebar-docker-version">Docker: {dockerVersion}</div>
  </aside>
);
