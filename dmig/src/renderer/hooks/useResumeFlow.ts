import { useState } from 'react';
import type { ProbeSummary, DmigErrorPayload } from '../../shared/types.js';
import { ErrorCodes } from '@shared/codes.js';
import { useJobLock } from '../context/JobLockContext.js';
import { useDmigProgress } from './useDmigProgress.js';
import {
  RESUME_LATE_CANCEL_SUCCESS_MESSAGE,
  RESUME_SUCCESS_MESSAGE,
  useDoneProgressNotice,
} from './useDoneProgressNotice.js';

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
  const { tryBegin, end } = useJobLock();
  const transferProgress = useDmigProgress('transfer');
  const { cancelRequestedOnDone, clear: clearDoneNotice } = useDoneProgressNotice('transfer');

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
    if (!tryBegin('resume')) return;
    const jobToken = crypto.randomUUID();
    setResumeJobToken(jobToken);
    transferProgress.clear();
    clearDoneNotice();
    setResumeRunning(true);
    let r;
    try {
      r = await window.dmig.resumeExport({
        packageDir: resumeSummary.packageDir,
        jobToken,
        compressionLevel: 3,
      });
    } finally {
      setResumeRunning(false);
      setResumeJobToken(null);
      end('resume');
      transferProgress.clear();
    }
    if (r.ok) {
      setResumeDialogOpen(false);
      setResumeSummary(null);
      onSuccessMessage(
        cancelRequestedOnDone ? RESUME_LATE_CANCEL_SUCCESS_MESSAGE : RESUME_SUCCESS_MESSAGE,
      );
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
