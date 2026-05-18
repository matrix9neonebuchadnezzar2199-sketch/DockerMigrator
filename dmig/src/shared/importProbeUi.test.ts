import { describe, expect, it } from 'vitest';
import { gateImportAfterProbe } from './importProbeUi.js';
import type { ProbeSummary } from './types.js';

function baseSummary(over: Partial<ProbeSummary>): ProbeSummary {
  return {
    packageDir: '/tmp/pack.dmig',
    status: 'ok_complete',
    manifestPresent: true,
    schemaVersion: '1.1',
    dmigVersion: '0.1.0',
    pendingChunkCount: 0,
    ...over,
  };
}

describe('gateImportAfterProbe', () => {
  it('ok_complete → load_manifest', () => {
    const s = baseSummary({ status: 'ok_complete', pendingChunkCount: 0 });
    expect(gateImportAfterProbe(s)).toEqual({ action: 'load_manifest', summary: s });
  });

  it('ok_partial → resume_dialog', () => {
    const s = baseSummary({
      status: 'ok_partial',
      pendingChunkCount: 2,
      pendingChunksPreview: [{ contentKind: 'image', contentId: 'x', chunkIndex: 0 }],
    });
    expect(gateImportAfterProbe(s)).toEqual({ action: 'resume_dialog', summary: s });
  });

  it.each([
    'invalid_manifest',
    'invalid_partial',
    'missing_dir',
    'missing_manifest',
    'version_incompatible',
  ] as const)('%s → show_probe_error', (status) => {
    const missing = status === 'missing_dir' || status === 'missing_manifest';
    const s = baseSummary({
      status,
      manifestPresent: !missing,
      pendingChunkCount: 0,
      diagnostic: 'detail',
    });
    expect(gateImportAfterProbe(s)).toEqual({ action: 'show_probe_error', summary: s });
  });
});
