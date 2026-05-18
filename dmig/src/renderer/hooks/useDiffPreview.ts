/**
 * Phase 6: 差分プレビュー取得用カスタムフック。
 * 重複呼び出し時は前ジョブを cancel してから新規 computeDiff を実行する。
 */
import { useCallback, useRef, useState } from 'react';
import type { DiffPreviewRequest, DiffPreviewResult, DmigErrorPayload } from '../../shared/types.js';

export interface UseDiffPreviewState {
  loading: boolean;
  error: DmigErrorPayload | null;
  preview: DiffPreviewResult | null;
  /** 成功時 true。重複呼び出しで無視された場合は false。 */
  refresh: (req: DiffPreviewRequest) => Promise<boolean>;
  reset: () => void;
}

export function useDiffPreview(): UseDiffPreviewState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DmigErrorPayload | null>(null);
  const [preview, setPreview] = useState<DiffPreviewResult | null>(null);
  const tokenRef = useRef<string | null>(null);

  const refresh = useCallback(async (req: DiffPreviewRequest): Promise<boolean> => {
    if (tokenRef.current) {
      try {
        await window.dmig.cancel(tokenRef.current);
      } catch {
        /* キャンセル失敗は無視 */
      }
    }
    const token = crypto.randomUUID();
    tokenRef.current = token;

    setLoading(true);
    setError(null);
    try {
      const result = await window.dmig.computeDiff({ ...req, jobToken: token });
      if (tokenRef.current !== token) return false;
      if (result.ok) {
        setPreview(result.data);
        return true;
      }
      setError(result.error);
      setPreview(null);
      return false;
    } finally {
      if (tokenRef.current === token) {
        setLoading(false);
        tokenRef.current = null;
      }
    }
  }, []);

  const reset = useCallback(() => {
    setPreview(null);
    setError(null);
    setLoading(false);
    tokenRef.current = null;
  }, []);

  return { loading, error, preview, refresh, reset };
}
