import React from 'react';
import type { DryRunRequest } from '../../shared/types.js';
import { DryRunResultList } from './DryRunResultList.js';
import { useDryRun } from '../hooks/useDryRun.js';

export interface DryRunInlineSectionProps {
  /** 実行時に組み立てるリクエスト。null のときボタン無効 */
  buildRequest: () => DryRunRequest | null;
  /** 親が主要アクションに警告ツールチップを出すため */
  onHasErrorFindings?: (hasErrors: boolean) => void;
}

/**
 * Compose / Export ページ内のドライラン実行ブロック。
 */
export const DryRunInlineSection: React.FC<DryRunInlineSectionProps> = ({
  buildRequest,
  onHasErrorFindings,
}) => {
  const { status, result, error, run, reset, hasErrorFindings } = useDryRun();

  React.useEffect(() => {
    onHasErrorFindings?.(hasErrorFindings);
  }, [hasErrorFindings, onHasErrorFindings]);

  const onRun = () => {
    const req = buildRequest();
    if (!req) {
      return;
    }
    reset();
    void run(req);
  };

  const disabled = !buildRequest() || status === 'running';

  return (
    <section className="card dryrun-inline-section" aria-label="ドライラン">
      <h3>ドライラン実行</h3>
      <p className="dryrun-inline-lead">
        書き出し前に容量・シークレット等を検査します（ブロックはしません）。
      </p>
      <button type="button" onClick={onRun} disabled={disabled}>
        {status === 'running' ? '検査中…' : 'ドライラン実行'}
      </button>
      {error ? (
        <p className="dryrun-error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <DryRunResultList findings={result.findings} warnings={result.warnings} />
      ) : null}
    </section>
  );
};
