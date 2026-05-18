import type {
  ChecksumPolicy,
  ChunkRef,
  ContentKind,
  DmigManifest,
  InterruptionReason,
} from '@shared/types.js';

/** 段階 A: `ChunkRef.expectedSha256` 用プレースホルダ（実ハッシュではない）。 */
export const STAGE_A_PLACEHOLDER_SHA256 = '0'.repeat(64);

/**
 * 段階 A 用の ChunkRef を生成する。
 *
 * Args:
 *   contentKind: manifest.contents の系統。
 *   contentId: 当該系統内の `name`。
 *   estimatedSize: `byteLength` に使う推定バイト数（最低 1）。
 */
export function createStageAChunkRef(
  contentKind: ContentKind,
  contentId: string,
  estimatedSize: number,
): ChunkRef {
  return {
    contentKind,
    contentId,
    chunkIndex: 0,
    byteOffset: 0,
    byteLength: Math.max(1, Math.floor(estimatedSize)),
    expectedSha256: STAGE_A_PLACEHOLDER_SHA256,
  };
}

/**
 * pendingChunks から (contentKind, contentId, chunkIndex:0) に一致する要素を除いた新配列を返す。
 */
export function removePendingChunk(
  pendingChunks: ChunkRef[],
  contentKind: ContentKind,
  contentId: string,
): ChunkRef[] {
  return pendingChunks.filter(
    (c) => !(c.contentKind === contentKind && c.contentId === contentId && c.chunkIndex === 0),
  );
}

export interface UpdatePartialStateOptions {
  checksumPolicy?: ChecksumPolicy;
  interruptionReason?: InterruptionReason;
}

/**
 * manifest に partialState を反映したコピーを返す。pending が空なら partialState を削除する。
 */
export function updatePartialState(
  manifest: DmigManifest,
  pendingChunks: ChunkRef[],
  options: UpdatePartialStateOptions = {},
): DmigManifest {
  if (pendingChunks.length === 0) {
    const { partialState: _removed, ...rest } = manifest;
    return rest as DmigManifest;
  }

  const next: DmigManifest = { ...manifest };
  next.partialState = {
    pendingChunks,
    lastUpdatedAt: new Date().toISOString(),
    checksumPolicy:
      options.checksumPolicy ?? manifest.partialState?.checksumPolicy ?? 'verify-resumed',
    ...(manifest.partialState?.resumeToken !== undefined && {
      resumeToken: manifest.partialState.resumeToken,
    }),
    ...(options.interruptionReason !== undefined && {
      interruptionReason: options.interruptionReason,
    }),
  };
  return next;
}
