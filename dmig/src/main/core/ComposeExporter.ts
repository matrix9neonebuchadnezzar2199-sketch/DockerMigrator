import { createWriteStream, promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { basename, isAbsolute, join, resolve as pathResolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

import { DockerAdapter } from './DockerAdapter.js';
import { Exporter } from './Exporter.js';
import { VolumeExporter } from './VolumeExporter.js';
import { SecretScanner } from './SecretScanner.js';
import { createZstdCompressStream } from './compression/zstdStreams.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';
import { selectTarBackend } from './tar/selectTarBackend.js';
import type { TarBackend } from './tar/TarBackend.js';
import type {
  ComposeProjectInfo,
  ComposeExportRequest,
  JobToken,
  ManifestComposeEntry,
  ManifestImageEntry,
  ManifestVolumeEntry,
  ProgressEvent,
  ProjectManifest,
  ProjectManifestService,
  ProjectManifestVolume,
  ProjectManifestBindMount,
  ProjectManifestEnvFile,
} from '@shared/types.js';
import { buildProgressEvent } from '@shared/progress.js';
import { SizeEstimator } from './SizeEstimator.js';
import { ComposeExportManifestSession } from './manifest/composeExportManifestSession.js';
import type { OpenedPackageResume } from './importer/OpenedPackage.js';
import { RollbackManager } from './RollbackManager.js';
import { buildExportPackDirectoryEntry, createRollbackRecord } from './rollbackRecordBuilder.js';

/**
 * Compose プロジェクトをまるごとパッケージ化する（Phase 5）。
 */
export class ComposeExporter extends EventEmitter {
  private readonly secretScanner = new SecretScanner();
  private signal: AbortSignal | undefined;
  private tarBackend: TarBackend | null = null;

  constructor(
    private readonly docker: DockerAdapter,
    private readonly imageExporter: Exporter,
    private readonly volumeExporter: VolumeExporter,
  ) {
    super();
    this.imageExporter.on('progress', (ev: ProgressEvent) => this.emit('progress', ev));
    this.volumeExporter.on('progress', (ev: ProgressEvent) => this.emit('progress', ev));
  }

  /**
   * 選択された Compose プロジェクト群をパッケージに書き出す。
   */
  async exportProjects(
    req: ComposeExportRequest,
    packDir: string,
    projectInfos: ComposeProjectInfo[],
    signal: AbortSignal | undefined,
    session: ComposeExportManifestSession,
  ): Promise<{
    imageEntries: ManifestImageEntry[];
    volumeEntries: ManifestVolumeEntry[];
    composeEntries: ManifestComposeEntry[];
  }> {
    this.signal = signal;
    try {
      this.tarBackend = await selectTarBackend();
      this.emitProgress({
        taskId: 'system',
        phase: 'save',
        current: 0,
        total: 0,
        percentage: 0,
        message: `tar バックエンド: ${this.tarBackend.name}`,
      });

      const composeRoot = join(packDir, 'compose');
      const imagesDir = join(packDir, 'images');
      const volumesDir = join(packDir, 'volumes');
      await fsp.mkdir(composeRoot, { recursive: true });
      await fsp.mkdir(imagesDir, { recursive: true });
      await fsp.mkdir(volumesDir, { recursive: true });

      const allImageEntries: ManifestImageEntry[] = [];
      const allVolumeEntries: ManifestVolumeEntry[] = [];
      const composeEntries: ManifestComposeEntry[] = [];

      const exportedImages = new Set<string>();
      const exportedVolumes = new Set<string>();

      const total = req.projectNames.length;
      for (let idx = 0; idx < total; idx++) {
        if (this.signal?.aborted) {
          throw new DmigError(ErrorCodes.JOB_CANCELLED, {
            detail: `before project ${idx + 1}/${total}`,
          });
        }

        const projectName = req.projectNames[idx];
        const info = projectInfos.find((p) => p.name === projectName);
        if (!info) {
          throw new DmigError(ErrorCodes.COMPOSE_NOT_FOUND, {
            detail: `project=${projectName}`,
          });
        }

        this.emitProgress({
          taskId: projectName,
          phase: 'save',
          current: idx,
          total,
          percentage: Math.floor((idx / total) * 100),
          message: `(${idx + 1}/${total}) プロジェクト ${projectName} をエクスポート中...`,
        });

        const result = await this.exportSingleProject(
          info,
          req,
          packDir,
          exportedImages,
          exportedVolumes,
          req.compressionLevel ?? 3,
          session,
        );

        allImageEntries.push(...result.imageEntries);
        allVolumeEntries.push(...result.volumeEntries);
        composeEntries.push(result.composeEntry);
      }

      return {
        imageEntries: allImageEntries,
        volumeEntries: allVolumeEntries,
        composeEntries,
      };
    } catch (e) {
      const isAbort =
        this.signal?.aborted ||
        (e instanceof DmigError && e.code === ErrorCodes.JOB_CANCELLED) ||
        (e instanceof Error && e.name === 'AbortError');
      try {
        await session.finalizeInterrupted(isAbort ? 'user-cancel' : 'error');
      } catch {
        /* 最終 manifest 書き込み失敗は無視し、元例外を優先 */
      }
      throw e;
    } finally {
      this.signal = undefined;
      this.tarBackend = null;
    }
  }

  /**
   * 中断済み Compose パッケージのエクスポートを再開する。
   * secretActions / bindMountChoices は空として扱う（初回選択と異なる可能性あり）。
   */
  async resumeComposePack(
    opened: OpenedPackageResume,
    compressionLevel: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const session = ComposeExportManifestSession.fromResumeState(
      opened.packageDir,
      opened.manifest,
      opened.partialState.pendingChunks,
    );
    this.signal = signal;

    const resumeReq: ComposeExportRequest = {
      projectNames: opened.manifest.contents.composeProjects?.map((c) => c.name) ?? [],
      outputDir: opened.packageDir,
      jobToken: randomUUID() as JobToken,
      secretActions: {},
      bindMountChoices: {},
    };

    const allProjects = await this.docker.listComposeProjects();

    try {
      const queue = [...session.pending];
      for (const chunk of queue) {
        if (this.signal?.aborted) {
          throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: 'resumeComposePack aborted' });
        }
        const stillThere = session.pending.some(
          (p) =>
            p.contentKind === chunk.contentKind &&
            p.contentId === chunk.contentId &&
            p.chunkIndex === chunk.chunkIndex,
        );
        if (!stillThere) {
          continue;
        }

        if (chunk.contentKind === 'image') {
          const entry = await this.imageExporter.exportSingleImagePublic(
            chunk.contentId,
            join(opened.packageDir, 'images'),
            compressionLevel,
            this.signal,
          );
          await session.onImageExported({
            name: entry.name,
            filename: `images/${entry.filename}`,
            originalSize: entry.originalSize,
            compressedSize: entry.compressedSize,
            sha256: entry.sha256,
          });
        } else if (chunk.contentKind === 'volume') {
          const entry = await this.volumeExporter.exportOne(
            chunk.contentId,
            join(opened.packageDir, 'volumes'),
            compressionLevel,
            this.signal,
          );
          await session.onVolumeExported(entry);
        } else {
          const info = allProjects.find((p) => p.name === chunk.contentId);
          if (!info) {
            throw new DmigError(ErrorCodes.COMPOSE_NOT_FOUND, {
              detail: `project=${chunk.contentId}`,
            });
          }
          const { exportedImages, exportedVolumes } = ComposeExporter.buildResumeDeduplicationSets(session);
          await this.exportSingleProject(
            info,
            resumeReq,
            opened.packageDir,
            exportedImages,
            exportedVolumes,
            compressionLevel,
            session,
          );
        }
      }

      await session.finalizeSuccess();

      const checksumLines: string[] = [];
      for (const img of session.manifest.contents.images) {
        const rel = img.filename.startsWith('images/') ? img.filename : `images/${img.filename}`;
        checksumLines.push(`${img.sha256}  ${rel}`);
      }
      for (const vol of session.manifest.contents.volumes ?? []) {
        checksumLines.push(`${vol.sha256}  ${vol.filename}`);
      }
      await fsp.writeFile(join(opened.packageDir, 'checksums.sha256'), `${checksumLines.join('\n')}\n`, 'utf-8');

      this.emitProgress({
        taskId: 'done',
        phase: 'write',
        current: 1,
        total: 1,
        percentage: 100,
        message: 'Compose 再エクスポートが完了しました。',
      });

      const rollbackManager = new RollbackManager(this.docker);
      await rollbackManager.saveRecord(
        opened.packageDir,
        createRollbackRecord(opened.packageDir, 'export', [
          buildExportPackDirectoryEntry(opened.packageDir),
        ]),
      );
    } catch (e) {
      const isAbort =
        this.signal?.aborted ||
        (e instanceof DmigError && e.code === ErrorCodes.JOB_CANCELLED) ||
        (e instanceof Error && e.name === 'AbortError');
      try {
        await session.finalizeInterrupted(isAbort ? 'user-cancel' : 'error');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      this.signal = undefined;
    }
  }

  private static buildResumeDeduplicationSets(session: ComposeExportManifestSession): {
    exportedImages: Set<string>;
    exportedVolumes: Set<string>;
  } {
    const pendingImg = new Set(
      session.pending.filter((c) => c.contentKind === 'image').map((c) => c.contentId),
    );
    const pendingVol = new Set(
      session.pending.filter((c) => c.contentKind === 'volume').map((c) => c.contentId),
    );
    const exportedImages = new Set(
      session.manifest.contents.images.map((i) => i.name).filter((n) => !pendingImg.has(n)),
    );
    const exportedVolumes = new Set(
      (session.manifest.contents.volumes ?? []).map((v) => v.name).filter((n) => !pendingVol.has(n)),
    );
    return { exportedImages, exportedVolumes };
  }

  private async exportSingleProject(
    info: ComposeProjectInfo,
    req: ComposeExportRequest,
    packDir: string,
    exportedImages: Set<string>,
    exportedVolumes: Set<string>,
    compressionLevel: number,
    session: ComposeExportManifestSession,
  ): Promise<{
    imageEntries: ManifestImageEntry[];
    volumeEntries: ManifestVolumeEntry[];
    composeEntry: ManifestComposeEntry;
  }> {
    const projectDir = join(packDir, 'compose', this.safeName(info.name));
    const buildCtxDir = join(projectDir, 'build-contexts');
    const bindDir = join(projectDir, 'bind-mounts');
    await fsp.mkdir(projectDir, { recursive: true });
    await fsp.mkdir(buildCtxDir, { recursive: true });
    await fsp.mkdir(bindDir, { recursive: true });

    if (this.signal?.aborted) {
      throw new DmigError(ErrorCodes.JOB_CANCELLED, { detail: `project ${info.name}` });
    }

    const configFilesPacked: string[] = [];
    for (const cfgPath of info.configFiles) {
      try {
        const fileName = basename(cfgPath);
        const destPath = join(projectDir, fileName);
        await fsp.copyFile(cfgPath, destPath);
        configFilesPacked.push(fileName);
      } catch (e) {
        throw wrapError(e, ErrorCodes.COMPOSE_CONFIG_READ_FAILED, `copyConfig(${cfgPath})`);
      }
    }

    const composeConfig = (await this.runComposeConfig(info)) as Record<string, unknown> | null;

    const serviceEntries: ProjectManifestService[] = [];
    const imageEntries: ManifestImageEntry[] = [];

    const servicesMap = (composeConfig?.services ?? {}) as Record<string, Record<string, unknown>>;

    for (const svc of info.services) {
      const composeService = servicesMap[svc.name] ?? {};
      const buildSpec = composeService.build as string | { context?: string } | undefined;
      let buildContextPath: string | null = null;
      if (buildSpec) {
        if (typeof buildSpec === 'string') {
          buildContextPath = this.resolvePath(info.workingDir, buildSpec);
        } else if (typeof buildSpec === 'object' && buildSpec.context) {
          buildContextPath = this.resolvePath(info.workingDir, buildSpec.context);
        }
      }

      let buildContextManifest: ProjectManifestService['buildContext'] = null;
      if (buildContextPath) {
        const tarFile = `build-contexts/${this.safeName(svc.name)}.tar.zst`;
        await this.tarDirectoryZstd(
          buildContextPath,
          join(projectDir, tarFile),
          compressionLevel,
          `${info.name}/${svc.name} ビルドコンテキスト`,
        );
        buildContextManifest = {
          tarFile,
          originalPath: buildContextPath,
        };
      }

      let imagePackaged = false;
      if (svc.image && !exportedImages.has(svc.image)) {
        const entry = await this.imageExporter.exportSingleImagePublic(
          svc.image,
          join(packDir, 'images'),
          compressionLevel,
          this.signal,
        );
        const imgManifest: ManifestImageEntry = {
          name: entry.name,
          filename: `images/${entry.filename}`,
          originalSize: entry.originalSize,
          compressedSize: entry.compressedSize,
          sha256: entry.sha256,
        };
        imageEntries.push(imgManifest);
        exportedImages.add(svc.image);
        await session.onImageExported(imgManifest);
        imagePackaged = true;
      } else if (svc.image && exportedImages.has(svc.image)) {
        imagePackaged = true;
      }

      serviceEntries.push({
        name: svc.name,
        image: svc.image,
        imagePackaged,
        buildContext: buildContextManifest,
      });
    }

    const volumeEntries: ManifestVolumeEntry[] = [];
    const volumeManifestEntries: ProjectManifestVolume[] = [];

    for (const volName of info.volumeNames) {
      if (exportedVolumes.has(volName)) {
        volumeManifestEntries.push({
          name: volName,
          packaged: true,
          tarFile: `volumes/${this.safeName(volName)}.tar.zst`,
          driver: 'local',
        });
        continue;
      }
      const entry = await this.volumeExporter.exportOne(
        volName,
        join(packDir, 'volumes'),
        compressionLevel,
        this.signal,
      );
      volumeEntries.push(entry);
      exportedVolumes.add(volName);
      await session.onVolumeExported(entry);
      volumeManifestEntries.push({
        name: volName,
        packaged: true,
        tarFile: entry.filename,
        driver: entry.driver,
      });
    }

    const bindChoices = req.bindMountChoices[info.name] ?? [];
    const bindManifestEntries: ProjectManifestBindMount[] = [];

    for (const bm of info.bindMounts) {
      const choice = bindChoices.find((c) => c.hostPath === bm.hostPath);
      const action = choice?.action ?? 'recordPathOnly';

      if (action === 'packageContent') {
        const tarFile = `bind-mounts/${this.safeName(bm.hostPath)}.tar.zst`;
        try {
          await this.tarDirectoryZstd(
            bm.hostPath,
            join(projectDir, tarFile),
            compressionLevel,
            `${info.name} bind mount`,
          );
          bindManifestEntries.push({
            serviceName: bm.serviceName,
            hostPath: bm.hostPath,
            containerPath: bm.containerPath,
            packaged: true,
            tarFile,
            readOnly: bm.readOnly,
          });
        } catch (e) {
          if (e instanceof DmigError) throw e;
          throw wrapError(e, ErrorCodes.BIND_MOUNT_TAR_FAILED, `bindMount(${bm.hostPath})`);
        }
      } else {
        bindManifestEntries.push({
          serviceName: bm.serviceName,
          hostPath: bm.hostPath,
          containerPath: bm.containerPath,
          packaged: false,
          tarFile: null,
          readOnly: bm.readOnly,
        });
      }
    }

    const envManifest: ProjectManifestEnvFile[] = [];
    const secretAction = req.secretActions[info.name] ?? 'exclude';

    for (const envInfo of info.envFiles) {
      const realPath = envInfo.path;
      let exists = false;
      try {
        await fsp.access(realPath);
        exists = true;
      } catch {
        exists = false;
      }
      if (!exists) continue;

      const scan = await this.secretScanner.scanFile(realPath);
      const detected = scan.findings.map((f) => f.key);

      if (secretAction === 'exclude') {
        envManifest.push({
          path: null,
          masked: false,
          secretsDetected: detected,
        });
      } else if (secretAction === 'mask') {
        const destRel = '.env.masked';
        await this.secretScanner.writeMaskedEnv(realPath, join(projectDir, destRel), scan.findings);
        envManifest.push({
          path: destRel,
          masked: true,
          secretsDetected: detected,
        });
      } else {
        const destRel = '.env';
        await fsp.copyFile(realPath, join(projectDir, destRel));
        envManifest.push({
          path: destRel,
          masked: false,
          secretsDetected: detected,
        });
      }
    }

    const projectManifest: ProjectManifest = {
      projectName: info.name,
      configFiles: configFilesPacked,
      workingDir: info.workingDir,
      services: serviceEntries,
      volumes: volumeManifestEntries,
      bindMounts: bindManifestEntries,
      envFiles: envManifest,
    };

    try {
      await fsp.writeFile(
        join(projectDir, 'project-manifest.json'),
        JSON.stringify(projectManifest, null, 2),
        'utf-8',
      );
    } catch (e) {
      throw wrapError(e, ErrorCodes.MANIFEST_WRITE_FAILED, 'projectManifest');
    }

    const composeEntry: ManifestComposeEntry = {
      name: info.name,
      manifestFile: `compose/${this.safeName(info.name)}/project-manifest.json`,
      serviceCount: serviceEntries.length,
      volumeCount: volumeManifestEntries.length,
      hasEnvFile: envManifest.some((e) => e.path !== null),
      envFileMasked: envManifest.some((e) => e.masked),
    };

    await session.onComposeProjectExported(composeEntry);

    return { imageEntries, volumeEntries, composeEntry };
  }

  private async runComposeConfig(info: ComposeProjectInfo): Promise<Record<string, unknown> | null> {
    if (!info.workingDir || info.configFiles.length === 0) return null;

    return new Promise((resolve) => {
      const args = ['compose'];
      for (const cfg of info.configFiles) {
        args.push('-f', cfg);
      }
      args.push('--project-name', info.name);
      args.push('config', '--format', 'json');

      const proc = spawn('docker', args, {
        cwd: info.workingDir,
        shell: false,
      });
      let stdout = '';
      proc.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr.resume();
      proc.on('error', () => resolve(null));
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout) as Record<string, unknown>);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  }

  private async tarDirectoryZstd(
    srcDir: string,
    destFile: string,
    compressionLevel: number,
    labelForProgress: string,
  ): Promise<void> {
    try {
      await fsp.access(srcDir);
    } catch (e) {
      throw new DmigError(ErrorCodes.BUILD_CONTEXT_NOT_FOUND, {
        detail: `dir=${srcDir}`,
        cause: e instanceof Error ? e : undefined,
      });
    }

    if (!this.tarBackend) {
      this.tarBackend = await selectTarBackend();
    }

    let written = 0;
    const estimator = new SizeEstimator(this.docker);
    const srcBytes = await estimator.measureDirectoryBytes(srcDir);
    const estimatedOut = Math.max(1, SizeEstimator.estimateCompressedBytes(srcBytes, 'volume'));

    const timer = setInterval(() => {
      const totalBytes = Math.max(estimatedOut, written, 1);
      this.emit(
        'progress',
        buildProgressEvent({
          taskId: labelForProgress,
          phase: 'compress',
          current: written,
          total: totalBytes,
          message: `${labelForProgress}: 圧縮中 (${(written / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`,
        }),
      );
    }, 500);

    try {
      const compressor = await createZstdCompressStream(compressionLevel);
      const ws = createWriteStream(destFile);
      const pipeOpts = this.signal ? { signal: this.signal } : {};
      const downstreamDone = pipeline(compressor, ws, pipeOpts);

      await this.tarBackend.pack(srcDir, compressor, {
        signal: this.signal,
        onBytes: (b) => {
          written = b;
        },
      });

      compressor.end();
      await downstreamDone;
    } catch (e) {
      await fsp.unlink(destFile).catch(() => {});
      if (this.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) {
        throw new DmigError(ErrorCodes.JOB_CANCELLED, {
          detail: `tarDirectoryZstd aborted: ${srcDir}`,
        });
      }
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.BUILD_CONTEXT_TAR_FAILED, `tarDirectoryZstd(${srcDir})`);
    } finally {
      clearInterval(timer);
    }
  }

  private resolvePath(workingDir: string, relativeOrAbs: string): string {
    if (isAbsolute(relativeOrAbs)) return relativeOrAbs;
    return pathResolve(workingDir, relativeOrAbs);
  }

  private safeName(name: string): string {
    return name.replace(/[/\\:<>|?*"]+/g, '_').replace(/^_+|_+$/g, '');
  }

  private emitProgress(ev: ProgressEvent) {
    this.emit('progress', ev);
  }
}
