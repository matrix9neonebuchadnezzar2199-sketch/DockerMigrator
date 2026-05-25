import { useState } from 'react';
import type { ProbeSummary, DmigErrorPayload } from '../../shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import { useDmigProgress } from './useDmigProgress.js';

/**
 * 中断パック再開ダイアログと resumeExport 実行を Import / Resume で共有する。
 */
export function useResumeFlow(
  onSuccessMessage: (msg: string) => void,
  setError: (e: DmigErrorPayload | null) => void,
  onAfterSuccess?: () => void | Promise<void>,
  onCancelMessage?: (msg: string) => void,
) {
  const [resumeSummary, setResumeSummary] = useState<ProbeSummary | null>(null);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeRunning, setResumeRunning] = useState(false);
  const [resumeJobToken, setResumeJobToken] = useState<string | null>(null);
  const transferProgress = useDmigProgress('transfer');

  const openResumeDialog = (summary: ProbeSummary) => {
    setResumeSummary(summary);
    setResumeDialogOpen(true);
  };

  const closeResumeDialog = () => {
    if (resumeRunning) return;
    setResumeDialogOpen(false);
    setResumeSummary(null);
  };

  const onConfirmResume = async () => {
    if (!resumeSummary) return;
    const jobToken = crypto.randomUUID();
    setResumeJobToken(jobToken);
    transferProgress.clear();
    setResumeRunning(true);
    const r = await window.dmig.resumeExport({
      packageDir: resumeSummary.packageDir,
      jobToken,
      compressionLevel: 3,
    });
    setResumeRunning(false);
    setResumeJobToken(null);
    transferProgress.clear();
    if (r.ok) {
      setResumeDialogOpen(false);
      setResumeSummary(null);
      onSuccessMessage('エクスポートの再開が完了しました。');
      await onAfterSuccess?.();
    } else if (r.error.code === ErrorCodes.JOB_CANCELLED) {
      setResumeDialogOpen(false);
      setResumeSummary(null);
      (onCancelMessage ?? onSuccessMessage)('再開ジョブを中止しました。');
    } else {
      setError(r.error);
    }
  };

  const onCancelResumeJob = () => {
    if (resumeJobToken) void window.dmig.cancel(resumeJobToken);
  };

  return {
    resumeSummary,
    resumeDialogOpen,
    resumeRunning,
    resumeJobToken,
    transferProgress,
    openResumeDialog,
    onConfirmResume,
    onCancelResumeJob,
    closeResumeDialog,
  };
}
