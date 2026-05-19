import { describe, expect, it } from 'vitest';

import type { ComposeProjectInfo, PreflightResult, ProbeSummary } from '@shared/types.js';
import {
  isSafeBindMountHostPath,
  normalizeBindMounts,
  normalizeCapacity,
  normalizeProbe,
  normalizeSecrets,
} from './dryRunNormalizers.js';

describe('dryRunNormalizers', () => {
  it('normalizeCapacity: insufficient は error', () => {
    const preflight: PreflightResult = {
      estimate: {
        imagesEstimated: 1,
        volumesEstimated: 0,
        contextsEstimated: 0,
        totalEstimated: 1_000_000_000,
        breakdown: [],
      },
      space: {
        path: '/out',
        totalBytes: 10_000_000_000,
        freeBytes: 100,
        requiredBytes: 1_000_000_000,
        recommendedBytes: 1_100_000_000,
        status: 'insufficient',
      },
      warnings: [],
    };
    const findings = normalizeCapacity(preflight, null);
    expect(findings.some((f) => f.severity === 'error' && f.category === 'capacity')).toBe(true);
  });

  it('normalizeCapacity: preflight エラーは error finding', () => {
    const findings = normalizeCapacity(null, {
      code: 'COMPOSE_NOT_FOUND',
      message: 'プロジェクトが見つかりません',
    });
    expect(findings[0]?.severity).toBe('error');
  });

  it('normalizeSecrets: high は error', () => {
    const findings = normalizeSecrets({
      web: [
        {
          filePath: '/app/.env',
          findings: [
            {
              line: 1,
              key: 'AWS_KEY',
              preview: 'AKIA***',
              ruleName: 'aws-access-key-id',
              severity: 'high',
            },
          ],
        },
      ],
    });
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.category).toBe('secret');
  });

  it('normalizeBindMounts: 書き込み可能は warn、:ro は info', () => {
    const projects: ComposeProjectInfo[] = [
      {
        name: 'app',
        configFiles: [],
        workingDir: '/w',
        services: [],
        volumeNames: [],
        bindMounts: [
          {
            serviceName: 'web',
            hostPath: '/var/data',
            containerPath: '/data',
            readOnly: false,
          },
          {
            serviceName: 'web',
            hostPath: '/etc/timezone',
            containerPath: '/etc/timezone',
            readOnly: true,
          },
        ],
        envFiles: [],
        estimatedSize: 0,
      },
    ];
    const findings = normalizeBindMounts(projects, ['app']);
    const writable = findings.find((f) => f.target?.includes('web') && f.severity === 'warn');
    const ro = findings.find((f) => f.message.includes('/etc/timezone'));
    expect(writable?.severity).toBe('warn');
    expect(ro?.severity).toBe('info');
    expect(findings.some((f) => f.severity === 'error')).toBe(false);
  });

  it('isSafeBindMountHostPath: /etc/timezone は安全', () => {
    expect(isSafeBindMountHostPath('/etc/timezone')).toBe(true);
    expect(isSafeBindMountHostPath('/var/lib/mysql')).toBe(false);
  });

  it('normalizeProbe: invalid_manifest は error', () => {
    const probe: ProbeSummary = {
      packageDir: '/pkg',
      status: 'invalid_manifest',
      manifestPresent: false,
      pendingChunkCount: 0,
      diagnostic: 'JSON parse error',
    };
    const findings = normalizeProbe(probe);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.category).toBe('package');
  });

  it('normalizeProbe: ok_partial は warn', () => {
    const findings = normalizeProbe({
      packageDir: '/pkg',
      status: 'ok_partial',
      manifestPresent: true,
      pendingChunkCount: 2,
    });
    expect(findings[0]?.severity).toBe('warn');
  });
});
