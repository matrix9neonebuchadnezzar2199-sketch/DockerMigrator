import React, { useEffect, useRef, useState } from 'react';
import type { DmigManifest, ProgressEvent, DmigErrorPayload, ProbeSummary } from '../../shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import { gateImportAfterProbe } from '@shared/importProbeUi.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { PageGuidePanel } from '../components/PageGuidePanel.js';
import { ImportPageGuideBody } from '../components/StaticPageGuides.js';
import { ResumeConfirmDialog } from '../components/ResumeConfirmDialog.js';
import { ProbeErrorPanel } from '../components/ProbeErrorPanel.js';

export const ImportPage: React.FC = () => {
  const [packDir, setPackDir] = useState<string>('');
  const [manifest, setManifest] = useState<DmigManifest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<DmigErrorPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const [probeErrorSummary, setProbeErrorSummary] = useState<ProbeSummary | null>(null);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeSummary, setResumeSummary] = useState<ProbeSummary | null>(null);
  const [resumeRunning, setResumeRunning] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<ProgressEvent | null>(null);
  const [resumeJobToken, setResumeJobToken] = useState<string | null>(null);

  const resumeRunningRef = useRef(false);
  useEffect(() => {
    resumeRunningRef.current = resumeRunning;
  }, [resumeRunning]);

  useEffect(() => {
    return window.dmig.onProgress((ev) => {
      setProgress(ev);
      if (resumeRunningRef.current) setResumeProgress(ev);
    });
  }, []);

  const loadManifestOnly = async (dir: string) => {
    const r = await window.dmig.readManifest(dir);
    if (r.ok) {
      setManifest(r.data);
      setSelected(new Set(r.data.contents.images.map((i) => i.name)));
    } else {
      setError(r.error);
    }
  };

  const loadPackage = async () => {
    setError(null);
    setDone(null);
    setManifest(null);
    setProbeErrorSummary(null);
    setResumeDialogOpen(false);
    setResumeSummary(null);

    const pr = await window.dmig.probePackage(packDir);
    if (!pr.ok) {
      setError(pr.error);
      return;
    }

    const gate = gateImportAfterProbe(pr.data);
    switch (gate.action) {
      case 'load_manifest':
        await loadManifestOnly(packDir);
        break;
      case 'resume_dialog':
        setResumeSummary(gate.summary);
        setResumeDialogOpen(true);
        break;
      case 'show_probe_error':
        setProbeErrorSummary(gate.summary);
        break;
    }
  };

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const start = async () => {
    setError(null);
    setDone(null);
    setRunning(true);
    const r = await window.dmig.importImages({
      packageDir: packDir,
      selectedImages: Array.from(selected),
    });
    setRunning(false);
    if (r.ok) setDone('インポートが完了しました。');
    else setError(r.error);
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
      setDone('エクスポートの再開が完了しました。「読み込み」でマニフェストを更新してください。');
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
      <div className="page-two-col">
        <div className="page-primary">
          <h2>📥 パッケージからインポート</h2>

          <div className="card">
            <label style={{ display: 'block', marginBottom: 8 }}>📁 パッケージのパス (.dmig):</label>
            <input
              type="text"
              value={packDir}
              onChange={(e) => setPackDir(e.target.value)}
              placeholder="E:\\dmig-20260514.dmig"
              disabled={running || resumeRunning}
            />
            <button
              onClick={() => void loadPackage()}
              disabled={running || resumeRunning || !packDir}
              style={{ marginLeft: 8 }}
            >
              読み込み
            </button>
          </div>

          {probeErrorSummary && <ProbeErrorPanel summary={probeErrorSummary} />}

          {manifest && (
            <div className="card">
              <strong>📦 パッケージ情報</strong>
              <table className="guide-table" style={{ marginTop: 10 }}>
                <tbody>
                  <tr>
                    <th scope="row">📅 作成</th>
                    <td>{manifest.createdAt}</td>
                  </tr>
                  <tr>
                    <th scope="row">🖥 OS</th>
                    <td>{manifest.source.os}</td>
                  </tr>
                  <tr>
                    <th scope="row">🐳 Docker</th>
                    <td>{manifest.source.dockerVersion}</td>
                  </tr>
                  <tr>
                    <th scope="row">🏷️ イメージ数</th>
                    <td>{manifest.contents.images.length} 件</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 13, color: '#a6adc8', margin: '8px 0 12px' }}>
                取り込むイメージにチェックを付けてください。
              </div>
              {manifest.contents.images.map((img) => (
                <div key={img.name} className="image-row">
                  <input
                    type="checkbox"
                    checked={selected.has(img.name)}
                    onChange={() => toggle(img.name)}
                    disabled={running}
                  />
                  <span className="name">{img.name}</span>
                  <span className="size">{(img.compressedSize / 1024 / 1024).toFixed(1)} MB (圧縮)</span>
                </div>
              ))}
              <button onClick={() => void start()} disabled={running || selected.size === 0} style={{ marginTop: 12 }}>
                {running ? 'インポート中...' : '▶ インポート開始'}
              </button>
            </div>
          )}

          <ProgressBar progress={progress} />
          <ErrorBox error={error} />
          {done && (
            <div className="card" style={{ background: '#a6e3a1', color: '#1e1e2e' }}>
              ✅ {done}
            </div>
          )}
        </div>

        <aside className="page-guide-rail" aria-label="ページ解説">
          <PageGuidePanel title="📋 このページの解説">
            <ImportPageGuideBody />
          </PageGuidePanel>
        </aside>
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
