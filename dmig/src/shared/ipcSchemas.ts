import { z } from 'zod';

/** 任意の jobToken（Renderer は crypto.randomUUID） */
export const jobTokenSchema = z.string().uuid().optional();

const cancellableFields = {
  jobToken: jobTokenSchema,
};

export const exportRequestSchema = z.object({
  ...cancellableFields,
  imageNames: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  packName: z.string().min(1).optional(),
  compressionLevel: z.number().int().min(1).max(22).optional(),
  diffMode: z.enum(['full', 'delta']).optional(),
  baseSnapshotId: z.string().min(1).optional(),
  volumeDiffStrategy: z.enum(['fast', 'strict']).optional(),
  autoSaveSnapshot: z.boolean().optional(),
});

export const importRequestSchema = z.object({
  ...cancellableFields,
  packageDir: z.string().min(1),
  selectedImages: z.array(z.string().min(1)),
});

export const resumeExportRequestSchema = z.object({
  ...cancellableFields,
  packageDir: z.string().min(1),
  compressionLevel: z.number().int().min(1).max(22).optional(),
});

const secretActionSchema = z.enum(['exclude', 'mask', 'include']);
const bindMountActionSchema = z.enum(['packageContent', 'recordPathOnly']);

const bindMountChoiceSchema = z.object({
  hostPath: z.string().min(1),
  action: bindMountActionSchema,
});

export const composeExportRequestSchema = z.object({
  ...cancellableFields,
  projectNames: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  packName: z.string().min(1).optional(),
  compressionLevel: z.number().int().min(1).max(22).optional(),
  secretActions: z.record(z.string(), secretActionSchema),
  bindMountChoices: z.record(z.string(), z.array(bindMountChoiceSchema)),
  diffMode: z.enum(['full', 'delta']).optional(),
  baseSnapshotId: z.string().min(1).optional(),
  volumeDiffStrategy: z.enum(['fast', 'strict']).optional(),
  autoSaveSnapshot: z.boolean().optional(),
});

export const composeImportRequestSchema = z.object({
  ...cancellableFields,
  packageDir: z.string().min(1),
  selectedProjects: z.array(z.string().min(1)).min(1),
  destinationDirs: z.record(z.string(), z.string().min(1)),
  bindMountRemap: z.record(z.string(), z.string().min(1)).optional(),
});

export const composeLifecycleRequestSchema = z.object({
  projectName: z.string().min(1),
  action: z.enum(['stop', 'pull']),
});

export const listResumablePackagesRequestSchema = z.object({
  rootDir: z.string().min(1),
  maxDepth: z.number().int().min(1).max(2).optional(),
});

export const listRollbacksRequestSchema = z.object({
  rootDir: z.string().min(1),
  maxDepth: z.number().int().min(1).max(2).optional(),
});

export const dryRunRequestSchema = z.object({
  mode: z.enum(['compose-project', 'export-pack']),
  outputDir: z.string().min(1).optional(),
  projectNames: z.array(z.string().min(1)).optional(),
  imageNames: z.array(z.string().min(1)).optional(),
  packageDir: z.string().min(1).optional(),
});

export const diffPreviewRequestSchema = z.object({
  baseSnapshotId: z.string().min(1).optional(),
  volumeDiffStrategy: z.enum(['fast', 'strict']).optional(),
  jobToken: jobTokenSchema,
});

export const runRollbackRequestSchema = z.object({
  packageDir: z.string().min(1),
  entryIds: z.array(z.string().min(1)).optional(),
  jobToken: jobTokenSchema,
});

export const preflightRequestSchema = z.object({
  outputDir: z.string().min(1),
  estimatedBytes: z.number().nonnegative(),
});

export const packageDirSchema = z.string().min(1);

export const jobTokenRequiredSchema = z.string().uuid();

export const snapshotIdSchema = z.string().min(1);

export const settingsPatchSchema = z
  .object({
    defaultExportDir: z.string().optional(),
    restoreLastPage: z.boolean().optional(),
    lastPage: z.string().optional(),
  })
  .strict();

/** Zod エラーを IPC detail 用に短くまとめる */
export function formatIpcSchemaError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
}
