import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { flushSync } from 'react-dom';
import type { ProgressEvent, ProgressScope } from '../../shared/types.js';
import { applyProgressScope, matchesProgressScope } from '../../shared/progress.js';

type ProgressListener = (ev: ProgressEvent) => void;

type Subscription = {
  listener: ProgressListener;
  scopes?: ProgressScope | ProgressScope[];
};

type ProgressBusContextValue = {
  subscribe: (
    scopes: ProgressScope | ProgressScope[] | undefined,
    listener: ProgressListener,
  ) => () => void;
};

const ProgressBusContext = createContext<ProgressBusContextValue | null>(null);

export const ProgressBusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const subscriptionsRef = useRef<Set<Subscription>>(new Set());

  useEffect(() => {
    return window.dmig.onProgress((raw) => {
      const ev = applyProgressScope(raw);
      flushSync(() => {
        for (const sub of subscriptionsRef.current) {
          if (!sub.scopes || matchesProgressScope(ev, sub.scopes)) {
            sub.listener(ev);
          }
        }
      });
    });
  }, []);

  const subscribe = useCallback(
    (scopes: ProgressScope | ProgressScope[] | undefined, listener: ProgressListener) => {
      const sub: Subscription = { listener, scopes };
      subscriptionsRef.current.add(sub);
      return () => {
        subscriptionsRef.current.delete(sub);
      };
    },
    [],
  );

  const value = useMemo(() => ({ subscribe }), [subscribe]);

  return <ProgressBusContext.Provider value={value}>{children}</ProgressBusContext.Provider>;
};

export function useProgressBus(): ProgressBusContextValue {
  const ctx = useContext(ProgressBusContext);
  if (!ctx) {
    throw new Error('useProgressBus must be used within ProgressBusProvider');
  }
  return ctx;
}
