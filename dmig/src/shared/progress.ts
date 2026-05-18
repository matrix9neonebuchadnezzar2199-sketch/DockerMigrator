import type { ProgressEvent, ProgressScope } from './types.js';

export type { ProgressScope };

/** 固定 taskId（UI フィルタ・Main 進捗送出用）。 */
export const ProgressTaskIds = {
  COMPOSE_DISCOVER: 'compose-discover',
  RESUMABLE_SCAN: 'resumable-scan',
  SECRET_SCAN: 'secret-scan',
  COMPOSE_LIFECYCLE: 'compose-lifecycle',
  PRUNE_DANGLING: 'prune-dangling',
  IMAGE_LIST: 'image-list',
  PROBE_PACKAGE: 'probe-package',
} as const;

/** ProgressEvent に scope を付与（未設定時は taskId / phase から推定）。 */
export function inferProgressScope(ev: ProgressEvent): ProgressScope {
  if (ev.scope) {
    return ev.scope;
  }
  if (ev.taskId === ProgressTaskIds.COMPOSE_DISCOVER) {
    return 'discover';
  }
  if (
    ev.taskId === ProgressTaskIds.RESUMABLE_SCAN ||
    ev.taskId === ProgressTaskIds.PROBE_PACKAGE ||
    ev.taskId === ProgressTaskIds.SECRET_SCAN
  ) {
    return 'scan';
  }
  if (ev.taskId === ProgressTaskIds.IMAGE_LIST || ev.phase === 'discover') {
    return 'discover';
  }
  if (ev.phase === 'snapshot') {
    return 'snapshot';
  }
  if (ev.taskId === ProgressTaskIds.COMPOSE_LIFECYCLE || ev.taskId === ProgressTaskIds.PRUNE_DANGLING) {
    return 'system';
  }
  return 'transfer';
}

export function applyProgressScope(ev: ProgressEvent): ProgressEvent {
  return { ...ev, scope: inferProgressScope(ev) };
}

export function matchesProgressScope(
  ev: ProgressEvent,
  scope: ProgressScope | ProgressScope[],
): boolean {
  const scopes = Array.isArray(scope) ? scope : [scope];
  return scopes.includes(inferProgressScope(ev));
}

/** Main / Renderer 共通の ProgressEvent 組み立て。 */
export function buildProgressEvent(input: {
  taskId: string;
  phase: ProgressEvent['phase'];
  current: number;
  total: number;
  message: string;
  scope?: ProgressScope;
}): ProgressEvent {
  const percentage =
    input.total > 0 ? Math.min(100, Math.floor((input.current / input.total) * 100)) : 0;
  return applyProgressScope({
    ...input,
    percentage,
  });
}
