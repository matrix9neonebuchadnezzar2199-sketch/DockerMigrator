import React from 'react';
import type { PageKey } from '../App.js';

export const Sidebar: React.FC<{
  page: PageKey;
  onChange: (p: PageKey) => void;
  dockerVersion: string;
}> = ({ page, onChange, dockerVersion }) => (
  <aside className="sidebar">
    <h1>🐳 dmig</h1>
    <div
      className={`nav-item ${page === 'export' ? 'active' : ''}`}
      onClick={() => onChange('export')}
      onKeyDown={(e) => e.key === 'Enter' && onChange('export')}
      role="button"
      tabIndex={0}
    >
      📤 イメージ エクスポート
    </div>
    <div
      className={`nav-item ${page === 'import' ? 'active' : ''}`}
      onClick={() => onChange('import')}
      onKeyDown={(e) => e.key === 'Enter' && onChange('import')}
      role="button"
      tabIndex={0}
    >
      📥 イメージ インポート
    </div>
    <div
      className={`nav-item ${page === 'compose' ? 'active' : ''}`}
      onClick={() => onChange('compose')}
      onKeyDown={(e) => e.key === 'Enter' && onChange('compose')}
      role="button"
      tabIndex={0}
    >
      🎯 Compose まるごと
    </div>
    <div style={{ position: 'absolute', bottom: 16, left: 16, fontSize: 11, color: '#6c7086' }}>
      Docker: {dockerVersion}
    </div>
  </aside>
);
