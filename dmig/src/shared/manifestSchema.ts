import { z } from 'zod';

import { DMIG_MANIFEST_VERSION } from './manifestVersion.js';
import type { DmigManifest } from './types.js';

const schemaVersionSchema = z.enum(['1.0', '1.1']);
const contentKindSchema = z.enum(['image', 'volume', 'composeProject']);
const checksumPolicySchema = z.enum(['verify-all', 'verify-resumed', 'trust-completed']);
const interruptionReasonSchema = z.enum(['user-cancel', 'error', 'crash']);
const contentKindDeltaSchema = z.enum(['full', 'delta']);

/** 境界・SHA 形式の意味検証は Importer.validatePartialState（E2075）に委譲 */
const chunkRefSchema = z.object({
  contentKind: contentKindSchema,
  contentId: z.string().min(1),
  chunkIndex: z.number(),
  byteOffset: z.number(),
  byteLength: z.number(),
  expectedSha256: z.string().min(1),
});

/** 空 pending は Zod では許容し、Importer.validatePartialState で E2075 にする */
const partialStateSchema = z.object({
  pendingChunks: z.array(chunkRefSchema),
  lastUpdatedAt: z.string().min(1),
  checksumPolicy: checksumPolicySchema,
  resumeToken: z.string().optional(),
  interruptionReason: interruptionReasonSchema.optional(),
});

const manifestImageEntrySchema = z.object({
  name: z.string().min(1),
  filename: z.string().min(1),
  originalSize: z.number().nonnegative(),
  compressedSize: z.number().nonnegative(),
  sha256: z.string().min(1),
  kind: contentKindDeltaSchema.optional(),
  baseRef: z.string().optional(),
});

const manifestVolumeEntrySchema = z.object({
  name: z.string().min(1),
  filename: z.string().min(1),
  compressedSize: z.number().nonnegative(),
  sha256: z.string().min(1),
  driver: z.string().min(1),
  kind: contentKindDeltaSchema.optional(),
  baseRef: z.string().optional(),
});

const manifestComposeEntrySchema = z.object({
  name: z.string().min(1),
  manifestFile: z.string().min(1),
  serviceCount: z.number().int().nonnegative(),
  volumeCount: z.number().int().nonnegative(),
  hasEnvFile: z.boolean(),
  envFileMasked: z.boolean(),
  kind: contentKindDeltaSchema.optional(),
  baseRef: z.string().optional(),
});

const dmigManifestSchema = z.object({
  dmigVersion: z.string().min(1),
  createdAt: z.string().min(1),
  source: z.object({
    os: z.string().min(1),
    arch: z.string().min(1),
    dockerVersion: z.string().optional(),
    appVersion: z.string().min(1),
  }),
  contents: z.object({
    images: z.array(manifestImageEntrySchema),
    volumes: z.array(manifestVolumeEntrySchema).optional(),
    composeProjects: z.array(manifestComposeEntrySchema).optional(),
  }),
  totalSize: z.number().nonnegative(),
  schemaVersion: schemaVersionSchema.optional(),
  previousPackage: z
    .object({
      id: z.string().min(1),
      createdAt: z.string().min(1),
    })
    .optional(),
  baseRef: z.string().optional(),
  partialState: partialStateSchema.optional(),
});

/** Zod 検証エラーを readManifest / probe 用の detail 文字列にする */
export function formatManifestSchemaError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
}

/**
 * ディスク上の manifest JSON（既に parse 済み）を検証し {@link DmigManifest} を返す。
 * major バージョン不一致は呼び出し側で {@link ErrorCodes.PACK_VERSION_INCOMPATIBLE} に変換する。
 */
export function parseDmigManifestPayload(raw: unknown): DmigManifest {
  return dmigManifestSchema.parse(raw) as DmigManifest;
}

/** 現行アプリが書き出す manifest の最小サンプル（テスト用） */
export function buildMinimalValidManifest(overrides?: Partial<DmigManifest>): DmigManifest {
  const base: DmigManifest = {
    dmigVersion: DMIG_MANIFEST_VERSION,
    schemaVersion: '1.1',
    createdAt: new Date().toISOString(),
    source: {
      os: 'win32',
      arch: 'x64',
      appVersion: '0.7.0-poc',
    },
    contents: {
      images: [
        {
          name: 'img:test',
          filename: 'img-test.tar.zst',
          originalSize: 1,
          compressedSize: 1,
          sha256: 'a'.repeat(64),
        },
      ],
    },
    totalSize: 1,
  };
  return { ...base, ...overrides };
}
