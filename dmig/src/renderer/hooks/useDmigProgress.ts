import { useCallback, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ProgressEvent } from '../../shared/types.js';
import type { ProgressScope } from '../../shared/types.js';
import { matchesProgressScope } from '../../shared/progress.js';

/**
 * dmig:progress を scope でフィルタして購読する。
 * invoke 中の逐次更新は Main 側 createProgressRelay + flushSync で描画する。
 */
export function useDmigProgress(scope?: ProgressScope | ProgressScope[]) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  useLayoutEffect(() => {
    return window.dmig.onProgress((ev) => {
      if (scope && !matchesProgressScope(ev, scope)) {
        return;
      }
      flushSync(() => setProgress(ev));
    });
  }, [scope]);

  const clear = useCallback(() => setProgress(null), []);

  return { progress, setProgress, clear };
}
