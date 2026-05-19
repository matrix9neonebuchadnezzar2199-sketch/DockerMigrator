import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Sidebar } from './components/Sidebar.js';
import { WelcomeWizard } from './components/WelcomeWizard.js';
import { ExportPage } from './pages/ExportPage.js';
import { ImportPage } from './pages/ImportPage.js';
import { ComposePage } from './pages/ComposePage.js';
import { ResumePage } from './pages/ResumePage.js';
import { useWelcomeWizard } from './hooks/useWelcomeWizard.js';

export type PageKey = 'export' | 'import' | 'compose' | 'resume';

export const App: React.FC = () => {
  const [page, setPage] = useState<PageKey>('compose');
  const [dockerVersion, setDockerVersion] = useState<string>('未接続');
  /** 一度でも開いたページはアンマウントせず状態を保持する */
  const [composeVisited, setComposeVisited] = useState(page === 'compose');
  const { open: wizardOpen, checkAndMaybeOpen, completeAndClose, forceOpen } = useWelcomeWizard();

  useEffect(() => {
    void window.dmig.ping().then((r) => {
      if (r.ok) setDockerVersion(r.data.version);
      else setDockerVersion(`エラー: ${r.error.code}`);
    });
  }, []);

  useEffect(() => {
    void checkAndMaybeOpen();
  }, [checkAndMaybeOpen]);

  useEffect(() => {
    if (page === 'compose') {
      setComposeVisited(true);
    }
  }, [page]);

  return (
    <ErrorBoundary>
      <Sidebar
        page={page}
        onChange={setPage}
        dockerVersion={dockerVersion}
        navDisabled={wizardOpen}
        onShowWelcomeWizard={forceOpen}
      />
      <div className="main">
        {page === 'export' && <ExportPage />}
        {page === 'import' && <ImportPage />}
        {composeVisited && (
          <div className="main-page-panel" hidden={page !== 'compose'} aria-hidden={page !== 'compose'}>
            <ComposePage />
          </div>
        )}
        {page === 'resume' && <ResumePage />}
      </div>
      {wizardOpen && (
        <WelcomeWizard
          onSelectSource={() => setPage('compose')}
          onSelectTarget={() => setPage('import')}
          onSkip={() => {}}
          onComplete={completeAndClose}
        />
      )}
    </ErrorBoundary>
  );
};
