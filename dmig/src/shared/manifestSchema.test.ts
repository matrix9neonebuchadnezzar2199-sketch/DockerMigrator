import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  buildMinimalValidManifest,
  formatManifestSchemaError,
  parseDmigManifestPayload,
} from './manifestSchema.js';

describe('manifestSchema (U6-06)', () => {
  it('最小 valid manifest を受理する', () => {
    const m = buildMinimalValidManifest();
    expect(parseDmigManifestPayload(m).dmigVersion).toBe('1.1');
  });

  it('必須フィールド欠落を拒否する', () => {
    const broken = { dmigVersion: '1.1' };
    expect(() => parseDmigManifestPayload(broken)).toThrow(ZodError);
    try {
      parseDmigManifestPayload(broken);
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      expect(formatManifestSchemaError(e as ZodError)).toContain('contents');
    }
  });

  it('partialState の空 pendingChunks は parse 可能（E2075 は Importer 層）', () => {
    const m = buildMinimalValidManifest({
      partialState: {
        pendingChunks: [],
        lastUpdatedAt: new Date().toISOString(),
        checksumPolicy: 'verify-all',
      },
    });
    expect(parseDmigManifestPayload(m).partialState?.pendingChunks).toEqual([]);
  });

  it('legacy dmigVersion 0.x はスキーマ上は string として通る（major 判定は Importer）', () => {
    const m = buildMinimalValidManifest({ dmigVersion: '0.2.0-poc' });
    expect(parseDmigManifestPayload(m).dmigVersion).toBe('0.2.0-poc');
  });
});
