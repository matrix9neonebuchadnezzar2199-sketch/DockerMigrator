import type { ZodType } from 'zod';

import { formatIpcSchemaError } from '@shared/ipcSchemas.js';
import { DmigError } from '../core/errors/DmigError.js';
import { ErrorCodes } from '../core/errors/codes.js';

/**
 * IPC ハンドラ入口で Renderer からの引数を検証する。
 *
 * @throws DmigError IPC_REQUEST_INVALID
 */
export function parseIpcArgs<T>(schema: ZodType<T>, raw: unknown, channel: string): T {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  throw new DmigError(ErrorCodes.IPC_REQUEST_INVALID, {
    detail: `${channel}: ${formatIpcSchemaError(result.error)}`,
  });
}
