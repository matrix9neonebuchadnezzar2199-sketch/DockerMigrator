import { ipcMain } from 'electron';
import { promises as fsp } from 'node:fs';
import { ErrorCodes, ErrorMessages } from '../core/errors/codes.js';
import { SizeEstimator } from '../core/SizeEstimator.js';
import { SpaceChecker } from '../core/SpaceChecker.js';
import { ErrorReporter } from '../core/ErrorReporter.js';
import type { PreflightRequest, ErrorReportRequest } from '@shared/types.js';
import { preflightRequestSchema } from '@shared/ipcSchemas.js';
import type { HandlerDeps } from './shared.js';
import { toPayload } from './shared.js';
import { parseIpcArgs } from './ipcValidate.js';

export function registerPreflightHandlers(deps: HandlerDeps): void {
  const { docker } = deps;

  ipcMain.handle('dmig:preflight', async (_e, raw: unknown) => {
    let req: PreflightRequest;
    try {
      req = parseIpcArgs(preflightRequestSchema, raw, 'dmig:preflight');
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
    try {
      try {
        await fsp.access(req.outputDir);
      } catch {
        return {
          ok: false as const,
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
            ok: false as const,
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
          ok: false as const,
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

      return { ok: true as const, data: { estimate, space, warnings } };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });

  ipcMain.handle('dmig:saveErrorReport', async (_e, req: ErrorReportRequest) => {
    try {
      const reporter = new ErrorReporter();
      const result = await reporter.generate(req);
      return { ok: true as const, data: result };
    } catch (e) {
      return { ok: false as const, error: toPayload(e) };
    }
  });
}
