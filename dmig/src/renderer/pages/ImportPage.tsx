import React, { useState } from 'react';
import type { DmigManifest, DmigErrorPayload, ProbeSummary } from '../../shared/types.js';
import { gateImportAfterProbe } from '@shared/importProbeUi.js';
import { buildProgressEvent, ProgressTaskIds } from '../../shared/progress.js';
import { OperationProgress } from '../components/OperationProgress.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { PageGuidePanel } from '../components/PageGuidePanel.js';
import { ImportPageGuideBody } from '../components/StaticPageGuides.js';
import { ResumeConfirmDialog } from '../components/ResumeConfirmDialog.js';
import { ProbeErrorPanel } from '../components/ProbeErrorPanel.js';
import { useJobLock } from '../context/JobLockContext.js';
import { useDmigProgress } from '../hooks/useDmigProgress.js';
import { RESUME_SUCCESS_MESSAGE } from '../hooks/useDoneProgressNotice.js';
import { useResumeFlow } from '../hooks/useResumeFlow.js';
import { usePageDynamicCta } from '../context/DynamicCtaContext.js';
import { RollbackInlineSection } from '../components/RollbackInlineSection.js';

const PROBE_PROGRESS_INITIAL = buildProgressEvent({
  taskId: ProgressTaskIds.PROBE_PACKAGE,
  phase: 'discover',
  scope: 'scan',
  current: 0,
  total: 100,
  message: 'パッケージを検証しています…',
});

export const ImportPage: React.FC = () => {
  const [packDir, setPackDir] = useState<string>('');
  const [manifest, setManifest] = useState<DmigManifest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<DmigErrorPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [probing, setProbing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [cancelled, setCancelled] = useState<string | null>(null);

  const [probeErrorSummary, setProbeErrorSummary] = useState<ProbeSummary | null>(null);

  const { tryBegin, end, blockedMessage } = useJobLock();
  const scanProgress = useDmigProgress('scan');
  const {
    resumeSummary,
    resumeDialogOpen,
    resumeRunning,
    resumeJobToken,
    transferProgress,
    openResumeDialog,
    onConfirmResume,
    onCancelResumeJob,
    closeResumeDialog,
  } = useResumeFlow(
    (msg) => {
      if (msg === RESUME_SUCCESS_MESSAGE) {
        setDone('エクスポートの再開が完了しました。「読み込み」でマニフェストを更新してください。');
      } else {
        setDone(msg);
      }
      setCancelled(null);
    },
    setError,
    undefined,
    (msg) => {
      setCancelled(msg);
      setDone(null);
    },
  );

  usePageDynamicCta(
    imported && !error && !cancelled
      ? { label: '移行先の概要へ戻る', targetPage: 'target-overview' }
      : null,
  );

  const onChangePackDir = (next: string) => {
    setPackDir(next);
    setManifest(null);
    setSelected(new Set());
    setProbeErrorSummary(null);
    setImported(false);
  };

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
    setImported(false);
    setManifest(null);
    setProbeErrorSummary(null);
    setProbing(true);
    scanProgress.setProgress(PROBE_PROGRESS_INITIAL);

    const pr = await window.dmig.probePackage(packDir);
    setProbing(false);
    scanProgress.clear();
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
        openResumeDialog(gate.summary);
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
    if (!tryBegin('import')) {
      return;
    }
    setError(null);
    setDone(null);
    setImported(false);
    setRunning(true);
    transferProgress.clear();
    let r;
    try {
      r = await window.dmig.importImages({
        jobToken: crypto.randomUUID(),
        packageDir: packDir,
        selectedImages: Array.from(selected),
      });
    } finally {
      setRunning(false);
      end('import');
      transferProgress.clear();
    }
    if (r.ok) {
      setDone('インポートが完了しました。');
      setImported(true);
    } else setError(r.error);
  };

  return (
    <div className="page-shell">
      <div className="page-two-col">
        <div className="page-primary">
          <h2>📥 パッケージからインポート</h2>

          <OperationProgress
            active={probing}
            progress={scanProgress.progress}
            fallback={PROBE_PROGRESS_INITIAL}
          />
          <div className="card">
            <label style={{ display: 'block', marginBottom: 8 }}>📁 パッケージのパス (.dmig):</label>
            <input
              type="text"
              value={packDir}
              onChange={(e) => onChangePackDir(e.target.value)}
              placeholder="E:\\dmig-20260514.dmig"
              disabled={running || resumeRunning}
            />
            <button
              onClick={() => void loadPackage()}
              disabled={running || resumeRunning || probing || !packDir}
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
              <OperationProgress active={running} progress={transferProgress.progress} />
              <button onClick={() => void start()} disabled={running || selected.size === 0} style={{ marginTop: 12 }}>
                {running ? 'インポート中...' : '▶ インポート開始'}
              </button>
            </div>
          )}

          {blockedMessage ? (
            <p className="card" role="status">
              {blockedMessage}
            </p>
          ) : null}
          <ErrorBox error={error} />
          {imported && packDir ? <RollbackInlineSection mode="import" packageDir={packDir} /> : null}
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
          progress={transferProgress.progress}
          jobToken={resumeJobToken}
          onConfirmResume={() => void onConfirmResume()}
          onClose={closeResumeDialog}
          onCancelJob={onCancelResumeJob}
        />
      )}
    </div>
  );
};
