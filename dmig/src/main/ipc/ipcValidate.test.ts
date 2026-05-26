import { describe, expect, it } from 'vitest';

import { importRequestSchema } from '@shared/ipcSchemas.js';
import { ErrorCodes } from '../core/errors/codes.js';
import { DmigError } from '../core/errors/DmigError.js';
import { parseIpcArgs } from './ipcValidate.js';

describe('parseIpcArgs', () => {
  it('不正形状は E9010', () => {
    expect(() => parseIpcArgs(importRequestSchema, {}, 'dmig:import')).toThrow(DmigError);
    try {
      parseIpcArgs(importRequestSchema, {}, 'dmig:import');
    } catch (e) {
      expect(e).toBeInstanceOf(DmigError);
      expect((e as DmigError).code).toBe(ErrorCodes.IPC_REQUEST_INVALID);
    }
  });
});
