import React, { useEffect, useState } from 'react';
import type { ImageInfo, DmigErrorPayload } from '../../shared/types.js';
import { EXPORT_RESUME_VIA_IMPORT_HINT } from '@shared/uiCopy.js';
import { buildProgressEvent, ProgressTaskIds } from '../../shared/progress.js';
import { OperationProgress } from '../components/OperationProgress.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { ResumeHintBanner } from '../components/ResumeHintBanner.js';
import { PageGuidePanel } from '../components/PageGuidePanel.js';
import { ExportPageGuideBody, GuideSuspenseFallback } from '../components/lazyStaticPageGuides.js';
import { useJobLock } from '../context/JobLockContext.js';
import { useDmigProgress } from '../hooks/useDmigProgress.js';
import { usePageDynamicCta } from '../context/DynamicCtaContext.js';
import { DryRunInlineSection } from '../components/DryRunInlineSection.js';
import { RollbackInlineSection } from '../components/RollbackInlineSection.js';

const IMAGE_LIST_PROGRESS_INITIAL = buildProgressEvent({
  taskId: ProgressTaskIds.IMAGE_LIST,
  phase: 'discover',
  scope: 'discover',
  current: 0,
  total: 100,
  message: 'Docker イメージ一覧を取得しています…',
});

export const ExportPage: React.FC = () => {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const HARDCODED_DEFAULT =
    typeof navigator !== 'undefined' && navigator.platform.includes('Win') ? 'E:\\' : '/media/usb';

  const [outputDir, setOutputDir] = useState<string>(HARDCODED_DEFAULT);
  const [outputDirInitialized, setOutputDirInitialized] = useState(false);
  const [error, setError] = useState<DmigErrorPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [listing, setListing] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const [resumeHint, setResumeHint] = useState<string | null>(null);
  const [dryRunHasErrors, setDryRunHasErrors] = useState(false);
  const [lastPackDir, setLastPackDir] = useState('');

  const { tryBegin, end, blockedMessage } = useJobLock();
  const discoverProgress = useDmigProgress('discover');
  const transferProgress = useDmigProgress('transfer');

  usePageDynamicCta(
    done && !error ? { label: 'インポートへ進む', targetPage: 'import' } : null,
  );

  useEffect(() => {
    void window.dmig.getSettings().then((r) => {
      if (r.ok && r.data.defaultExportDir && !outputDirInitialized) {
        setOutputDir(r.data.defaultExportDir);
      }
      setOutputDirInitialized(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    discoverProgress.setProgress(IMAGE_LIST_PROGRESS_INITIAL);
    void window.dmig.listImages().then((r) => {
      setListing(false);
      discoverProgress.clear();
      if (r.ok) setImages(r.data);
      else setError(r.error);
    });
    // 初回マウントのみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const start = async () => {
    if (!tryBegin('export')) {
      return;
    }
    setError(null);
    setDone(null);
    setRunning(true);
    transferProgress.clear();
    let r;
    try {
      r = await window.dmig.exportImages({
        jobToken: crypto.randomUUID(),
        imageNames: Array.from(selected),
        outputDir,
        compressionLevel: 3,
      });
    } finally {
      setRunning(false);
      end('export');
      transferProgress.clear();
    }
    if (r.ok) {
      setLastPackDir(r.data.packDir);
      setDone(`完了: ${r.data.manifest.contents.images.length} 件のイメージを書き出しました`);
    }
    else {
      setError(r.error);
      setResumeHint(EXPORT_RESUME_VIA_IMPORT_HINT);
    }
  };

  const totalSize = images
    .filter((i) => i.repoTags.some((t) => selected.has(t)))
    .reduce((s, i) => s + i.size, 0);

  return (
    <div className="page-shell">
      <div className="page-two-col">
        <div className="page-primary">
          <h2>📤 エクスポート対象を選択</h2>
          <ResumeHintBanner message={resumeHint} onDismiss={() => setResumeHint(null)} />

          <OperationProgress
            active={listing}
            progress={discoverProgress.progress}
            fallback={IMAGE_LIST_PROGRESS_INITIAL}
          />
      <div className="card">
        <label style={{ display: 'block', marginBottom: 8 }}>💾 出力先 (USBパス):</label>
        <input
          type="text"
          value={outputDir}
          onChange={(e) => setOutputDir(e.target.value)}
          disabled={running}
        />
      </div>

      <div className="card">
        <strong>🏷️ イメージ一覧 ({images.length} 件)</strong>
        <div style={{ marginTop: 12 }}>
          {images.flatMap((img) =>
            img.repoTags.map((tag) => (
              <div key={tag} className="image-row">
                <input
                  type="checkbox"
                  checked={selected.has(tag)}
                  onChange={() => toggle(tag)}
                  disabled={running || listing}
                />
                <span className="name">{tag}</span>
                <span className="size">{(img.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            )),
          )}
        </div>
      </div>

      <div className="card">
        <table className="guide-table" style={{ marginBottom: 12 }}>
          <tbody>
            <tr>
              <th style={{ width: '40%' }}>📌 選択件数</th>
              <td>
                <strong>{selected.size}</strong> 件
              </td>
            </tr>
            <tr>
              <th>📊 選択の合計サイズ</th>
              <td>
                <strong>{(totalSize / 1024 / 1024).toFixed(1)}</strong> MB（ホスト上・圧縮前目安）
              </td>
            </tr>
          </tbody>
        </table>
        <div>
          上記をパックに含めて書き出します。実行中は進捗バーが更新されます。
        </div>
        <DryRunInlineSection
          buildRequest={() =>
            outputDir && selected.size > 0
              ? {
                  mode: 'export-pack',
                  outputDir,
                  imageNames: Array.from(selected),
                }
              : null
          }
          onHasErrorFindings={setDryRunHasErrors}
        />

        <OperationProgress active={running} progress={transferProgress.progress} />

        {!done ? (
          <button
            data-testid="image-export-start"
            onClick={() => void start()}
            disabled={running || listing || selected.size === 0}
            style={{ marginTop: 8 }}
            title={
              dryRunHasErrors ? 'ドライランでエラー検出。確認してください' : undefined
            }
          >
            {running ? '実行中...' : '▶ エクスポート開始'}
          </button>
        ) : null}
      </div>

      {blockedMessage ? (
        <p className="card" role="status">
          {blockedMessage}
        </p>
      ) : null}
      <ErrorBox error={error} />
      {done && lastPackDir ? <RollbackInlineSection mode="export" packageDir={lastPackDir} /> : null}
      {done && (
        <div className="card" style={{ background: '#a6e3a1', color: '#1e1e2e' }}>
          ✅ {done}
          <button
            type="button"
            data-testid="image-export-reset"
            onClick={() => {
              setDone(null);
              setLastPackDir('');
              setError(null);
              setResumeHint(null);
            }}
            style={{ marginTop: 8, display: 'block' }}
          >
            新しい書き出しを開始
          </button>
        </div>
      )}
        </div>

        <aside className="page-guide-rail" aria-label="ページ解説">
          <PageGuidePanel title="📋 このページの解説">
            <React.Suspense fallback={<GuideSuspenseFallback />}>
              <ExportPageGuideBody />
            </React.Suspense>
          </PageGuidePanel>
        </aside>
      </div>
    </div>
  );
};
