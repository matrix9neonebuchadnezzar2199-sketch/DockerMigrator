import { ipcMain } from 'electron';
import { promises as fsp } from 'node:fs';

import type { DryRunRequest, DryRunResult, PreflightResult } from '@shared/types.js';
import type { DmigErrorPayload } from '@shared/types.js';
import { ErrorCodes, ErrorMessages } from '../core/errors/codes.js';
import { Importer } from '../core/Importer.js';
import { SecretScanner } from '../core/SecretScanner.js';
import { SizeEstimator } from '../core/SizeEstimator.js';
import { SpaceChecker } from '../core/SpaceChecker.js';
import {
  normalizeBindMounts,
  normalizeCapacity,
  normalizeProbe,
  normalizeSecrets,
} from '../core/dryRunNormalizers.js';
import type { HandlerDeps } from './shared.js';

type Result<T> = { ok: true; data: T } | { ok: false; error: DmigErrorPayload };

function emptyResult(startedAt: string, warnings: string[]): DryRunResult {
  return {
    findings: [],
    startedAt,
    finishedAt: new Date().toISOString(),
    warnings,
  };
}

async function runPreflightCore(
  deps: HandlerDeps,
  req: { outputDir: string; projectNames?: string[]; imageNames?: string[] },
): Promise<Result<PreflightResult>> {
  const { docker } = deps;
  try {
    await fsp.access(req.outputDir);
  } catch {
    return {
      ok: false,
      error: {
        code: ErrorCodes.USB_PATH_NOT_FOUND,
        message: ErrorMessages[ErrorCodes.USB_PATH_NOT_FOUND],
        detail: `path=${req.outputDir}`,
      },
    };
  }

  const estimator = new SizeEstimator(docker);
  const checker = new SpaceChecker();

  let estimate: Awaited<ReturnType<SizeEstimator['estimateForCompose']>>;

  if (req.projectNames && req.projectNames.length > 0) {
    const allProjects = await docker.listComposeProjects();
    const targets = allProjects.filter((p) => req.projectNames!.includes(p.name));
    if (targets.length === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCodes.COMPOSE_NOT_FOUND,
          message: ErrorMessages[ErrorCodes.COMPOSE_NOT_FOUND],
          detail: `projectNames=${req.projectNames.join(',')}`,
        },
      };
    }
    estimate = await estimator.estimateForCompose(targets);
  } else if (req.imageNames && req.imageNames.length > 0) {
    estimate = await estimator.estimateForImages(req.imageNames);
  } else {
    return {
      ok: false,
      error: {
        code: ErrorCodes.PREFLIGHT_FAILED,
        message: ErrorMessages[ErrorCodes.PREFLIGHT_FAILED],
        detail: 'projectNames または imageNames を指定してください',
      },
    };
  }

  const space = await checker.check(req.outputDir, estimate.totalEstimated);
  const warnings: string[] = [];
  if (space.status === 'warning') {
    warnings.push(ErrorMessages[ErrorCodes.DISK_SPACE_WARNING]);
  }

  return { ok: true, data: { estimate, space, warnings } };
}

async function scanSecretsForProjects(
  deps: HandlerDeps,
  projectNames: string[],
): Promise<Record<string, import('@shared/types.js').SecretScanResult[]>> {
  const allProjects = await deps.docker.listComposeProjects();
  const targets = allProjects.filter((p) => projectNames.includes(p.name));
  const scanner = new SecretScanner();
  const result: Record<string, import('@shared/types.js').SecretScanResult[]> = {};

  for (const proj of targets) {
    const scans: import('@shared/types.js').SecretScanResult[] = [];
    for (const env of proj.envFiles) {
      let exists = false;
      try {
        await fsp.access(env.path);
        exists = true;
      } catch {
        /* ファイルなし */
      }
      if (!exists) {
        continue;
      }
      const scan = await scanner.scanFile(env.path);
      if (scan.findings.length > 0) {
        scans.push(scan);
      }
    }
    if (scans.length > 0) {
      result[proj.name] = scans;
    }
  }

  return result;
}

export function registerDryRunHandlers(deps: HandlerDeps): void {
  ipcMain.handle('dmig:runDryRun', async (_e, req: DryRunRequest) => {
    const startedAt = new Date().toISOString();
    const warnings: string[] = [];
    const findings: import('@shared/types.js').DryRunFinding[] = [];

    try {
      if (req.mode === 'compose-project') {
        if (!req.outputDir || !req.projectNames?.length) {
          return {
            ok: true as const,
            data: emptyResult(startedAt, [
              'invalid_request: compose-project には outputDir と projectNames が必要です',
            ]),
          };
        }

        const allProjects = await deps.docker.listComposeProjects();
        const preflight = await runPreflightCore(deps, {
          outputDir: req.outputDir,
          projectNames: req.projectNames,
        });

        findings.push(
          ...normalizeCapacity(
            preflight.ok ? preflight.data : null,
            preflight.ok ? null : preflight.error,
          ),
        );

        try {
          const secrets = await scanSecretsForProjects(deps, req.projectNames);
          findings.push(...normalizeSecrets(secrets));
        } catch (e) {
          warnings.push(`secret_scan: ${e instanceof Error ? e.message : String(e)}`);
        }

        findings.push(...normalizeBindMounts(allProjects, req.projectNames));
      } else if (req.mode === 'export-pack') {
        if (req.packageDir) {
          const importer = new Importer(deps.docker);
          const probe = await importer.probe(req.packageDir);
          findings.push(...normalizeProbe(probe));
        } else {
          if (!req.outputDir || !req.imageNames?.length) {
            return {
              ok: true as const,
              data: emptyResult(startedAt, [
                'invalid_request: export-pack（新規）には outputDir と imageNames が必要です',
              ]),
            };
          }
          const preflight = await runPreflightCore(deps, {
            outputDir: req.outputDir,
            imageNames: req.imageNames,
          });
          findings.push(
            ...normalizeCapacity(
              preflight.ok ? preflight.data : null,
              preflight.ok ? null : preflight.error,
            ),
          );
        }
      } else {
        warnings.push(`invalid_request: 不明な mode ${String(req.mode)}`);
      }
    } catch (e) {
      warnings.push(`dry_run: ${e instanceof Error ? e.message : String(e)}`);
    }

    const data: DryRunResult = {
      findings,
      startedAt,
      finishedAt: new Date().toISOString(),
      warnings,
    };

    return { ok: true as const, data };
  });
}
