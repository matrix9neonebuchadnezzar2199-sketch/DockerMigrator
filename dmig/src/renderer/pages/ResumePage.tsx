import React, { useEffect, useRef, useState } from 'react';
import type { DmigErrorPayload, ProbeSummary, ProgressEvent } from '../../shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ResumeConfirmDialog } from '../components/ResumeConfirmDialog.js';
import { labelInterruptionReason, warningLabel } from '../lib/i18n/resume.js';

function dirBasename(packageDir: string): string {
  const norm = packageDir.replace(/[/\\]+$/, '');
  const i = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  return i >= 0 ? norm.slice(i + 1) : norm;
}

export const ResumePage: React.FC = () => {
  const [rootDir, setRootDir] = useState('');
  const [packages, setPackages] = useState<ProbeSummary[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<DmigErrorPayload | null>(null);

  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeSummary, setResumeSummary] = useState<ProbeSummary | null>(null);
  const [resumeRunning, setResumeRunning] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<ProgressEvent | null>(null);
  const [resumeJobToken, setResumeJobToken] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const resumeRunningRef = useRef(false);
  useEffect(() => {
    resumeRunningRef.current = resumeRunning;
  }, [resumeRunning]);

  useEffect(() => {
    return window.dmig.onProgress((ev) => {
      if (resumeRunningRef.current) setResumeProgress(ev);
    });
  }, []);

  const pickFolderAndScan = async () => {
    setError(null);
    setDone(null);
    const picked = await window.dmig.selectDirectory({
      title: '中断パックを探すフォルダを選択',
      defaultPath: rootDir || undefined,
    });
    if (!picked.ok) {
      setError(picked.error);
      return;
    }
    if (!picked.data) return;

    setRootDir(picked.data);
    await runScan(picked.data);
  };

  const runScan = async (dir: string) => {
    setScanning(true);
    setScanned(false);
    setPackages([]);
    setWarnings([]);
    const r = await window.dmig.listResumablePackages({ rootDir: dir, maxDepth: 2 });
    setScanning(false);
    setScanned(true);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPackages(r.data.packages);
    setWarnings(r.data.warnings);
    if (r.data.warnings.length > 0) setWarningsOpen(true);
  };

  const openResumeDialog = (summary: ProbeSummary) => {
    setResumeSummary(summary);
    setResumeDialogOpen(true);
    setResumeProgress(null);
  };

  const onConfirmResume = async () => {
    if (!resumeSummary) return;
    const jobToken = crypto.randomUUID();
    setResumeJobToken(jobToken);
    setResumeProgress(null);
    setResumeRunning(true);
    const r = await window.dmig.resumeExport({
      packageDir: resumeSummary.packageDir,
      jobToken,
      compressionLevel: 3,
    });
    setResumeRunning(false);
    setResumeJobToken(null);
    if (r.ok) {
      setResumeDialogOpen(false);
      setResumeSummary(null);
      setDone('エクスポートの再開が完了しました。');
      if (rootDir) void runScan(rootDir);
    } else if (r.error.code === ErrorCodes.JOB_CANCELLED) {
      setResumeDialogOpen(false);
      setResumeSummary(null);
      setDone('再開ジョブを中止しました。');
    } else {
      setError(r.error);
    }
  };

  const onCancelResumeJob = () => {
    if (resumeJobToken) void window.dmig.cancel(resumeJobToken);
  };

  const closeResumeDialog = () => {
    if (resumeRunning) return;
    setResumeDialogOpen(false);
    setResumeSummary(null);
  };

  return (
    <div className="page-shell">
      <div className="page-primary">
        <h2>▶ 中断したパックを再開</h2>
        <p className="page-lead">
          前回のエクスポートが完了していないパックを探して、続きから書き出します。
        </p>

        <div className="card">
          <button type="button" onClick={() => void pickFolderAndScan()} disabled={scanning || resumeRunning}>
            {scanning ? '検索中...' : 'フォルダを選んで探す'}
          </button>
          {rootDir && (
            <p className="resume-scan-root" style={{ marginTop: 10, fontSize: 13, color: '#a6adc8' }}>
              検索先: <code>{rootDir}</code>
            </p>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="card resume-warnings">
            <button
              type="button"
              className="resume-warnings-toggle"
              onClick={() => setWarningsOpen((o) => !o)}
              aria-expanded={warningsOpen}
            >
              {warningsOpen ? '▼' : '▶'} 注意 ({warnings.length} 件)
            </button>
            {warningsOpen && (
              <ul style={{ margin: '8px 0 0 18px', fontSize: 13 }}>
                {warnings.map((w) => (
                  <li key={w}>{warningLabel(w)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {scanned && packages.length === 0 && !scanning && (
          <div className="card" style={{ color: '#a6adc8' }}>
            このフォルダに中断中のパックはありません。
          </div>
        )}

        {packages.map((pkg) => (
          <div className="card resume-package-card" key={pkg.packageDir}>
            <div className="resume-package-title">
              <strong>{dirBasename(pkg.packageDir)}</strong>
            </div>
            <div className="resume-package-path">{pkg.packageDir}</div>
            <table className="guide-table" style={{ marginTop: 10 }}>
              <tbody>
                <tr>
                  <th scope="row">未完了の数</th>
                  <td>{pkg.pendingChunkCount}</td>
                </tr>
                {pkg.lastUpdatedAt && (
                  <tr>
                    <th scope="row">最終更新</th>
                    <td>{pkg.lastUpdatedAt}</td>
                  </tr>
                )}
                <tr>
                  <th scope="row">中断理由</th>
                  <td>{labelInterruptionReason(pkg.interruptionReason)}</td>
                </tr>
              </tbody>
            </table>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => openResumeDialog(pkg)}
              disabled={resumeRunning}
            >
              再開する
            </button>
          </div>
        ))}

        <ProgressBar progress={resumeRunning ? resumeProgress : null} />
        <ErrorBox error={error} />
        {done && (
          <div className="card" style={{ background: '#a6e3a1', color: '#1e1e2e' }}>
            ✅ {done}
          </div>
        )}
      </div>

      {resumeDialogOpen && resumeSummary && (
        <ResumeConfirmDialog
          summary={resumeSummary}
          busy={resumeRunning}
          progress={resumeProgress}
          jobToken={resumeJobToken}
          onConfirmResume={() => void onConfirmResume()}
          onClose={closeResumeDialog}
          onCancelJob={onCancelResumeJob}
        />
      )}
    </div>
  );
};