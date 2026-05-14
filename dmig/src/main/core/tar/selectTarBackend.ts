import type { TarBackendKind } from '@shared/types.js';

import type { TarBackend } from './TarBackend.js';
import { SystemTarBackend } from './SystemTarBackend.js';
import { TarStreamBackend } from './TarStreamBackend.js';

/**
 * tar バックエンドの選択。
 *
 * 優先順位:
 *   1. 引数で明示指定 ('system' | 'stream')
 *   2. 環境変数 DMIG_TAR_BACKEND
 *   3. SystemTarBackend.probe() の結果（true なら system、false なら stream）
 *
 * 結果はモジュールスコープでキャッシュする（probe コスト削減）。
 */

let cached: TarBackend | null = null;
let cachedKind: TarBackendKind | null = null;

export async function selectTarBackend(override?: TarBackendKind): Promise<TarBackend> {
  const kind = resolveKind(override);

  if (cached && cachedKind === kind) {
    return cached;
  }

  let backend: TarBackend;
  if (kind === 'stream') {
    backend = new TarStreamBackend();
  } else if (kind === 'system') {
    backend = new SystemTarBackend();
  } else {
    const sys = new SystemTarBackend();
    const ok = await sys.probe();
    backend = ok ? sys : new TarStreamBackend();
  }

  cached = backend;
  cachedKind = kind;
  return backend;
}

/**
 * テスト用にキャッシュをリセット。
 */
export function resetTarBackendCache(): void {
  cached = null;
  cachedKind = null;
}

function resolveKind(override: TarBackendKind | undefined): TarBackendKind {
  if (override === 'system' || override === 'stream') return override;
  if (override === 'auto') return 'auto';

  const env = process.env.DMIG_TAR_BACKEND;
  if (env === 'system' || env === 'stream') return env;

  return 'auto';
}
