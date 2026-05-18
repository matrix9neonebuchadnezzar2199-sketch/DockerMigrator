import React from 'react';
import type { PackageProbeStatus, ProbeSummary } from '../../shared/types.js';

function statusTitle(status: PackageProbeStatus): string {
  switch (status) {
    case 'invalid_manifest':
      return 'マニフェストが不正です';
    case 'invalid_partial':
      return '中断状態 (partial) の記述が不正です';
    case 'missing_dir':
      return 'パッケージディレクトリが見つかりません';
    case 'missing_manifest':
      return 'manifest.json がありません';
    case 'version_incompatible':
      return 'ツール版またはスキーマと互換がありません';
    default:
      return 'パッケージを読み取れません';
  }
}

/**
 * プローブ結果が異常系のときの説明パネル。
 */
export const ProbeErrorPanel: React.FC<{ summary: ProbeSummary }> = ({ summary }) => {
  return (
    <div className="card" style={{ borderColor: '#f38ba8' }}>
      <strong style={{ color: '#f38ba8' }}>⚠ {statusTitle(summary.status)}</strong>
      <p style={{ marginTop: 10, color: '#cdd6f4' }}>
        パスを確認するか、別のパッケージを選択してください。
      </p>
      {summary.diagnostic && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', color: '#a6adc8' }}>詳細（開発者向け）</summary>
          <pre
            style={{
              marginTop: 8,
              padding: 8,
              background: '#181825',
              borderRadius: 6,
              fontSize: 12,
              overflow: 'auto',
              maxHeight: 200,
            }}
          >
            {summary.diagnostic}
          </pre>
        </details>
      )}
    </div>
  );
};
