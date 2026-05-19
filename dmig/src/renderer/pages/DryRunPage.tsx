import React, { useEffect, useState } from 'react';
import type { ComposeProjectInfo, DryRunMode } from '../../shared/types.js';
import { DryRunResultList } from '../components/DryRunResultList.js';
import { useDryRun } from '../hooks/useDryRun.js';

export const DryRunPage: React.FC = () => {
  const [mode, setMode] = useState<DryRunMode>('compose-project');
  const [outputDir, setOutputDir] = useState('');
  const [packageDir, setPackageDir] = useState('');
  const [imageNamesText, setImageNamesText] = useState('');
  const [projects, setProjects] = useState<ComposeProjectInfo[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState(false);

  const { status, result, error, run, reset } = useDryRun();

  useEffect(() => {
    if (mode !== 'compose-project') {
      return;
    }
    setLoadingProjects(true);
    void window.dmig.listComposeProjects().then((r) => {
      setLoadingProjects(false);
      if (r.ok) {
        setProjects(r.data);
      }
    });
  }, [mode]);

  const toggleProject = (name: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const browseOutput = async () => {
    const r = await window.dmig.selectDirectory({ title: '出力先を選択' });
    if (r.ok && r.data) {
      setOutputDir(r.data);
    }
  };

  const browsePackage = async () => {
    const r = await window.dmig.selectDirectory({ title: 'パッケージ (.dmig) を選択' });
    if (r.ok && r.data) {
      setPackageDir(r.data);
    }
  };

  const onRun = () => {
    reset();
    if (mode === 'compose-project') {
      void run({
        mode,
        outputDir,
        projectNames: Array.from(selectedProjects),
      });
    } else if (packageDir.trim()) {
      void run({ mode, packageDir: packageDir.trim() });
    } else {
      const names = imageNamesText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      void run({ mode, outputDir, imageNames: names });
    }
  };

  const canRun =
    mode === 'compose-project'
      ? Boolean(outputDir && selectedProjects.size > 0)
      : packageDir.trim()
        ? true
        : Boolean(outputDir && imageNamesText.trim());

  return (
    <div className="page-shell dryrun-page">
      <h2>ドライラン</h2>
      <p className="page-lead">
        エクスポート前に容量・シークレット・bind mount・パッケージ状態を検査します（検出のみ、自動修正はしません）。
      </p>

      <div className="card dryrun-controls">
        <fieldset className="dryrun-mode-fieldset">
          <legend>モード</legend>
          <label>
            <input
              type="radio"
              name="dryrun-mode"
              checked={mode === 'compose-project'}
              onChange={() => setMode('compose-project')}
            />
            Compose プロジェクト
          </label>
          <label>
            <input
              type="radio"
              name="dryrun-mode"
              checked={mode === 'export-pack'}
              onChange={() => setMode('export-pack')}
            />
            Export パック
          </label>
        </fieldset>

        {mode === 'compose-project' ? (
          <>
            <label className="dryrun-field">
              出力先
              <div className="dryrun-field-row">
                <input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
                <button type="button" onClick={() => void browseOutput()}>
                  選択…
                </button>
              </div>
            </label>
            <div className="dryrun-projects">
              <strong>対象プロジェクト</strong>
              {loadingProjects ? <p>読み込み中…</p> : null}
              {projects.map((p) => (
                <label key={p.name} className="dryrun-project-row">
                  <input
                    type="checkbox"
                    checked={selectedProjects.has(p.name)}
                    onChange={() => toggleProject(p.name)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="dryrun-field">
              既存パッケージ (.dmig) パス（任意）
              <div className="dryrun-field-row">
                <input
                  type="text"
                  value={packageDir}
                  onChange={(e) => setPackageDir(e.target.value)}
                  placeholder="既存 .dmig フォルダ"
                />
                <button type="button" onClick={() => void browsePackage()}>
                  選択…
                </button>
              </div>
            </label>
            <p className="dryrun-hint">未指定の場合は新規エクスポート向けに imageNames で preflight します。</p>
            <label className="dryrun-field">
              出力先（新規パック）
              <div className="dryrun-field-row">
                <input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
                <button type="button" onClick={() => void browseOutput()}>
                  選択…
                </button>
              </div>
            </label>
            <label className="dryrun-field">
              イメージ名（カンマまたは改行区切り）
              <textarea
                value={imageNamesText}
                onChange={(e) => setImageNamesText(e.target.value)}
                rows={3}
                disabled={Boolean(packageDir.trim())}
              />
            </label>
          </>
        )}

        <button type="button" onClick={onRun} disabled={!canRun || status === 'running'}>
          {status === 'running' ? '実行中…' : 'ドライラン実行'}
        </button>
      </div>

      {status === 'running' ? <p className="dryrun-status">検査を実行しています…</p> : null}
      {error ? <p className="dryrun-error" role="alert">{error}</p> : null}

      {result ? (
        <>
          <DryRunResultList findings={result.findings} warnings={result.warnings} />
          <div className="card dryrun-next-steps">
            <strong>次のステップ</strong>
            <ul>
              <li>エラーがある場合は出力先・プロジェクト設定を見直してください。</li>
              <li>問題がなければ Compose / Export ページから本番の書き出しを実行できます。</li>
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
};