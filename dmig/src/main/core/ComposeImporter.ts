import { createReadStream, promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { EventEmitter } from 'node:events';

import type { DockerAdapter } from './DockerAdapter.js';
import { Importer } from './Importer.js';
import { VolumeExporter } from './VolumeExporter.js';
import { createZstdDecompressStream } from './compression/zstdStreams.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';
import { selectTarBackend } from './tar/selectTarBackend.js';
import type { TarBackend } from './tar/TarBackend.js';
import type {
  ComposeImportRequest,
  ProjectManifest,
  ProgressEvent,
  DmigManifest,
  ManifestComposeEntry,
} from '@shared/types.js';

/**
 * Compose プロジェクトをパッケージから復元する。
 */
export class ComposeImporter extends EventEmitter {
  private tarBackend: TarBackend | null = null;
  private signal: AbortSignal | undefined;

  constructor(
    _docker: DockerAdapter,
    private readonly imageImporter: Importer,
    private readonly volumeExporter: VolumeExporter,
  ) {
    super();
    this.imageImporter.on('progress', (ev: ProgressEvent) => this.emit('progress', ev));
    this.volumeExporter.on('progress', (ev: ProgressEvent) => this.emit('progress', ev));
  }

  /**
   * メインAPI。
   */
  async importProjects(req: ComposeImportRequest, dmigManifest: DmigManifest, signal?: AbortSignal): Promise<void> {
    this.signal = signal;
    this.tarBackend = await selectTarBackend();
    this.emitProgress({
      taskId: 'system',
      phase: 'load',
      current: 0,
      total: 0,
      percentage: 0,
      message: `tar バックエンド: ${this.tarBackend.name}`,
    });

    try {
      const targets = (dmigManifest.contents.composeProjects ?? []).filter((p) =>
        req.selectedProjects.includes(p.name),
      );

      if (targets.length === 0) {
        throw new DmigError(ErrorCodes.COMPOSE_NOT_FOUND, {
          detail: 'no matching compose project in package',
        });
      }

      const projectPayloads: { entry: ManifestComposeEntry; pm: ProjectManifest }[] = [];
      const allImages = new Set<string>();

      for (const entry of targets) {
        const projectManifestPath = join(req.packageDir, entry.manifestFile);
        let pm: ProjectManifest;
        try {
          const txt = await fsp.readFile(projectManifestPath, 'utf-8');
          pm = JSON.parse(txt) as ProjectManifest;
        } catch (e) {
          throw wrapError(e, ErrorCodes.COMPOSE_IMPORT_FAILED, `readProjectManifest(${entry.name})`);
        }
        projectPayloads.push({ entry, pm });
        for (const s of pm.services) {
          if (s.imagePackaged && s.image) {
            allImages.add(s.image);
          }
        }
      }

      if (allImages.size > 0) {
        await this.imageImporter.importImages(
          {
            packageDir: req.packageDir,
            selectedImages: [...allImages],
          },
          signal,
        );
      }

      const total = projectPayloads.length;
      for (let i = 0; i < total; i++) {
        if (signal?.aborted) {
          throw new DmigError(ErrorCodes.JOB_CANCELLED, {
            detail: `before compose project ${i + 1}/${total}`,
          });
        }
        const { entry, pm } = projectPayloads[i];
        this.emitProgress({
          taskId: entry.name,
          phase: 'load',
          current: i,
          total,
          percentage: Math.floor((i / total) * 100),
          message: `(${i + 1}/${total}) プロジェクト ${entry.name} をインポート中...`,
        });

        await this.importSingleProject(pm, req);
      }
    } finally {
      this.signal = undefined;
      this.tarBackend = null;
    }
  }

  private async importSingleProject(pm: ProjectManifest, req: ComposeImportRequest): Promise<void> {
    const destDir = req.destinationDirs[pm.projectName];
    if (!destDir) {
      throw new DmigError(ErrorCodes.DESTINATION_DIR_INVALID, {
        detail: `project=${pm.projectName}: no destinationDir specified`,
      });
    }

    try {
      await fsp.mkdir(destDir, { recursive: true });
    } catch (e) {
      throw wrapError(e, ErrorCodes.DESTINATION_DIR_INVALID, `mkdir(${destDir})`);
    }

    const packageProjectDir = join(req.packageDir, 'compose', this.safeName(pm.projectName));

    for (const cfgRel of pm.configFiles) {
      try {
        await fsp.copyFile(join(packageProjectDir, cfgRel), join(destDir, cfgRel));
      } catch (e) {
        throw wrapError(e, ErrorCodes.COMPOSE_IMPORT_FAILED, `copyConfig(${cfgRel})`);
      }
    }

    for (const env of pm.envFiles) {
      if (!env.path) continue;
      try {
        await fsp.copyFile(join(packageProjectDir, env.path), join(destDir, env.path));
      } catch (e) {
        throw wrapError(e, ErrorCodes.COMPOSE_IMPORT_FAILED, `copyEnv(${env.path})`);
      }
    }

    for (const svc of pm.services) {
      if (!svc.buildContext) continue;
      const tarPath = join(packageProjectDir, svc.buildContext.tarFile);
      const lastSeg =
        svc.buildContext.originalPath
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() ?? svc.name;
      const expandTo = join(destDir, lastSeg);
      await this.untarZstd(tarPath, expandTo, `${pm.projectName}/${svc.name} ビルドコンテキスト`);
    }

    for (const vol of pm.volumes) {
      if (!vol.packaged || !vol.tarFile) continue;
      await this.volumeExporter.importOne(vol.name, req.packageDir, vol.tarFile, { overwrite: false });
    }

    for (const bm of pm.bindMounts) {
      if (!bm.packaged || !bm.tarFile) continue;
      const tarPath = join(packageProjectDir, bm.tarFile);
      const remappedHost = req.bindMountRemap?.[bm.hostPath] ?? bm.hostPath;
      await this.untarZstd(tarPath, remappedHost, `${pm.projectName} bind mount`);
    }
  }

  /**
   * tar.zst を指定ディレクトリに展開する。
   * Phase 5.1 第2回: TarBackend 経由。
   */
  private async untarZstd(tarPath: string, destDir: string, label: string): Promise<void> {
    try {
      await fsp.mkdir(destDir, { recursive: true });
    } catch (e) {
      throw wrapError(e, ErrorCodes.COMPOSE_IMPORT_FAILED, `mkdir(${destDir})`);
    }

    if (!this.tarBackend) {
      this.tarBackend = await selectTarBackend();
    }

    this.emitProgress({
      taskId: label,
      phase: 'decompress',
      current: 0,
      total: 0,
      percentage: 0,
      message: `${label} を展開中... (${this.tarBackend.name})`,
    });

    try {
      const fileStream = createReadStream(tarPath);
      const decompressor = await createZstdDecompressStream();
      const tarPass = new PassThrough();
      const feedCompressed = pipeline(fileStream, decompressor, tarPass, {
        signal: this.signal,
      });

      await Promise.all([
        this.tarBackend.extract(tarPass, destDir, {
          signal: this.signal,
          onBytes: (b) => {
            this.emitProgress({
              taskId: label,
              phase: 'decompress',
              current: b,
              total: 0,
              percentage: 0,
              message: `${label} を展開中... (${(b / 1024 / 1024).toFixed(1)}MB)`,
            });
          },
        }),
        feedCompressed,
      ]);
    } catch (e) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.COMPOSE_IMPORT_FAILED, `untarZstd(${tarPath})`);
    }
  }

  private safeName(name: string): string {
    return name.replace(/[/\\:<>|?*"]+/g, '_').replace(/^_+|_+$/g, '');
  }

  private emitProgress(ev: ProgressEvent) {
    this.emit('progress', ev);
  }
}
