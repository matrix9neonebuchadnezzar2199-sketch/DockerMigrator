import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Sidebar } from './components/Sidebar.js';
import { NextStepFooter } from './components/NextStepFooter.js';
import { ExportPage } from './pages/ExportPage.js';
import { ImportPage } from './pages/ImportPage.js';
import { ComposePage } from './pages/ComposePage.js';
import { ResumePage } from './pages/ResumePage.js';
import { HelpPage } from './pages/HelpPage.js';
import { SourceOverviewPage } from './pages/SourceOverviewPage.js';
import { TargetOverviewPage } from './pages/TargetOverviewPage.js';

export type PageKey =
  | 'source-overview'
  | 'compose'
  | 'export'
  | 'resume'
  | 'target-overview'
  | 'import'
  | 'help';

export const App: React.FC = () => {
  const [page, setPage] = useState<PageKey>('source-overview');
  const [dockerVersion, setDockerVersion] = useState<string>('未接続');
  /** 一度でも開いたページはアンマウントせず状態を保持する */
  const [composeVisited, setComposeVisited] = useState(page === 'compose');

  useEffect(() => {
    void window.dmig.ping().then((r) => {
      if (r.ok) setDockerVersion(r.data.version);
      else setDockerVersion(`エラー: ${r.error.code}`);
    });
  }, []);

  useEffect(() => {
    if (page === 'compose') {
      setComposeVisited(true);
    }
  }, [page]);

  return (
    <ErrorBoundary>
      <Sidebar page={page} onChange={setPage} dockerVersion={dockerVersion} />
      <div className="main">
        <div className="main-body">
          {page === 'source-overview' && <SourceOverviewPage onNavigate={setPage} />}
          {page === 'target-overview' && <TargetOverviewPage onNavigate={setPage} />}
          {page === 'export' && <ExportPage />}
          {page === 'import' && <ImportPage />}
          {composeVisited && (
            <div className="main-page-panel" hidden={page !== 'compose'} aria-hidden={page !== 'compose'}>
              <ComposePage />
            </div>
          )}
          {page === 'resume' && <ResumePage />}
          {page === 'help' && <HelpPage onNavigate={setPage} />}
        </div>
        <NextStepFooter page={page} onNavigate={setPage} />
      </div>
    </ErrorBoundary>
  );
};
