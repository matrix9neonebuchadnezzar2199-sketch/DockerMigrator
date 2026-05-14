import React, { useCallback, useEffect, useState } from 'react';
import type {
  ComposeProjectInfo,
  ProgressEvent,
  DmigErrorPayload,
  SecretScanResult,
  SecretAction,
  BindMountChoice,
  DmigManifest,
  PreflightResult,
} from '../../shared/types.js';
import { ErrorCodes, ErrorMessages } from '../../main/core/errors/codes.js';

import { ProgressBar } from '../components/ProgressBar.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { ComposeProjectCard } from '../components/ComposeProjectCard.js';
import { SecretWarningDialog } from '../components/SecretWarningDialog.js';
import { BindMountDialog } from '../components/BindMountDialog.js';

type Phase = 'browse' | 'bindDlg' | 'secretDlg' | 'running' | 'done';

/**
 * Compose まるごと エクスポート/インポート ページ。
 * Phase 5 の GOAL 機能。
 */
export const ComposePage: React.FC = () => {
  const [projects, setProjects] = useState<ComposeProjectInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outputDir, setOutputDir] = useState<string>('');
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<DmigErrorPayload | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('browse');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'export' | 'import'>('export');

  const [bindChoicesState, setBindChoicesState] = useState<Record<string, BindMountChoice[]>>({});
  const [scanResults, setScanResults] = useState<Record<string, SecretScanResult[]>>({});

  const [importPackDir, setImportPackDir] = useState<string>('');
  const [importManifest, setImportManifest] = useState<DmigManifest | null>(null);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importDestDirs, setImportDestDirs] = useState<Record<string, string>>({});
  const [currentJobToken, setCurrentJobToken] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [lastAction, setLastAction] = useState<string>('');

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await window.dmig.listComposeProjects();
    setLoading(false);
    if (r.ok) {
      setProjects(r.data);
    } else {
      setError(r.error);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
    return window.dmig.onProgress(setProgress);
  }, [refreshProjects]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(projects.map((p) => p.name)));
  const clearAll = () => setSelected(new Set());

  const browseOutputDir = async () => {
    const r = await window.dmig.selectDirectory({
      title: 'エクスポート先（USB等）を選択',
    });
    if (r.ok && r.data) setOutputDir(r.data);
  };

  const startExport = async () => {
    setError(null);
    setDone(null);
    setPreflight(null);
    setLastAction('Compose エクスポート: 事前検証');

    if (selected.size === 0) {
      setError({
        code: ErrorCodes.UI_COMPOSE_NO_PROJECT,
        message: ErrorMessages[ErrorCodes.UI_COMPOSE_NO_PROJECT],
      });
      return;
    }
    if (!outputDir) {
      setError({
        code: ErrorCodes.UI_COMPOSE_OUTPUT_REQUIRED,
        message: ErrorMessages[ErrorCodes.UI_COMPOSE_OUTPUT_REQUIRED],
      });
      return;
    }

    const pf = await window.dmig.preflight({
      outputDir,
      projectNames: Array.from(selected),
    });
    if (!pf.ok) {
      setError(pf.error);
      return;
    }
    setPreflight(pf.data);

    if (pf.data.space.status === 'insufficient') {
      const need = (pf.data.space.requiredBytes / 1024 / 1024 / 1024).toFixed(2);
      const free = (pf.data.space.freeBytes / 1024 / 1024 / 1024).toFixed(2);
      setError({
        code: ErrorCodes.DISK_SPACE_INSUFFICIENT,
        message: ErrorMessages[ErrorCodes.DISK_SPACE_INSUFFICIENT],
        detail: `必要 ${need}GB / 空き ${free}GB`,
      });
      return;
    }

    if (pf.data.space.status === 'warning') {
      const need = (pf.data.space.requiredBytes / 1024 / 1024 / 1024).toFixed(2);
      const free = (pf.data.space.freeBytes / 1024 / 1024 / 1024).toFixed(2);
      const proceed = window.confirm(
        `空き容量がぎりぎりです。\n必要 ${need}GB / 空き ${free}GB\n続行しますか？`,
      );
      if (!proceed) return;
    }

    const selectedProjects = projects.filter((p) => selected.has(p.name));
    const hasBind = selectedProjects.some((p) => p.bindMounts.length > 0);

    if (hasBind) {
      setPhase('bindDlg');
    } else {
      await proceedToSecretScan({});
    }
  };

  const onBindConfirm = async (choices: Record<string, BindMountChoice[]>) => {
    setBindChoicesState(choices);
    setPhase('browse');
    await proceedToSecretScan(choices);
  };

  const proceedToSecretScan = async (bindChoices: Record<string, BindMountChoice[]>) => {
    const selectedProjects = projects.filter((p) => selected.has(p.name));
    setBindChoicesState(bindChoices);

    const r = await window.dmig.scanSecrets(selectedProjects);
    if (!r.ok) {
      setError(r.error);
      return;
    }

    if (Object.keys(r.data).length > 0) {
      setScanResults(r.data);
      setPhase('secretDlg');
    } else {
      await runExport({}, bindChoices);
    }
  };

  const onSecretConfirm = async (actions: Record<string, SecretAction>) => {
    const fullActions: Record<string, SecretAction> = {};
    for (const p of projects) {
      if (selected.has(p.name)) {
        fullActions[p.name] = actions[p.name] ?? 'exclude';
      }
    }
    await runExport(fullActions, bindChoicesState);
  };

  const runExport = async (
    secretActions: Record<string, SecretAction>,
    bindChoices: Record<string, BindMountChoice[]>,
  ) => {
    setPhase('running');
    setError(null);
    setLastAction('Compose エクスポート: 実行中');

    const jobToken = crypto.randomUUID();
    setCurrentJobToken(jobToken);

    try {
      const r = await window.dmig.exportCompose({
        jobToken,
        projectNames: Array.from(selected),
        outputDir,
        compressionLevel: 3,
        secretActions,
        bindMountChoices: bindChoices,
      });

      if (r.ok) {
        const m = r.data.manifest;
        setDone(
          `エクスポート完了: ${m.contents.composeProjects?.length ?? 0} プロジェクト ` +
            `/ ${m.contents.images.length} イメージ ` +
            `/ ${m.contents.volumes?.length ?? 0} ボリューム ` +
            `(合計 ${(m.totalSize / 1024 / 1024).toFixed(1)} MB)\n` +
            `保存先: ${r.data.packDir}`,
        );
        setPhase('done');
      } else {
        setError(r.error);
        setPhase('browse');
      }
    } finally {
      setCurrentJobToken(null);
    }
  };

  const onCancelJob = async () => {
    if (!currentJobToken) return;
    await window.dmig.cancel(currentJobToken);
  };

  const cancelDialog = () => {
    setPhase('browse');
    setScanResults({});
  };

  const browseImportDir = async () => {
    const r = await window.dmig.selectDirectory({ title: 'パッケージ (.dmig) を選択' });
    if (r.ok && r.data) {
      setImportPackDir(r.data);
      const m = await window.dmig.readManifest(r.data);
      if (m.ok) {
        setImportManifest(m.data);
        setImportSelected(new Set((m.data.contents.composeProjects ?? []).map((c) => c.name)));
      } else {
        setError(m.error);
      }
    }
  };

  const browseDestDir = async (projectName: string) => {
    const r = await window.dmig.selectDirectory({
      title: `${projectName} の展開先を選択`,
    });
    if (r.ok && r.data != null && r.data !== '') {
      const destPath = r.data;
      setImportDestDirs((prev) => ({ ...prev, [projectName]: destPath }));
    }
  };

  const runImport = async () => {
    setError(null);
    setDone(null);

    const missing = Array.from(importSelected).filter((n) => !importDestDirs[n]);
    if (missing.length > 0) {
      setError({
        code: ErrorCodes.UI_COMPOSE_IMPORT_DEST_MISSING,
        message: ErrorMessages[ErrorCodes.UI_COMPOSE_IMPORT_DEST_MISSING],
        detail: missing.join(', '),
      });
      return;
    }

    setPhase('running');
    const jobToken = crypto.randomUUID();
    setCurrentJobToken(jobToken);

    try {
      const r = await window.dmig.importCompose({
        jobToken,
        packageDir: importPackDir,
        selectedProjects: Array.from(importSelected),
        destinationDirs: importDestDirs,
      });
      if (r.ok) {
        setDone('インポートが完了しました。');
        setPhase('done');
      } else {
        setError(r.error);
        setPhase('browse');
      }
    } finally {
      setCurrentJobToken(null);
    }
  };

  return (
    <>
      <h2>Compose プロジェクトまるごと パック</h2>

      <div className="tab-bar">
        <button
          type="button"
          className={tab === 'export' ? 'tab active' : 'tab'}
          onClick={() => setTab('export')}
        >
          エクスポート
        </button>
        <button
          type="button"
          className={tab === 'import' ? 'tab active' : 'tab'}
          onClick={() => setTab('import')}
        >
          インポート
        </button>
      </div>

      {tab === 'export' && (
        <>
          <div className="card">
            <label style={{ display: 'block', marginBottom: 8 }}>出力先 (USB等):</label>
            <input
              type="text"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder="E:\\backup"
              disabled={phase === 'running'}
              style={{ width: 360 }}
            />
            <button type="button" onClick={browseOutputDir} disabled={phase === 'running'} style={{ marginLeft: 8 }}>
              📂 選択...
            </button>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ flex: 1 }}>Compose プロジェクト ({projects.length}件)</strong>
              <button type="button" onClick={selectAll} disabled={phase === 'running'}>
                全選択
              </button>
              <button type="button" onClick={clearAll} disabled={phase === 'running'}>
                全解除
              </button>
              <button type="button" onClick={refreshProjects} disabled={loading || phase === 'running'}>
                🔄 再読込
              </button>
            </div>

            {loading && <div style={{ color: '#a6adc8' }}>読み込み中...</div>}

            {!loading && projects.length === 0 && (
              <div style={{ color: '#a6adc8', padding: 16 }}>
                Compose プロジェクトが検出されませんでした。
                <br />
                <small>
                  ※ ラベル <code>com.docker.compose.project</code> を持つコンテナ（稼働中または停止中）
                  のみが対象です。一度も <code>docker compose up</code> していない
                  プロジェクトは表示されません。
                </small>
              </div>
            )}

            {projects.map((p) => (
              <ComposeProjectCard
                key={p.name}
                project={p}
                selected={selected.has(p.name)}
                onToggle={() => toggle(p.name)}
                disabled={phase === 'running'}
              />
            ))}
          </div>

          <div className="card">
            <div>
              選択中: {selected.size} / {projects.length} 件
            </div>
            {preflight && (
              <div style={{ fontSize: 13, color: '#a6adc8', marginTop: 8 }}>
                推定サイズ: {(preflight.estimate.totalEstimated / 1024 / 1024 / 1024).toFixed(2)} GB
                {' / '}空き容量: {(preflight.space.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB
                {preflight.space.status === 'warning' && (
                  <span style={{ color: '#f9e2af', marginLeft: 8 }}>⚠ ぎりぎり</span>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={startExport}
              disabled={phase === 'running' || selected.size === 0}
              style={{ marginTop: 8 }}
            >
              {phase === 'running' ? '実行中...' : '▶ エクスポート開始'}
            </button>
            {phase === 'running' && currentJobToken && (
              <button
                type="button"
                onClick={() => void onCancelJob()}
                style={{ marginTop: 8, marginLeft: 8, background: '#f38ba8' }}
              >
                ⏹ 中止
              </button>
            )}
          </div>
        </>
      )}

      {tab === 'import' && (
        <>
          <div className="card">
            <label style={{ display: 'block', marginBottom: 8 }}>パッケージ (.dmig) のパス:</label>
            <input
              type="text"
              value={importPackDir}
              onChange={(e) => setImportPackDir(e.target.value)}
              placeholder="E:\\backup\\dmig-xxxx.dmig"
              disabled={phase === 'running'}
              style={{ width: 360 }}
            />
            <button type="button" onClick={browseImportDir} disabled={phase === 'running'} style={{ marginLeft: 8 }}>
              📂 選択...
            </button>
          </div>

          {importManifest && (
            <div className="card">
              <strong>パッケージ情報</strong>
              <div style={{ fontSize: 13, color: '#a6adc8', margin: '8px 0' }}>
                作成: {importManifest.createdAt} / OS: {importManifest.source.os} /
                Docker: {importManifest.source.dockerVersion}
              </div>

              <div style={{ marginTop: 12 }}>
                <strong>Compose プロジェクト:</strong>
              </div>
              {(importManifest.contents.composeProjects ?? []).map((p) => (
                <div key={p.name} className="image-row">
                  <input
                    type="checkbox"
                    checked={importSelected.has(p.name)}
                    onChange={() => {
                      setImportSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.name)) next.delete(p.name);
                        else next.add(p.name);
                        return next;
                      });
                    }}
                    disabled={phase === 'running'}
                  />
                  <div style={{ flex: 1 }}>
                    <div>
                      <strong>{p.name}</strong>
                      <span style={{ color: '#a6adc8', fontSize: 13, marginLeft: 8 }}>
                        {p.serviceCount} services / {p.volumeCount} volumes
                        {p.hasEnvFile && (p.envFileMasked ? ' / .env (masked)' : ' / .env')}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      展開先:{' '}
                      <code style={{ color: importDestDirs[p.name] ? '#a6e3a1' : '#f9e2af' }}>
                        {importDestDirs[p.name] ?? '未指定'}
                      </code>
                      <button
                        type="button"
                        onClick={() => browseDestDir(p.name)}
                        disabled={phase === 'running'}
                        style={{ marginLeft: 8 }}
                      >
                        📂
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={runImport}
                disabled={phase === 'running' || importSelected.size === 0}
                style={{ marginTop: 12 }}
              >
                {phase === 'running' ? 'インポート中...' : '▶ インポート開始'}
              </button>
              {phase === 'running' && currentJobToken && (
                <button
                  type="button"
                  onClick={() => void onCancelJob()}
                  style={{ marginTop: 12, marginLeft: 8, background: '#f38ba8' }}
                >
                  ⏹ 中止
                </button>
              )}
            </div>
          )}
        </>
      )}

      <ProgressBar progress={progress} />
      <ErrorBox error={error} lastAction={lastAction} />
      {done && (
        <div
          className="card"
          style={{ background: '#a6e3a1', color: '#1e1e2e', whiteSpace: 'pre-wrap' }}
        >
          {done}
        </div>
      )}

      {phase === 'bindDlg' && (
        <BindMountDialog
          projects={projects.filter((p) => selected.has(p.name))}
          onConfirm={onBindConfirm}
          onCancel={cancelDialog}
        />
      )}
      {phase === 'secretDlg' && (
        <SecretWarningDialog
          scanResults={scanResults}
          onConfirm={onSecretConfirm}
          onCancel={cancelDialog}
        />
      )}
    </>
  );
};
