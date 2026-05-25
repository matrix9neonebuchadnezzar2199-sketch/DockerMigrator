import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PageKey } from '../App.js';

export type DynamicCta = {
  label: string;
  targetPage: PageKey;
};

type DynamicCtaContextValue = {
  dynamicCta: DynamicCta | null;
  setDynamicCta: (cta: DynamicCta | null) => void;
};

const DynamicCtaContext = createContext<DynamicCtaContextValue | null>(null);

export const DynamicCtaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dynamicCta, setDynamicCtaState] = useState<DynamicCta | null>(null);
  const setDynamicCta = useCallback((cta: DynamicCta | null) => {
    setDynamicCtaState(cta);
  }, []);
  const value = useMemo(() => ({ dynamicCta, setDynamicCta }), [dynamicCta, setDynamicCta]);
  return <DynamicCtaContext.Provider value={value}>{children}</DynamicCtaContext.Provider>;
};

export function useDynamicCta(): DynamicCtaContextValue {
  const ctx = useContext(DynamicCtaContext);
  if (!ctx) {
    throw new Error('useDynamicCta must be used within DynamicCtaProvider');
  }
  return ctx;
}

/** 作業ページ完了時に Footer 動的 CTA を登録し、アンマウントでクリアする。 */
export function usePageDynamicCta(cta: DynamicCta | null): void {
  const { setDynamicCta } = useDynamicCta();
  const label = cta?.label ?? null;
  const targetPage = cta?.targetPage ?? null;

  React.useEffect(() => {
    setDynamicCta(label != null && targetPage != null ? { label, targetPage } : null);
    return () => setDynamicCta(null);
  }, [label, targetPage, setDynamicCta]);
}
