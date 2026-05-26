import { isAbsolute, normalize, resolve, sep } from 'node:path';

import { DmigError } from '../core/errors/DmigError.js';
import { ErrorCodes } from '../core/errors/codes.js';

/**
 * 相対パスに `..` やドライブレターが含まれていないか検証する。
 */
function assertSafeRelativePath(relativePath: string): void {
  const trimmed = relativePath.trim();
  if (!trimmed) {
    throw new DmigError(ErrorCodes.PATH_TRAVERSAL_DETECTED, {
      detail: 'empty relative path',
    });
  }

  const normalized = normalize(trimmed);
  if (isAbsolute(normalized)) {
    throw new DmigError(ErrorCodes.PATH_TRAVERSAL_DETECTED, {
      detail: `absolute path not allowed: ${relativePath}`,
    });
  }

  const segments = normalized.split(/[/\\]/).filter((s) => s.length > 0);
  if (segments.some((s) => s === '..')) {
    throw new DmigError(ErrorCodes.PATH_TRAVERSAL_DETECTED, {
      detail: `parent segment not allowed: ${relativePath}`,
    });
  }

  if (segments.some((s) => /^[a-zA-Z]:$/.test(s))) {
    throw new DmigError(ErrorCodes.PATH_TRAVERSAL_DETECTED, {
      detail: `drive letter segment not allowed: ${relativePath}`,
    });
  }
}

/**
 * `rootDir` 配下にのみ解決される絶対パスを返す。脱出・絶対パスは {@link ErrorCodes.PATH_TRAVERSAL_DETECTED}。
 */
export function safeJoinUnder(rootDir: string, relativePath: string): string {
  assertSafeRelativePath(relativePath);

  const root = resolve(rootDir);
  const resolved = resolve(root, normalize(relativePath.trim()));

  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new DmigError(ErrorCodes.PATH_TRAVERSAL_DETECTED, {
      detail: `path escapes root: rel=${relativePath} root=${rootDir}`,
    });
  }

  return resolved;
}

/**
 * 既に絶対化された `targetPath` が `rootDir` 配下であることを検証する（export ロールバック用）。
 */
export function assertPathUnderRoot(rootDir: string, targetPath: string): void {
  const root = resolve(rootDir);
  const target = resolve(targetPath);

  if (target !== root && !target.startsWith(root + sep)) {
    throw new DmigError(ErrorCodes.PATH_TRAVERSAL_DETECTED, {
      detail: `target outside package root: target=${targetPath} root=${rootDir}`,
    });
  }
}
