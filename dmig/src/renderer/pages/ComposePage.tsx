import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ComposeProjectInfo,
  ProgressEvent,
  DmigErrorPayload,
  SecretScanResult,
  SecretAction,
  BindMountChoice,
  DmigManifest,
  PreflightResult,
  SnapshotSummary,
  VolumeDiffStrategy,
  ComposeExportRequest,
  ComposeLifecycleAction,
} from '../../shared/types.js';
import { ErrorCodes, ErrorMessages } from '@shared/codes.js';

import { ProgressBar } from '../components/ProgressBar.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { ComposeProjectCard } from '../components/ComposeProjectCard.js';
import { PageGuidePanel } from '../components/PageGuidePanel.js';
import {
  ComposeExportGuideBody,
  ComposeImportGuideBody,
} from '../components/StaticPageGuides.js';
import { SecretWarningDialog } from '../components/SecretWarningDialog.js';
import { BindMountDialog } from '../components/BindMountDialog.js';
import { DiffPreviewDialog } from '../components/DiffPreviewDialog.js';
import { useDiffPreview } from '../hooks/useDiffPreview.js';
import {
  formatGbFromBytes,
  formatEtaHuman,
  transferSecondsAtUsbAssumption,
  USB_ASSUMED_BYTES_PER_SEC,
} from '../utils/formatTransfer.js';

type Phase = 'browse' | 'bindDlg' | 'secretDlg' | 'running' | 'done';

/** Phase 6: Compose 差分エクスポート時に exportCompose へ渡すオプション。 */
interface ComposeDeltaOpts {
  baseSnapshotId?: string;
  volumeDiffStrategy: VolumeDiffStrategy;
}

/**
 * Compose まるごと エクスポート/インポート ページ。
 * Phase 5 の GOAL 機能 + Phase 6 差分プレビュー。
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

  const exportProjectNamesRef = useRef<string[]>([]);
  const composeDeltaRef = useRef<ComposeDeltaOpts | null>(null);

  const [diffMode, setDiffMode] = useState(false);
  const [strictVolume, setStrictVolume] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const diffPreview = useDiffPreview();

  /** compose stop/pull 実行中のプロジェクト名（ボタン連打防止） */
  const [composeLifecycleBusy, setComposeLifecycleBusy] = useState<string | null>(null);
  const preflightDebounceGen = useRef(0);

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

  const refreshSnapshots = useCallback(async () => {
    const r = await window.dmig.listSnapshots();
    if (r.ok) {
      setSnapshots(r.data);
      if (r.data.length > 0) {
        setSelectedSnapshotId((prev) =>
          prev && r.data.some((s) => s.id === prev) ? prev : r.data[0]!.id,
        );
      }
    } else {
      setError(r.error);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
    return window.dmig.onProgress(setProgress);
  }, [refreshProjects]);

  useEffect(() => {
    if (tab === 'export' && diffMode) void refreshSnapshots();
  }, [tab, diffMode, refreshSnapshots]);

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

  const selectedProjectNamesSorted = useMemo(() => [...selected].sort(), [selected]);

  const selectedCardEstimateSum = useMemo(() => {
    let sum = 0;
    for (const p of projects) {
      if (selected.has(p.name)) sum += p.estimatedSize ?? 0;
    }
    return sum;
  }, [projects, selected]);

  const transferBytesDisplay = useMemo(() => {
    if (
      tab === 'export' &&
      phase === 'browse' &&
      preflight &&
      selected.size > 0 &&
      outputDir.trim().length > 0
    ) {
      return preflight.estimate.totalEstimated;
    }
    return selectedCardEstimateSum;
  }, [tab, phase, preflight, selected.size, outputDir, selectedCardEstimateSum]);

  const transferEtaSeconds = useMemo(
    () => transferSecondsAtUsbAssumption(transferBytesDisplay),
    [transferBytesDisplay],
  );

  useEffect(() => {
    if (tab !== 'export' || phase !== 'browse') {
      return undefined;
    }
    const out = outputDir.trim();
    if (!out || selectedProjectNamesSorted.length === 0) {
      setPreflight(null);
      return undefined;
    }
    const generation = ++preflightDebounceGen.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const r = await window.dmig.preflight({
          outputDir: out,
          projectNames: selectedProjectNamesSorted,
        });
        if (generation !== preflightDebounceGen.current) return;
        if (r.ok) {
          setPreflight(r.data);
        } else {
          setPreflight(null);
        }
      })();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [tab, phase, outputDir, selectedProjectNamesSorted]);

  const browseOutputDir = async () => {
    const r = await window.dmig.selectDirectory({
      title: 'エクスポート先（USB等）を選択',
    });
    if (r.ok && r.data) setOutputDir(r.data);
  };

  const runLifecycleForProject = useCallback(
    async (projectName: string, action: ComposeLifecycleAction) => {
      if (phase === 'running') return;
      setComposeLifecycleBusy(projectName);
      setError(null);
      try {
        const r = await window.dmig.composeLifecycle({ projectName, action });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        await refreshProjects();
      } finally {
        setComposeLifecycleBusy(null);
      }
    },
    [phase, refreshProjects],
  );

  const selectRunningOnly = useCallback(() => {
    if (phase === 'running') return;
    const next = new Set(
      projects.filter((p) => p.services.some((s) => s.state === 'running')).map((p) => p.name),
    );
    setSelected(next);
  }, [projects, phase]);

  const stopAllSelected = useCallback(async () => {
    if (selected.size === 0 || phase === 'running') return;
    if (!window.confirm('選択中の各プロジェクトで docker compose stop を順に実行します。よろしいですか？')) {
      return;
    }
    setError(null);
    for (const name of Array.from(selected)) {
      setComposeLifecycleBusy(name);
      const r = await window.dmig.composeLifecycle({ projectName: name, action: 'stop' });
      setComposeLifecycleBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    }
    await refreshProjects();
  }, [selected, phase, refreshProjects]);

  const pullAllSelected = useCallback(async () => {
    if (selected.size === 0 || phase === 'running') return;
    if (
      !window.confirm(
        '選択中の各プロジェクトで docker compose pull を順に実行します。イメージの再取得に時間・ディスク・ネットワークを消費します。続行しますか？',
      )
    ) {
      return;
    }
    setError(null);
    for (const name of Array.from(selected)) {
      setComposeLifecycleBusy(name);
      const r = await window.dmig.composeLifecycle({ projectName: name, action: 'pull' });
      setComposeLifecycleBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    }
    await refreshProjects();
  }, [selected, phase, refreshProjects]);

  const runPruneDangling = useCallback(async () => {
    if (phase === 'running') return;
    setError(null);
    const r = await window.dmig.pruneDanglingImages();
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (!r.data.skipped) {
      setDone('dangling イメージの prune が完了しました。');
    }
    await refreshProjects();
  }, [phase, refreshProjects]);

  const exportTargets = (): string[] => exportProjectNamesRef.current;

  const continuePreflightChain = async () => {
    preflightDebounceGen.current += 1;
    setError(null);
    setDone(null);
    setPreflight(null);
    setLastAction('Compose エクスポート: 事前検証');

    const names = exportTargets();
    const pf = await window.dmig.preflight({
      outputDir,
      projectNames: names,
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

    const selectedProjects = projects.filter((p) => names.includes(p.name));
    const hasBind = selectedProjects.some((p) => (p.bindMounts?.length ?? 0) > 0);

    if (hasBind) {
      setPhase('bindDlg');
    } else {
      await proceedToSecretScan({});
    }
  };

  const startExport = async () => {
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

    exportProjectNamesRef.current = Array.from(selected);
    composeDeltaRef.current = null;

    if (diffMode) {
      setError(null);
      setDone(null);
      setPreflight(null);
      setLastAction('Compose 差分: プレビュー計算');
      const ok = await diffPreview.refresh({
        baseSnapshotId: selectedSnapshotId || undefined,
        volumeStrategy: strictVolume ? 'strict' : 'fast',
      });
      if (!ok) return;
      setDiffDialogOpen(true);
      return;
    }

    await continuePreflightChain();
  };

  const onBindConfirm = async (choices: Record<string, BindMountChoice[]>) => {
    setBindChoicesState(choices);
    setPhase('browse');
    await proceedToSecretScan(choices);
  };

  const proceedToSecretScan = async (bindChoices: Record<string, BindMountChoice[]>) => {
    const names = exportTargets();
    const selectedProjects = projects.filter((p) => names.includes(p.name));
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
    const names = exportTargets();
    const fullActions: Record<string, SecretAction> = {};
    for (const p of projects) {
      if (names.includes(p.name)) {
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

    const names = exportTargets();
    const delta = composeDeltaRef.current;

    try {
      const req: ComposeExportRequest = {
        jobToken,
        projectNames: names,
        outputDir,
        compressionLevel: 3,
        secretActions,
        bindMountChoices: bindChoices,
      };
      if (delta) {
        req.diffMode = 'delta';
        req.baseSnapshotId = delta.baseSnapshotId;
        req.volumeDiffStrategy = delta.volumeDiffStrategy;
        req.autoSaveSnapshot = true;
      }

      const r = await window.dmig.exportCompose(req);

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
      composeDeltaRef.current = null;
    }
  };

  const onDiffConfirm = (excluded: Set<string>) => {
    const preview = diffPreview.preview;
    if (!preview) return;

    const names: string[] = [];
    for (const e of preview.diff.composeProjects) {
      if (e.kind === 'removed') continue;
      if (excluded.has(`compose:${e.projectName}`)) continue;
      if (selected.has(e.projectName)) names.push(e.projectName);
    }
    if (names.length === 0) {
      setError({
        code: ErrorCodes.DIFF_COMPUTATION_FAILED,
        message: ErrorMessages[ErrorCodes.DIFF_COMPUTATION_FAILED],
        detail: '同梱対象の Compose プロジェクトがありません',
      });
      setDiffDialogOpen(false);
      diffPreview.reset();
      return;
    }

    exportProjectNamesRef.current = names;
    composeDeltaRef.current = {
      baseSnapshotId: selectedSnapshotId || undefined,
      volumeDiffStrategy: strictVolume ? 'strict' : 'fast',
    };
    setDiffDialogOpen(false);
    diffPreview.reset();
    void continuePreflightChain();
  };

  const onDiffFallbackToFull = () => {
    setDiffMode(false);
    setDiffDialogOpen(false);
    diffPreview.reset();
    exportProjectNamesRef.current = Array.from(selected);
    composeDeltaRef.current = null;
    void continuePreflightChain();
  };

  const onDiffCancel = () => {
    setDiffDialogOpen(false);
    diffPreview.reset();
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
    <div className="page-shell">
      <div className="page-two-col">
        <div className="page-primary">
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
            <div className="diff-controls">
              <label>
                <input
                  type="checkbox"
                  checked={diffMode}
                  onChange={(e) => setDiffMode(e.target.checked)}
                  disabled={phase === 'running'}
                />
                差分エクスポート
              </label>
              {diffMode && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={strictVolume}
                      onChange={(e) => setStrictVolume(e.target.checked)}
                      disabled={phase === 'running'}
                    />
                    厳密ボリューム判定（低速・正確）
                  </label>
                  <label>
                    基底スナップショット:
                    <select
                      value={selectedSnapshotId}
                      onChange={(e) => setSelectedSnapshotId(e.target.value)}
                      disabled={phase === 'running'}
                    >
                      {snapshots.length === 0 && <option value="">（無し）</option>}
                      {snapshots.map((s) => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.createdAt).toLocaleString('ja-JP')} ({s.imageCount}img / {s.volumeCount}vol)
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
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

            <div className="compose-expert-bar">
              <div className="compose-expert-bar-header">
                <span className="compose-expert-bar-title">🛠️ 熟練者向けワンクリック</span>
              </div>
              <div className="compose-expert-bar-buttons">
                <button
                  type="button"
                  className="btn-compact"
                  onClick={selectRunningOnly}
                  disabled={loading || phase === 'running' || composeLifecycleBusy !== null}
                >
                  🎯 稼働中のみ選択
                </button>
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => void stopAllSelected()}
                  disabled={
                    loading || phase === 'running' || selected.size === 0 || composeLifecycleBusy !== null
                  }
                >
                  ⏹ 選択をすべて停止
                </button>
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => void pullAllSelected()}
                  disabled={
                    loading || phase === 'running' || selected.size === 0 || composeLifecycleBusy !== null
                  }
                >
                  ⬇ 選択のイメージ取得
                </button>
                <button
                  type="button"
                  className="btn-compact"
                  onClick={() => void runPruneDangling()}
                  disabled={loading || phase === 'running' || composeLifecycleBusy !== null}
                >
                  🧹 dangling イメージ整理
                </button>
              </div>
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
                onComposeLifecycle={(action) => void runLifecycleForProject(p.name, action)}
                composeLifecycleBusy={composeLifecycleBusy === p.name}
                composeOpsLocked={composeLifecycleBusy !== null}
              />
            ))}
          </div>

          <div className="card">
            <div>
              選択中: {selected.size} / {projects.length} 件
            </div>
            <div className="compose-footer-stats">
              <span>
                📊 合計移動容量（圧縮目安）: <strong>{formatGbFromBytes(transferBytesDisplay)}</strong>
              </span>
              <span className="compose-footer-stat-sep" aria-hidden="true">
                ·
              </span>
              <span>
                ⏱ 予想転送時間（USB 想定 {(USB_ASSUMED_BYTES_PER_SEC / (1024 * 1024)).toFixed(0)} MB/s）:{' '}
                <strong>{formatEtaHuman(transferEtaSeconds)}</strong>
              </span>
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
              onClick={() => void startExport()}
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
          projects={projects.filter((p) => exportTargets().includes(p.name))}
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

      <DiffPreviewDialog
        open={diffDialogOpen}
        preview={diffPreview.preview}
        loading={diffPreview.loading}
        error={diffPreview.error}
        onConfirm={onDiffConfirm}
        onFallbackToFull={onDiffFallbackToFull}
        onCancel={onDiffCancel}
      />
        </div>

        <aside className="page-guide-rail" aria-label="ページ解説">
          <PageGuidePanel
            title={tab === 'export' ? '📋 エクスポート — ページ解説' : '📋 インポート — ページ解説'}
          >
            {tab === 'export' ? <ComposeExportGuideBody /> : <ComposeImportGuideBody />}
          </PageGuidePanel>
        </aside>
      </div>
    </div>
  );
};
