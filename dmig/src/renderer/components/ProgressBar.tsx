import React from 'react';
import type { ProgressEvent } from '../../shared/types.js';

/**
 * 進捗バー（Phase 5.1 第3回: bytes/sec と ETA）。
 */
export const ProgressBar: React.FC<{ progress: ProgressEvent | null }> = ({ progress }) => {
  if (!progress) return null;

  const speed = progress.bytesPerSec ? formatSpeed(progress.bytesPerSec) : null;
  const eta = progress.etaSeconds ? formatEta(progress.etaSeconds) : null;

  return (
    <div className="card">
      <div className="progress-bar">
        <div className="fill" style={{ width: `${progress.percentage}%` }} />
      </div>
      <div className="progress-text">
        {progress.percentage}% — {progress.message}
      </div>
      {(speed || eta) && (
        <div className="progress-stats">
          {speed && <span>転送速度: {speed}</span>}
          {speed && eta && <span style={{ margin: '0 8px' }}>·</span>}
          {eta && <span>残り: 約 {eta}</span>}
        </div>
      )}
    </div>
  );
};

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  }
  if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${bytesPerSec} B/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}時間${m}分`;
}
