import { useCallback, useLayoutEffect, useState } from 'react';
import type { ProgressEvent, ProgressScope } from '../../shared/types.js';
import { useProgressBus } from '../context/ProgressBusContext.js';

/**
 * ProgressBus 経由で scope フィルタした進捗を購読する。
 * flushSync は ProgressBusProvider 内に集約。
 */
export function useDmigProgress(scope?: ProgressScope | ProgressScope[]) {
  const { subscribe } = useProgressBus();
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  useLayoutEffect(() => {
    return subscribe(scope, (ev) => setProgress(ev));
  }, [subscribe, scope]);

  const clear = useCallback(() => setProgress(null), []);

  return { progress, setProgress, clear };
}
