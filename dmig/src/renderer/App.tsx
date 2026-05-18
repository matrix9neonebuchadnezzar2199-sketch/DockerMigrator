import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Sidebar } from './components/Sidebar.js';
import { ExportPage } from './pages/ExportPage.js';
import { ImportPage } from './pages/ImportPage.js';
import { ComposePage } from './pages/ComposePage.js';
import { ResumePage } from './pages/ResumePage.js';

export type PageKey = 'export' | 'import' | 'compose' | 'resume';

export const App: React.FC = () => {
  const [page, setPage] = useState<PageKey>('compose');
  const [dockerVersion, setDockerVersion] = useState<string>('未接続');

  useEffect(() => {
    void window.dmig.ping().then((r) => {
      if (r.ok) setDockerVersion(r.data.version);
      else setDockerVersion(`エラー: ${r.error.code}`);
    });
  }, []);

  return (
    <ErrorBoundary>
      <Sidebar page={page} onChange={setPage} dockerVersion={dockerVersion} />
      <div className="main">
        {page === 'export' && <ExportPage />}
        {page === 'import' && <ImportPage />}
        {page === 'compose' && <ComposePage />}
        {page === 'resume' && <ResumePage />}
      </div>
    </ErrorBoundary>
  );
};
