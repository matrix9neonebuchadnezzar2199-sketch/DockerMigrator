import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ComposeProjectInfo, DmigManifest } from '../../shared/types.js';

export type ComposePageTab = 'export' | 'import';

/** Compose ページ離脱後も保持するスナップショット。 */
export type ComposePageSnapshot = {
  tab: ComposePageTab;
  outputDir: string;
  selectedProjectNames: string[];
  projects: ComposeProjectInfo[];
  importPackDir: string;
  importManifest: DmigManifest | null;
  importSelectedNames: string[];
  exportFlowUnlocked: number;
  exportFlowExpanded: number;
  diffMode: boolean;
  strictVolume: boolean;
  selectedSnapshotId: string;
};

const DEFAULT_SNAPSHOT: ComposePageSnapshot = {
  tab: 'export',
  outputDir: '',
  selectedProjectNames: [],
  projects: [],
  importPackDir: '',
  importManifest: null,
  importSelectedNames: [],
  exportFlowUnlocked: 1,
  exportFlowExpanded: 1,
  diffMode: false,
  strictVolume: false,
  selectedSnapshotId: '',
};

type ComposePageStateContextValue = {
  snapshot: ComposePageSnapshot;
  updateSnapshot: (patch: Partial<ComposePageSnapshot>) => void;
  replaceSnapshot: (next: ComposePageSnapshot) => void;
};

const ComposePageStateContext = createContext<ComposePageStateContextValue | null>(null);

export const ComposePageStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<ComposePageSnapshot>(DEFAULT_SNAPSHOT);

  const updateSnapshot = useCallback((patch: Partial<ComposePageSnapshot>) => {
    setSnapshot((prev) => ({ ...prev, ...patch }));
  }, []);

  const replaceSnapshot = useCallback((next: ComposePageSnapshot) => {
    setSnapshot(next);
  }, []);

  const value = useMemo(
    () => ({ snapshot, updateSnapshot, replaceSnapshot }),
    [snapshot, updateSnapshot, replaceSnapshot],
  );

  return (
    <ComposePageStateContext.Provider value={value}>{children}</ComposePageStateContext.Provider>
  );
};

export function useComposePageState(): ComposePageStateContextValue {
  const ctx = useContext(ComposePageStateContext);
  if (!ctx) {
    throw new Error('useComposePageState must be used within ComposePageStateProvider');
  }
  return ctx;
}

export { DEFAULT_SNAPSHOT };
