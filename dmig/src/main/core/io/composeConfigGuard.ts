import { stat } from 'node:fs/promises';

import { MAX_COMPOSE_CONFIG_FILE_BYTES } from '@shared/limits.js';
import { DmigError } from '../errors/DmigError.js';
import { ErrorCodes } from '../errors/codes.js';

/**
 * compose 設定ファイルのサイズ上限を検査する（UPDATE-07 U6-08）。
 *
 * @throws DmigError E2012 上限超過
 */
export async function assertComposeConfigFileWithinLimit(configPath: string): Promise<void> {
  let size: number;
  try {
    const st = await stat(configPath);
    size = st.size;
  } catch {
    return;
  }
  if (size > MAX_COMPOSE_CONFIG_FILE_BYTES) {
    throw new DmigError(ErrorCodes.COMPOSE_CONFIG_READ_FAILED, {
      detail: `config too large: path=${configPath} bytes=${size} max=${MAX_COMPOSE_CONFIG_FILE_BYTES}`,
    });
  }
}
