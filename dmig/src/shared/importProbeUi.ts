import type { PackageProbeStatus, ProbeSummary } from './types.js';

/** `probePackage` 成功後の Import 画面での次アクション。 */
export type ImportProbeGate =
  | { action: 'load_manifest'; summary: ProbeSummary }
  | { action: 'resume_dialog'; summary: ProbeSummary }
  | { action: 'show_probe_error'; summary: ProbeSummary };

const ERROR_STATUSES: ReadonlySet<PackageProbeStatus> = new Set([
  'invalid_manifest',
  'invalid_partial',
  'missing_dir',
  'missing_manifest',
  'version_incompatible',
]);

/**
 * プローブ成功時のサマリから、Import UI の分岐を決める。
 *
 * Args:
 *   summary: `probePackage` が `ok: true` で返した `ProbeSummary`。
 *
 * Returns:
 *   マニフェスト読込・再開確認・エラー表示のいずれか。
 */
export function gateImportAfterProbe(summary: ProbeSummary): ImportProbeGate {
  if (summary.status === 'ok_complete') {
    return { action: 'load_manifest', summary };
  }
  if (summary.status === 'ok_partial') {
    return { action: 'resume_dialog', summary };
  }
  if (ERROR_STATUSES.has(summary.status)) {
    return { action: 'show_probe_error', summary };
  }
  // 将来のステータス追加時は安全側（エラー表示）に倒す
  return { action: 'show_probe_error', summary };
}
