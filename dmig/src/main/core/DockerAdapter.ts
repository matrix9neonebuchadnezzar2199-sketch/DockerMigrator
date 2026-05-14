import Docker from 'dockerode';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ImageInfo, VolumeInfo, ComposeProjectInfo, ComposeServiceInfo, BindMountInfo, EnvFileInfo } from '@shared/types.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';

/**
 * dockerode の薄いラッパ。
 * - OS別のソケットパス自動判定
 * - 例外を DmigError に正規化
 * - 進捗コールバック付きの save/load
 */
export class DockerAdapter {
  private readonly docker: Docker;

  constructor() {
    this.docker = new Docker(
      process.platform === 'win32'
        ? { socketPath: '//./pipe/docker_engine' }
        : { socketPath: '/var/run/docker.sock' },
    );
  }

  /**
   * ボリューム inspect（VolumeExporter 等から利用）。
   */
  async inspectVolume(volumeName: string): Promise<import('dockerode').VolumeInspectInfo> {
    try {
      return await this.docker.getVolume(volumeName).inspect();
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err?.statusCode === 404) {
        throw new DmigError(ErrorCodes.VOLUME_NOT_FOUND, {
          detail: `volume=${volumeName}`,
          cause: e instanceof Error ? e : undefined,
        });
      }
      throw wrapError(e, ErrorCodes.VOLUME_EXPORT_FAILED, 'inspectVolume');
    }
  }

  /**
   * Dockerデーモンの疎通確認。起動していなければ DmigError(E1001/E1002) を投げる。
   */
  async ping(): Promise<{ version: string }> {
    try {
      await this.docker.ping();
      const v = await this.docker.version();
      return { version: v.Version };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ENOENT') || msg.includes('connect')) {
        throw new DmigError(ErrorCodes.DOCKER_NOT_RUNNING, { detail: msg, cause: e });
      }
      if (msg.includes('EACCES') || msg.includes('permission')) {
        throw new DmigError(ErrorCodes.DOCKER_PERMISSION_DENIED, { detail: msg, cause: e });
      }
      throw new DmigError(ErrorCodes.DOCKER_CONNECT_FAILED, { detail: msg, cause: e });
    }
  }

  /**
   * 全イメージ一覧を取得。<none>:<none> は除外。
   */
  async listImages(): Promise<ImageInfo[]> {
    try {
      const list = await this.docker.listImages();
      return list
        .filter((i) => i.RepoTags && i.RepoTags.length > 0 && i.RepoTags[0] !== '<none>:<none>')
        .map((i) => ({
          id: i.Id,
          repoTags: i.RepoTags ?? [],
          size: i.Size,
          created: i.Created,
        }));
    } catch (e) {
      throw wrapError(e, ErrorCodes.IMAGE_LIST_FAILED, 'listImages');
    }
  }

  /**
   * イメージ参照（名前:タグ または ID）から Docker のイメージ ID（sha256:...）を取得する。
   * 存在しない場合は undefined。
   */
  async resolveImageId(imageRef: string): Promise<string | undefined> {
    const ref = imageRef.trim();
    if (!ref) return undefined;
    try {
      const insp = await this.docker.getImage(ref).inspect();
      return insp.Id;
    } catch {
      return undefined;
    }
  }

  /**
   * 1イメージを tar ストリームとして取得 (docker save 相当)。
   */
  async saveImageStream(imageName: string): Promise<Readable> {
    try {
      const image = this.docker.getImage(imageName);
      await image.inspect();
      const stream = await image.get();
      return stream as Readable;
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err?.statusCode === 404) {
        throw new DmigError(ErrorCodes.IMAGE_NOT_FOUND, {
          detail: `image=${imageName}`,
          cause: e instanceof Error ? e : undefined,
        });
      }
      throw wrapError(e, ErrorCodes.IMAGE_SAVE_FAILED, 'saveImageStream');
    }
  }

  /**
   * tar ストリームから docker load する。
   */
  async loadImageStream(tarStream: Readable, onProgress?: (msg: string) => void): Promise<void> {
    try {
      const loadStream = await this.docker.loadImage(tarStream);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(
          loadStream as NodeJS.ReadableStream,
          (err: Error | null) => (err ? reject(err) : resolve()),
          (event: { stream?: string }) => {
            if (onProgress && event?.stream) {
              onProgress(String(event.stream).trim());
            }
          },
        );
      });
    } catch (e) {
      throw wrapError(e, ErrorCodes.IMAGE_LOAD_FAILED, 'loadImageStream');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 5: ボリューム操作
  // ─────────────────────────────────────────────────────────────

  /**
   * 全ボリューム一覧を取得。
   */
  async listVolumes(): Promise<VolumeInfo[]> {
    try {
      const result = await this.docker.listVolumes();
      const vols = result.Volumes ?? [];
      return vols.map((v) => ({
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
      }));
    } catch (e) {
      throw wrapError(e, ErrorCodes.DOCKER_API_ERROR, 'listVolumes');
    }
  }

  /**
   * 名前付きボリュームの中身を **非圧縮 tar** ストリームとして取り出す（stdout）。
   * alpine 一発コンテナで `tar -C /vol -cf - .` を実行する。
   */
  async exportVolumeStream(volumeName: string): Promise<Readable> {
    try {
      await this.inspectVolume(volumeName);
    } catch (e) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.VOLUME_EXPORT_FAILED, 'exportVolumeStream/inspect');
    }

    try {
      await this.ensureImage('alpine:3.19');

      const container = await this.docker.createContainer({
        Image: 'alpine:3.19',
        Cmd: ['tar', '-C', '/vol', '-cf', '-', '.'],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        HostConfig: {
          AutoRemove: true,
          Binds: [`${volumeName}:/vol:ro`],
        },
      });

      const stream = (await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      })) as unknown as Readable;

      const stdout = new PassThrough();
      const stderr = new PassThrough();
      this.docker.modem.demuxStream(stream, stdout, stderr);

      await container.start();

      stderr.on('data', () => {
        /* tar の警告等は無視（巨大化防止） */
      });

      void container.wait().catch(() => {});

      return stdout;
    } catch (e) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.VOLUME_EXPORT_FAILED, 'exportVolumeStream');
    }
  }

  /**
   * **非圧縮 tar** ストリームをボリュームルートへ展開する（putArchive）。
   * 呼び出し側で zstd 展開済みの tar を渡すこと。
   */
  async importVolumeStream(
    volumeName: string,
    tarStream: Readable,
    options: { overwrite?: boolean } = {},
  ): Promise<void> {
    let existed = false;
    try {
      await this.docker.getVolume(volumeName).inspect();
      existed = true;
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err?.statusCode !== 404) {
        throw wrapError(e, ErrorCodes.VOLUME_IMPORT_FAILED, 'importVolumeStream/inspect');
      }
    }

    if (existed && !options.overwrite) {
      throw new DmigError(ErrorCodes.VOLUME_ALREADY_EXISTS, {
        detail: `volume=${volumeName}`,
      });
    }

    if (!existed) {
      try {
        await this.docker.createVolume({ Name: volumeName });
      } catch (e) {
        throw wrapError(e, ErrorCodes.VOLUME_IMPORT_FAILED, 'importVolumeStream/createVolume');
      }
    }

    try {
      await this.ensureImage('alpine:3.19');

      const container = await this.docker.createContainer({
        Image: 'alpine:3.19',
        Cmd: ['sleep', '86400'],
        HostConfig: {
          AutoRemove: false,
          Binds: [`${volumeName}:/vol`],
        },
      });

      await container.start();

      try {
        if (options.overwrite && existed) {
          const clearExec = await container.exec({
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            Cmd: ['sh', '-c', 'rm -rf /vol/* /vol/.[!.]* 2>/dev/null || true'],
          });
          const clearStream = await clearExec.start({ Detach: false, Tty: true });
          clearStream.resume();
          await finished(clearStream);
        }

        await container.putArchive(tarStream, { path: '/vol' });
      } finally {
        await container.stop({ t: 2 }).catch(() => {});
        await container.remove({ force: true }).catch(() => {});
      }
    } catch (e) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.VOLUME_IMPORT_FAILED, 'importVolumeStream');
    }
  }

  /**
   * 指定イメージがローカルに無ければ pull する（内部ヘルパー）。
   */
  private async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
      return;
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err?.statusCode !== 404) {
        throw wrapError(e, ErrorCodes.DOCKER_API_ERROR, 'ensureImage/inspect');
      }
    }

    try {
      const pullStream = await this.docker.pull(imageName);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(pullStream as NodeJS.ReadableStream, (err: Error | null) =>
          err ? reject(err) : resolve(),
        );
      });
    } catch (e) {
      throw wrapError(e, ErrorCodes.DOCKER_API_ERROR, `ensureImage/pull(${imageName})`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 5: Compose プロジェクト検出
  // ─────────────────────────────────────────────────────────────

  /**
   * ラベル com.docker.compose.project を持つコンテナを走査しプロジェクト単位に集約する。
   */
  async listComposeProjects(): Promise<ComposeProjectInfo[]> {
    let containers: import('dockerode').ContainerInfo[];
    try {
      containers = await this.docker.listContainers({
        all: true,
        filters: { label: ['com.docker.compose.project'] },
      });
    } catch (e) {
      throw wrapError(e, ErrorCodes.COMPOSE_LIST_FAILED, 'listContainers');
    }

    const byProject = new Map<string, import('dockerode').ContainerInfo[]>();
    for (const c of containers) {
      const projectName = c.Labels?.['com.docker.compose.project'];
      if (!projectName) continue;
      const arr = byProject.get(projectName) ?? [];
      arr.push(c);
      byProject.set(projectName, arr);
    }

    const projects: ComposeProjectInfo[] = [];
    for (const [name, conts] of byProject.entries()) {
      const first = conts[0];

      const configFilesRaw = first.Labels?.['com.docker.compose.project.config_files'] ?? '';
      const configFiles = configFilesRaw
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);

      const workingDir = first.Labels?.['com.docker.compose.project.working_dir'] ?? '';

      const services: ComposeServiceInfo[] = [];
      const volumeNamesSet = new Set<string>();
      const bindMounts: BindMountInfo[] = [];

      for (const c of conts) {
        const serviceName = c.Labels?.['com.docker.compose.service'] ?? '(unknown)';
        let inspectInfo: import('dockerode').ContainerInspectInfo | null = null;
        try {
          inspectInfo = await this.docker.getContainer(c.Id).inspect();
        } catch {
          inspectInfo = null;
        }

        services.push({
          name: serviceName,
          image: c.Image,
          buildContextPath: null,
          state: c.State,
        });

        const mounts = (inspectInfo?.Mounts ?? c.Mounts ?? []) as Array<{
          Type?: string;
          Name?: string;
          Source?: string;
          Destination?: string;
          RW?: boolean;
        }>;
        for (const m of mounts) {
          if (m.Type === 'volume' && m.Name) {
            volumeNamesSet.add(m.Name);
          } else if (m.Type === 'bind' && m.Source && m.Destination) {
            bindMounts.push({
              serviceName,
              hostPath: m.Source,
              containerPath: m.Destination,
              readOnly: !m.RW,
            });
          }
        }
      }

      const envFiles: EnvFileInfo[] = workingDir
        ? [{ path: join(workingDir.replace(/[/\\]+$/, ''), '.env'), exists: false }]
        : [];

      projects.push({
        name,
        configFiles,
        workingDir,
        services,
        volumeNames: Array.from(volumeNamesSet),
        bindMounts,
        envFiles,
        estimatedSize: 0,
      });
    }

    return projects;
  }
}
