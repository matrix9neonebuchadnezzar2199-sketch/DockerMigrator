import { describe, expect, it } from 'vitest';

import { exportRequestSchema, importRequestSchema } from './ipcSchemas.js';

describe('ipcSchemas (U6-04)', () => {
  it('exportRequestSchema は最小 valid を受理する', () => {
    const parsed = exportRequestSchema.parse({
      imageNames: ['alpine:latest'],
      outputDir: 'F:\\out',
      jobToken: '00000000-0000-4000-8000-000000000001',
    });
    expect(parsed.outputDir).toBe('F:\\out');
  });

  it('importRequestSchema は packageDir 必須', () => {
    expect(() =>
      importRequestSchema.parse({
        selectedImages: [],
      }),
    ).toThrow();
  });
});
