import { access, lstat, readdir, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { assertPathUnderRoot, safeJoinUnder } from '../security/safeJoinUnder.js';
import writeFileAtomic from 'write-file-atomic';

import type {
  ListRollbacksRequest,
  ListRollbacksResult,
  RollbackEntry,
  RollbackRecord,
  RollbackSummary,
  RunRollbackResult,
} from '@shared/types.js';
import type { DockerAdapter } from './DockerAdapter.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';

export const ROLLBACK_FILENAME = 'rollback.json';
export const MANIFEST_FILENAME = 'manifest.json';

export const DEFAULT_ROLLBACK_SCAN_LIMITS = {
  maxRecords: 50,
  maxDirsScanned: 500,
} as const;

/** パック外（manifest なし階層）では走査しないディレクトリ名 */
const PACK_INTERNAL_DIR_NAMES = new Set(['images', 'volumes', 'compose']);

const TRUNCATED_WARNING = 'truncated_at_50';

type EntryOutcome = {
  status: 'succeeded' | 'skipped';
  warning?: string;
};

/**
 * パック内 `rollback.json` の読み書きとロールバック実行。
 */
export class RollbackManager {
  constructor(
    private readonly docker: DockerAdapter,
    private readonly limits = DEFAULT_ROLLBACK_SCAN_LIMITS,
  ) {}

  rollbackPath(packageDir: string): string {
    return safeJoinUnder(packageDir, ROLLBACK_FILENAME);
  }

  async loadRecord(packageDir: string): Promise<RollbackRecord | null> {
    const path = this.rollbackPath(packageDir);
    try {
      const raw = await readFile(path, 'utf-8');
      const parsed = JSON.parse(raw) as RollbackRecord;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
        return null;
      }
      return parsed;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return null;
      }
      throw wrapError(e, ErrorCodes.PACK_FORMAT_INVALID, `loadRecord(${packageDir})`);
    }
  }

  async saveRecord(packageDir: string, record: RollbackRecord): Promise<void> {
    const path = this.rollbackPath(packageDir);
    const json = JSON.stringify(record, null, 2);
    await writeFileAtomic(path, json, { encoding: 'utf8' });
  }

  async listRecords(req: ListRollbacksRequest): Promise<ListRollbacksResult> {
    const warnings: string[] = [];
    const records: RollbackSummary[] = [];
    const maxDepth = RollbackManager.clampDepth(req.maxDepth);

    try {
      await access(req.rootDir);
    } catch {
      return { records: [], warnings: ['root_not_found'] };
    }

    let dirsScanned = 0;
    let truncated = false;

    const visit = async (dir: string, depth: number): Promise<void> => {
      if (truncated || dirsScanned >= this.limits.maxDirsScanned) {
        return;
      }
      dirsScanned += 1;

      let hasManifest = false;
      try {
        await access(join(dir, MANIFEST_FILENAME));
        hasManifest = true;
      } catch {
        hasManifest = false;
      }

      if (hasManifest) {
        const rollback = await this.loadRecord(dir);
        if (rollback) {
          records.push({
            packageDir: dir,
            kind: rollback.kind,
            createdAt: rollback.createdAt,
            executedAt: rollback.executedAt,
            entryCount: rollback.entries.length,
            supported: true,
          });
        } else {
          records.push({
            packageDir: dir,
            kind: 'import',
            createdAt: '',
            entryCount: 0,
            supported: false,
          });
        }
        if (records.length >= this.limits.maxRecords) {
          truncated = true;
          if (!warnings.includes(TRUNCATED_WARNING)) {
            warnings.push(TRUNCATED_WARNING);
          }
        }
        return;
      }

      if (depth >= maxDepth || truncated) {
        return;
      }

      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        warnings.push(`permission_denied:${RollbackManager.safeRel(req.rootDir, dir)}`);
        return;
      }

      for (const ent of entries) {
        if (!ent.isDirectory() || truncated || ent.isSymbolicLink()) {
          continue;
        }
        if (PACK_INTERNAL_DIR_NAMES.has(ent.name)) {
          continue;
        }
        const child = join(dir, ent.name);
        try {
          const childStat = await lstat(child);
          if (childStat.isSymbolicLink()) {
            continue;
          }
        } catch {
          warnings.push(`permission_denied:${RollbackManager.safeRel(req.rootDir, child)}`);
          continue;
        }
        await visit(child, depth + 1);
      }
    };

    await visit(req.rootDir, 0);
    return { records, warnings };
  }

  async executeRollback(
    packageDir: string,
    entryIds?: string[],
    signal?: AbortSignal,
  ): Promise<RunRollbackResult> {
    const record = await this.loadRecord(packageDir);
    const result: RunRollbackResult = {
      succeeded: [],
      skipped: [],
      failed: [],
      warnings: [],
    };

    if (!record) {
      result.warnings.push('target_not_found');
      return result;
    }

    if (record.executedAt) {
      result.warnings.push('already_executed');
      return result;
    }

    const idSet = entryIds ? new Set(entryIds) : null;
    const targets = record.entries.filter((e) => !idSet || idSet.has(e.id));

    for (const entry of targets) {
      if (signal?.aborted) {
        result.cancelled = true;
        break;
      }
      try {
        const outcome = await this.executeOneEntry(entry, record.kind, packageDir);
        if (outcome.status === 'succeeded') {
          result.succeeded.push(entry.id);
        } else {
          result.skipped.push(entry.id);
        }
        if (outcome.warning) {
          result.warnings.push(outcome.warning);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof DmigError) {
          result.warnings.push('docker_unreachable');
        }
        result.failed.push({ id: entry.id, error: msg });
      }
    }

    if (!result.cancelled) {
      record.executedAt = new Date().toISOString();
      await this.saveRecord(packageDir, record);
    }
    return result;
  }

  private async executeOneEntry(
    entry: RollbackEntry,
    kind: RollbackRecord['kind'],
    packageDir: string,
  ): Promise<EntryOutcome> {
    switch (entry.type) {
      case 'docker-image': {
        if (entry.hint?.includes('image_id_unresolved') && !entry.target.startsWith('sha256:')) {
          /* タグフォールバック */
        }
        try {
          await this.docker.removeImage(entry.target);
        } catch {
          throw new DmigError(ErrorCodes.DOCKER_API_ERROR, { detail: entry.target });
        }
        return { status: 'succeeded' };
      }
      case 'docker-volume': {
        try {
          await this.docker.removeVolume(entry.target);
        } catch {
          throw new DmigError(ErrorCodes.VOLUME_IMPORT_FAILED, { detail: entry.target });
        }
        return { status: 'succeeded' };
      }
      case 'docker-network':
        return { status: 'skipped' };
      case 'file':
        if (kind === 'export') {
          assertPathUnderRoot(packageDir, entry.target);
        }
        return this.removeFileOrSymlink(entry.target);
      case 'directory':
        if (kind === 'export') {
          assertPathUnderRoot(packageDir, entry.target);
          return this.removeDirectoryForce(entry.target);
        }
        return this.removeDirectoryIfEmpty(entry);
      default:
        return { status: 'skipped' };
    }
  }

  private async removeFileOrSymlink(target: string): Promise<EntryOutcome> {
    try {
      const st = await lstat(target);
      if (st.isSymbolicLink() || st.isFile()) {
        await rm(target, { force: true });
        return { status: 'succeeded' };
      }
      return { status: 'skipped', warning: 'target_not_found' };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { status: 'skipped', warning: 'target_not_found' };
      }
      throw e;
    }
  }

  private async removeDirectoryIfEmpty(entry: RollbackEntry): Promise<EntryOutcome> {
    const target = entry.target;
    try {
      const st = await lstat(target);
      if (st.isSymbolicLink()) {
        await rm(target, { force: true });
        return { status: 'succeeded' };
      }
      if (!st.isDirectory()) {
        return { status: 'skipped', warning: 'target_not_found' };
      }
      const children = await readdir(target);
      if (children.length > 0) {
        return {
          status: 'skipped',
          warning: `directory_not_empty:${entry.id}`,
        };
      }
      await rm(target, { recursive: true, force: true });
      return { status: 'succeeded' };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { status: 'skipped', warning: 'target_not_found' };
      }
      throw e;
    }
  }

  private async removeDirectoryForce(target: string): Promise<EntryOutcome> {
    try {
      const st = await lstat(target);
      if (st.isSymbolicLink()) {
        await rm(target, { force: true });
        return { status: 'succeeded' };
      }
      await rm(target, { recursive: true, force: true });
      return { status: 'succeeded' };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { status: 'skipped', warning: 'target_not_found' };
      }
      throw e;
    }
  }

  static clampDepth(maxDepth: number | undefined): number {
    const d = maxDepth ?? 1;
    if (d < 1) {
      return 1;
    }
    if (d > 2) {
      return 2;
    }
    return d;
  }

  private static safeRel(rootDir: string, target: string): string {
    const rel = relative(rootDir, target);
    return rel.length > 0 ? rel : '.';
  }
}
