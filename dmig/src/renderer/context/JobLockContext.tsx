import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/** Renderer 側で同種ジョブの二重開始を防ぐ種別。 */
export type JobLockKind = 'export' | 'import' | 'resume' | 'rollback';

export type JobLockFlags = Record<JobLockKind, boolean>;

const INITIAL_FLAGS: JobLockFlags = {
  export: false,
  import: false,
  resume: false,
  rollback: false,
};

type JobLockContextValue = {
  flags: JobLockFlags;
  blockedMessage: string | null;
  tryBegin: (kind: JobLockKind) => boolean;
  end: (kind: JobLockKind) => void;
  clearBlockedMessage: () => void;
};

const JobLockContext = createContext<JobLockContextValue | null>(null);

export const JobLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<JobLockFlags>(INITIAL_FLAGS);
  const flagsRef = useRef<JobLockFlags>(INITIAL_FLAGS);
  flagsRef.current = flags;
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const tryBegin = useCallback((kind: JobLockKind): boolean => {
    if (flagsRef.current[kind]) {
      setBlockedMessage('同じ種類の処理が実行中です。完了するまでお待ちください。');
      return false;
    }
    const next = { ...flagsRef.current, [kind]: true };
    flagsRef.current = next;
    setFlags(next);
    setBlockedMessage(null);
    return true;
  }, []);

  const end = useCallback((kind: JobLockKind) => {
    const next = { ...flagsRef.current, [kind]: false };
    flagsRef.current = next;
    setFlags(next);
  }, []);

  const clearBlockedMessage = useCallback(() => setBlockedMessage(null), []);

  const value = useMemo(
    () => ({ flags, blockedMessage, tryBegin, end, clearBlockedMessage }),
    [flags, blockedMessage, tryBegin, end, clearBlockedMessage],
  );

  return <JobLockContext.Provider value={value}>{children}</JobLockContext.Provider>;
};

export function useJobLock(): JobLockContextValue {
  const ctx = useContext(JobLockContext);
  if (!ctx) {
    throw new Error('useJobLock must be used within JobLockProvider');
  }
  return ctx;
}
