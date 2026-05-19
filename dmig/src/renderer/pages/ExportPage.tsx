import React, { useEffect, useState } from 'react';
import type { ImageInfo, DmigErrorPayload } from '../../shared/types.js';
import { EXPORT_RESUME_VIA_IMPORT_HINT } from '@shared/uiCopy.js';
import { buildProgressEvent, ProgressTaskIds } from '../../shared/progress.js';
import { OperationProgress } from '../components/OperationProgress.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { ResumeHintBanner } from '../components/ResumeHintBanner.js';
import { PageGuidePanel } from '../components/PageGuidePanel.js';
import { ExportPageGuideBody } from '../components/StaticPageGuides.js';
import { useDmigProgress } from '../hooks/useDmigProgress.js';
import { usePageDynamicCta } from '../context/DynamicCtaContext.js';

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
  const [outputDir, setOutputDir] = useState<string>(
    typeof navigator !== 'undefined' && navigator.platform.includes('Win') ? 'E:\\' : '/media/usb',
  );
  const [error, setError] = useState<DmigErrorPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [listing, setListing] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const [resumeHint, setResumeHint] = useState<string | null>(null);

  const discoverProgress = useDmigProgress('discover');
  const transferProgress = useDmigProgress('transfer');

  usePageDynamicCta(
    done && !error ? { label: 'インポートへ進む', targetPage: 'import' } : null,
  );

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
    setError(null);
    setDone(null);
    setRunning(true);
    transferProgress.clear();
    const r = await window.dmig.exportImages({
      jobToken: crypto.randomUUID(),
      imageNames: Array.from(selected),
      outputDir,
      compressionLevel: 3,
    });
    setRunning(false);
    transferProgress.clear();
    if (r.ok) setDone(`完了: ${r.data.contents.images.length} 件のイメージを書き出しました`);
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
          <OperationProgress active={running} progress={transferProgress.progress} />

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
        <button onClick={() => void start()} disabled={running || listing || selected.size === 0} style={{ marginTop: 8 }}>
          {running ? '実行中...' : '▶ エクスポート開始'}
        </button>
      </div>

      <ErrorBox error={error} />
      {done && (
        <div className="card" style={{ background: '#a6e3a1', color: '#1e1e2e' }}>
          ✅ {done}
        </div>
      )}
        </div>

        <aside className="page-guide-rail" aria-label="ページ解説">
          <PageGuidePanel title="📋 このページの解説">
            <ExportPageGuideBody />
          </PageGuidePanel>
        </aside>
      </div>
    </div>
  );
};
