/**
 * USB 等のシーケンシャル書き込みを想定した控えめな転送速度（bytes / sec）。
 * 実機では USB3 / NVMe 直書きの方が速いことが多い。
 */
export const USB_ASSUMED_BYTES_PER_SEC = 35 * 1024 * 1024;

/** バイト数を GB 表記（小数2桁）に整形する。 */
export function formatGbFromBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0.00 GB';
  }
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** 転送バイト数と仮定速度から所要秒数（切り上げ）を返す。 */
export function transferSecondsAtUsbAssumption(transferBytes: number): number {
  if (!Number.isFinite(transferBytes) || transferBytes <= 0) {
    return 0;
  }
  return Math.ceil(transferBytes / USB_ASSUMED_BYTES_PER_SEC);
}

/** 人間可読な所要時間（ProgressBar の ETA と同系）。 */
export function formatEtaHuman(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  if (seconds < 60) {
    return `約 ${seconds} 秒`;
  }
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `約 ${m}分${s}秒`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `約 ${h}時間${m}分`;
}
