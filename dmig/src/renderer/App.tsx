import React, { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Sidebar } from './components/Sidebar.js';
import { NextStepFooter } from './components/NextStepFooter.js';
import { StepIndicator } from './components/StepIndicator.js';
import { ExportPage } from './pages/ExportPage.js';
import { ImportPage } from './pages/ImportPage.js';
import { ComposePage } from './pages/ComposePage.js';
import { ResumePage } from './pages/ResumePage.js';
import { HelpPage } from './pages/HelpPage.js';
import { SourceOverviewPage } from './pages/SourceOverviewPage.js';
import { TargetOverviewPage } from './pages/TargetOverviewPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { LogsPage } from './pages/LogsPage.js';
import { DryRunPage } from './pages/DryRunPage.js';
import { RollbackPage } from './pages/RollbackPage.js';
import { DynamicCtaProvider } from './context/DynamicCtaContext.js';
import { LogBufferProvider } from './hooks/useLogBuffer.js';

export type PageKey =
  | 'source-overview'
  | 'compose'
  | 'export'
  | 'resume'
  | 'target-overview'
  | 'import'
  | 'help'
  | 'settings'
  | 'logs'
  | 'dryrun'
  | 'rollback';

const VALID_PAGES: PageKey[] = [
  'source-overview',
  'compose',
  'export',
  'resume',
  'target-overview',
  'import',
  'help',
  'settings',
  'logs',
  'dryrun',
  'rollback',
];

function isPageKey(value: string): value is PageKey {
  return (VALID_PAGES as string[]).includes(value);
}

export const App: React.FC = () => {
  const [page, setPage] = useState<PageKey>('source-overview');
  const [appReady, setAppReady] = useState(false);
  const [dockerVersion, setDockerVersion] = useState<string>('未接続');
  const [dockerConnected, setDockerConnected] = useState(false);
  const [dockerPinging, setDockerPinging] = useState(false);
  const [composeVisited, setComposeVisited] = useState(false);

  const pingDocker = useCallback(async () => {
    setDockerPinging(true);
    const r = await window.dmig.ping();
    setDockerPinging(false);
    if (r.ok) {
      setDockerVersion(r.data.version);
      setDockerConnected(true);
    } else {
      setDockerVersion(`エラー: ${r.error.code}`);
      setDockerConnected(false);
    }
  }, []);

  useEffect(() => {
    void pingDocker();
  }, [pingDocker]);

  useEffect(() => {
    void window.dmig.getSettings().then((r) => {
      if (r.ok && r.data.restoreLastPage && r.data.lastPage && isPageKey(r.data.lastPage)) {
        setPage(r.data.lastPage);
        if (r.data.lastPage === 'compose') setComposeVisited(true);
      }
      setAppReady(true);
    });
  }, []);

  useEffect(() => {
    if (!appReady) return;
    void window.dmig.updateSettings({ lastPage: page });
  }, [page, appReady]);

  useEffect(() => {
    if (page === 'compose') {
      setComposeVisited(true);
    }
  }, [page]);

  if (!appReady) {
    return (
      <div className="main app-loading">
        <p>読み込み中…</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <LogBufferProvider>
        <DynamicCtaProvider>
          <Sidebar
            page={page}
            onChange={setPage}
            dockerVersion={dockerPinging ? '接続確認中…' : dockerVersion}
            dockerPinging={dockerPinging}
            onRetryDocker={() => void pingDocker()}
          />
          <div className="main">
            <div className="main-body">
          <StepIndicator page={page} onNavigate={setPage} />
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
          {page === 'settings' && <SettingsPage />}
              {page === 'logs' && <LogsPage />}
              {page === 'dryrun' && <DryRunPage />}
              {page === 'rollback' && <RollbackPage />}
            </div>
            <NextStepFooter page={page} onNavigate={setPage} dockerConnected={dockerConnected} />
          </div>
        </DynamicCtaProvider>
      </LogBufferProvider>
    </ErrorBoundary>
  );
};
