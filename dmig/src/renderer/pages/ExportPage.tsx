import React, { useEffect, useState } from 'react';
import type { ImageInfo, ProgressEvent, DmigErrorPayload } from '../../shared/types.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ErrorBox } from '../components/ErrorBox.js';

export const ExportPage: React.FC = () => {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outputDir, setOutputDir] = useState<string>(
    typeof navigator !== 'undefined' && navigator.platform.includes('Win') ? 'E:\\' : '/media/usb',
  );
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<DmigErrorPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void window.dmig.listImages().then((r) => {
      if (r.ok) setImages(r.data);
      else setError(r.error);
    });
    return window.dmig.onProgress(setProgress);
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
    const r = await window.dmig.exportImages({
      imageNames: Array.from(selected),
      outputDir,
      compressionLevel: 3,
    });
    setRunning(false);
    if (r.ok) setDone(`完了: ${r.data.contents.images.length} 件のイメージを書き出しました`);
    else setError(r.error);
  };

  const totalSize = images
    .filter((i) => i.repoTags.some((t) => selected.has(t)))
    .reduce((s, i) => s + i.size, 0);

  return (
    <>
      <h2>エクスポート対象を選択</h2>

      <div className="card">
        <label style={{ display: 'block', marginBottom: 8 }}>出力先 (USBパス):</label>
        <input
          type="text"
          value={outputDir}
          onChange={(e) => setOutputDir(e.target.value)}
          disabled={running}
        />
      </div>

      <div className="card">
        <strong>イメージ ({images.length}件)</strong>
        <div style={{ marginTop: 12 }}>
          {images.flatMap((img) =>
            img.repoTags.map((tag) => (
              <div key={tag} className="image-row">
                <input
                  type="checkbox"
                  checked={selected.has(tag)}
                  onChange={() => toggle(tag)}
                  disabled={running}
                />
                <span className="name">{tag}</span>
                <span className="size">{(img.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            )),
          )}
        </div>
      </div>

      <div className="card">
        <div>
          選択中: {selected.size} 件 / 合計サイズ: {(totalSize / 1024 / 1024).toFixed(1)} MB
        </div>
        <button onClick={() => void start()} disabled={running || selected.size === 0} style={{ marginTop: 8 }}>
          {running ? '実行中...' : '▶ エクスポート開始'}
        </button>
      </div>

      <ProgressBar progress={progress} />
      <ErrorBox error={error} />
      {done && (
        <div className="card" style={{ background: '#a6e3a1', color: '#1e1e2e' }}>
          {done}
        </div>
      )}
    </>
  );
};
