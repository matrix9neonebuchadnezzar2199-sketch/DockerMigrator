import React, { useEffect, useState } from 'react';
import type { RollbackKind, RollbackRecord } from '../../shared/types.js';
import { useRollback } from '../hooks/useRollback.js';
import { RollbackConfirmDialog } from './RollbackConfirmDialog.js';
import { RollbackResultSummary } from './RollbackResultSummary.js';

export interface RollbackInlineSectionProps {
  mode: RollbackKind;
  packageDir: string;
}

export const RollbackInlineSection: React.FC<RollbackInlineSectionProps> = ({ mode, packageDir }) => {
  const { status, lastResult, error, runRollback, reset } = useRollback();
  const [record, setRecord] = useState<RollbackRecord | null | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!packageDir.trim()) {
      setRecord(undefined);
      return;
    }
    void window.dmig.loadRollbackRecord(packageDir.trim()).then((r) => {
      if (r.ok) {
        setRecord(r.data);
      } else {
        setRecord(null);
      }
    });
  }, [packageDir]);

  const supported = record != null && record.kind === mode && !record.executedAt;
  const unsupported = packageDir.trim() && record === null;

  const openDialog = () => {
    reset();
    setDialogOpen(true);
  };

  const onConfirm = async () => {
    if (!record) {
      return;
    }
    await runRollback(record.packageDir);
    setDialogOpen(false);
    const refreshed = await window.dmig.loadRollbackRecord(record.packageDir);
    if (refreshed.ok) {
      setRecord(refreshed.data);
    }
  };

  return (
    <section className="card rollback-inline-section" aria-label="ロールバック">
      <h3>直近の操作を取り消す</h3>
      {unsupported ? (
        <p className="rollback-unsupported">このパッケージはロールバックに対応していません（M10 以前）。</p>
      ) : null}
      {record?.executedAt ? (
        <p className="rollback-warn">ロールバックは既に実行済みです（{record.executedAt}）。</p>
      ) : null}
      <button
        type="button"
        onClick={openDialog}
        disabled={!supported || status === 'running' || !packageDir.trim()}
      >
        {status === 'running' ? '実行中…' : 'ロールバック実行'}
      </button>
      {error ? (
        <p className="rollback-error" role="alert">
          {error}
        </p>
      ) : null}
      {lastResult ? <RollbackResultSummary result={lastResult} /> : null}
      {dialogOpen && record ? (
        <RollbackConfirmDialog
          packageDir={record.packageDir}
          kind={record.kind}
          createdAt={record.createdAt}
          entries={record.entries}
          busy={status === 'running'}
          onConfirm={() => void onConfirm()}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </section>
  );
};
