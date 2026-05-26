/**
 * Phase 7 以降の単体・統合テスト用フィクスチャ。
 * vitest の収集対象外（*.test.ts ではない）のため `vitest.config.ts` の include から除外される。
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { pipeline } from 'node:stream/promises';

import type {
  ChunkRef,
  DmigManifest,
  ImageInfo,
  PartialState,
  ProjectManifest,
  ProjectManifestBindMount,
  ProjectManifestEnvFile,
  ProjectManifestService,
  ProjectManifestVolume,
} from '@shared/types.js';
import type { DockerAdapter } from '../DockerAdapter.js';
import { createZstdCompressStream } from '../compression/zstdStreams.js';

const ZERO_SHA = '0'.repeat(64);

/** 既定の合成 manifest（画像 1 件・1.1）。 */
export function makeManifest(overrides: Partial<DmigManifest> = {}): DmigManifest {
  return {
    dmigVersion: '1.0.0',
    schemaVersion: '1.1',
    createdAt: '2020-01-01T00:00:00.000Z',
    source: { os: 'linux', arch: 'x64', appVersion: '0.1.0' },
    contents: {
      images: [
        {
          name: 'img1',
          filename: 'images/x.tar.zst',
          originalSize: 1,
          compressedSize: 1,
          sha256: ZERO_SHA,
        },
      ],
    },
    totalSize: 1,
    ...overrides,
  };
}

/** 既定の ChunkRef（段階 A プレースホルダ SHA）。 */
export function makeChunkRef(overrides: Partial<ChunkRef> = {}): ChunkRef {
  return {
    contentKind: 'image',
    contentId: 'img1',
    chunkIndex: 0,
    byteOffset: 0,
    byteLength: 100,
    expectedSha256: ZERO_SHA,
    ...overrides,
  };
}

/** 既定の partialState（pending 1 件）。 */
export function makePartialState(overrides: Partial<PartialState> = {}): PartialState {
  return {
    pendingChunks: [makeChunkRef()],
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    checksumPolicy: 'verify-resumed',
    ...overrides,
  };
}

const defaultService: ProjectManifestService = {
  name: 'svc',
  image: 'imgA:latest',
  imagePackaged: true,
  buildContext: null,
};

const defaultVolume: ProjectManifestVolume = {
  name: 'vol1',
  packaged: false,
  tarFile: null,
  driver: 'local',
};

const defaultBind: ProjectManifestBindMount = {
  serviceName: 'svc',
  hostPath: '/host',
  containerPath: '/c',
  packaged: false,
  tarFile: null,
  readOnly: false,
};

const defaultEnv: ProjectManifestEnvFile = {
  path: null,
  masked: false,
  secretsDetected: [],
};

/** 既定の project-manifest.json 相当オブジェクト。 */
export function makeProjectManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    projectName: 'proj1',
    configFiles: ['docker-compose.yml'],
    workingDir: '.',
    services: [defaultService],
    volumes: [defaultVolume],
    bindMounts: [defaultBind],
    envFiles: [defaultEnv],
    ...overrides,
  };
}

export interface DockerAdapterMockOptions {
  loadImageStream?: (stream: Readable, onProgress?: (msg: string) => void) => Promise<void>;
  saveImageStream?: (imageName: string) => Promise<Readable>;
  listImages?: () => Promise<ImageInfo[]>;
  ping?: () => Promise<{ version: string }>;
  resolveImageId?: (ref: string) => Promise<string | undefined>;
  exportVolumeStream?: (name: string) => Promise<Readable>;
  importVolumeStream?: (
    name: string,
    stream: Readable,
    opts?: { overwrite?: boolean },
  ) => Promise<void>;
  inspectVolume?: (name: string) => Promise<unknown>;
  getImageOriginalSize?: (imageRef: string) => Promise<number>;
}

/** DockerAdapter のテスト用スタブ。未指定メソッドは安全な既定実装。 */
export function makeDockerAdapterMock(opts: DockerAdapterMockOptions = {}): DockerAdapter {
  const loadImageStream =
    opts.loadImageStream ??
    (async (stream: Readable) => {
      stream.resume();
      await finished(stream);
    });

  const saveImageStream =
    opts.saveImageStream ?? (async () => Readable.from(Buffer.from('test-image-layer')));

  const listImages = opts.listImages ?? (async () => []);

  const ping = opts.ping ?? (async () => ({ version: 'test-docker' }));

  const resolveImageId = opts.resolveImageId ?? (async () => undefined);

  const exportVolumeStream =
    opts.exportVolumeStream ??
    (async () => {
      throw new Error('exportVolumeStream not stubbed');
    });

  const importVolumeStream =
    opts.importVolumeStream ??
    (async (stream: Readable) => {
      stream.resume();
      await finished(stream);
    });

  const inspectVolume =
    opts.inspectVolume ??
    (async () => ({
      Name: 'vol',
      Driver: 'local',
      Mountpoint: '/mnt',
    }));

  const getImageOriginalSize =
    opts.getImageOriginalSize ??
    (async (ref: string) => {
      const list = await listImages();
      const match = list.find((i) => i.repoTags.includes(ref));
      return match?.size ?? 4096;
    });

  return {
    ping,
    listImages,
    resolveImageId,
    getImageOriginalSize,
    saveImageStream,
    loadImageStream,
    exportVolumeStream,
    importVolumeStream,
    inspectVolume,
  } as unknown as DockerAdapter;
}

/**
 * payload を zstd 圧縮して `dir/relPath` に書き、ファイル内容の sha256 を返す。
 * Importer.verifyChecksum は圧縮ファイル全体をハッシュする。
 */
export async function writeSyntheticImageTarZst(
  dir: string,
  relPath: string,
  payload = 'dmig-test-payload',
): Promise<{ filepath: string; sha256: string; compressedSize: number }> {
  const filepath = join(dir, relPath);
  await mkdir(join(filepath, '..'), { recursive: true });
  const compressor = await createZstdCompressStream(3);
  await pipeline(Readable.from(Buffer.from(payload, 'utf-8')), compressor, createWriteStream(filepath));
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filepath)) {
    hash.update(chunk as Buffer);
  }
  const sha256 = hash.digest('hex');
  const { stat } = await import('node:fs/promises');
  const st = await stat(filepath);
  return { filepath, sha256, compressedSize: st.size };
}

/** tmpdir 作成と一括削除。 */
export function makeTempDirManager(): {
  create(prefix: string): Promise<string>;
  cleanupAll(): Promise<void>;
} {
  const dirs: string[] = [];
  return {
    async create(prefix: string): Promise<string> {
      const d = await mkdtemp(join(tmpdir(), prefix));
      dirs.push(d);
      return d;
    },
    async cleanupAll(): Promise<void> {
      for (const d of dirs.splice(0)) {
        await rm(d, { recursive: true, force: true });
      }
    },
  };
}

/** テスト用 manifest.json をディスクに書く。 */
export async function writePackageManifest(dir: string, manifest: DmigManifest): Promise<void> {
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

export { expectCompletedPackManifest } from './roundtripContract.js';
