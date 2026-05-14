import type { ProgressEvent } from '@shared/types.js';

/**
 * 進捗イベントに bytesPerSec と etaSeconds を計算して付与するラッパー。
 *
 * 直近 5 サンプルの移動平均で bytesPerSec を算出し、
 * total > 0 かつ bytesPerSec > 0 のとき ETA を付与する。
 */
export class ProgressTracker {
  private samples: Array<{ ts: number; bytes: number }> = [];
  private readonly maxSamples = 5;

  enrich(ev: ProgressEvent): ProgressEvent {
    const now = Date.now();
    const bytes = ev.current;

    this.samples.push({ ts: now, bytes });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    let bytesPerSec: number | undefined;
    let etaSeconds: number | undefined;

    if (this.samples.length >= 2) {
      const first = this.samples[0];
      const last = this.samples[this.samples.length - 1];
      const dtSec = (last.ts - first.ts) / 1000;
      const dBytes = last.bytes - first.bytes;
      if (dtSec > 0 && dBytes > 0) {
        bytesPerSec = Math.round(dBytes / dtSec);
        if (ev.total > 0 && bytesPerSec > 0) {
          const remaining = ev.total - ev.current;
          if (remaining > 0) {
            etaSeconds = Math.ceil(remaining / bytesPerSec);
          }
        }
      }
    }

    return {
      ...ev,
      bytesPerSec,
      etaSeconds,
    };
  }

  reset(): void {
    this.samples = [];
  }
}
