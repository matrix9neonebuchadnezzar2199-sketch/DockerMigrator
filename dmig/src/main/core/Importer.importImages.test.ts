import { finished } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { ErrorCodes } from '@shared/codes.js';
import { Importer } from './Importer.js';
import type { OpenedPackageBase } from './importer/OpenedPackage.js';
import {
  makeDockerAdapterMock,
  makeManifest,
  makeTempDirManager,
  writeSyntheticImageTarZst,
} from './__test-fixtures__/index.js';

describe('Importer.importImages (OpenedPackageBase)', () => {
  const tmp = makeTempDirManager();
  afterEach(async () => {
    await tmp.cleanupAll();
  });

  it('正常: 1 イメージ選択 → verify → load フェーズの progress が順に発火', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const { sha256 } = await writeSyntheticImageTarZst(dir, 'images/imgA.tar.zst');
    const manifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA',
            filename: 'images/imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256,
          },
        ],
      },
    });
    const loadSpy = vi.fn().mockResolvedValue(undefined);
    const docker = makeDockerAdapterMock({ loadImageStream: loadSpy });
    const importer = new Importer(docker);
    const phases: string[] = [];
    importer.on('progress', (ev) => phases.push(ev.phase));
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await importer.importImages(opened, ['imgA']);
    expect(phases).toContain('verify');
    expect(phases).toContain('load');
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('正常: 複数イメージ (3 件) 選択 → verify の current が 0→1→2', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const names = ['img0', 'img1', 'img2'] as const;
    const images = await Promise.all(
      names.map(async (n, i) => {
        const { sha256 } = await writeSyntheticImageTarZst(dir, `images/${n}.tar.zst`, `payload-${i}`);
        return {
          name: n,
          filename: `images/${n}.tar.zst`,
          originalSize: 1,
          compressedSize: 1,
          sha256,
        };
      }),
    );
    const manifest = makeManifest({ contents: { images } });
    const docker = makeDockerAdapterMock();
    const importer = new Importer(docker);
    const verifyCurrents: number[] = [];
    importer.on('progress', (ev) => {
      if (ev.phase === 'verify') verifyCurrents.push(ev.current);
    });
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await importer.importImages(opened, [...names]);
    expect(verifyCurrents).toEqual([0, 1, 2]);
  });

  it('異常: selectedImages が manifest に存在しない名前 → E2003', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const { sha256 } = await writeSyntheticImageTarZst(dir, 'images/imgA.tar.zst');
    const manifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA',
            filename: 'images/imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256,
          },
        ],
      },
    });
    const importer = new Importer(makeDockerAdapterMock());
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await expect(importer.importImages(opened, ['missing'])).rejects.toMatchObject({
      code: ErrorCodes.IMAGE_NOT_FOUND,
    });
  });

  it('異常: selectedImages が空配列 → E2003', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const { sha256 } = await writeSyntheticImageTarZst(dir, 'images/imgA.tar.zst');
    const manifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA',
            filename: 'images/imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256,
          },
        ],
      },
    });
    const importer = new Importer(makeDockerAdapterMock());
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await expect(importer.importImages(opened, [])).rejects.toMatchObject({
      code: ErrorCodes.IMAGE_NOT_FOUND,
    });
  });

  it('異常: signal.aborted が初回 iteration 前に true → E6010 JOB_CANCELLED', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const { sha256 } = await writeSyntheticImageTarZst(dir, 'images/imgA.tar.zst');
    const manifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA',
            filename: 'images/imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256,
          },
        ],
      },
    });
    const ac = new AbortController();
    ac.abort();
    const importer = new Importer(makeDockerAdapterMock());
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await expect(importer.importImages(opened, ['imgA'], ac.signal)).rejects.toMatchObject({
      code: ErrorCodes.JOB_CANCELLED,
    });
  });

  it('異常: signal.aborted が 2 件目処理前に true → E6010', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const names = ['img0', 'img1'] as const;
    const images = await Promise.all(
      names.map(async (n, i) => {
        const { sha256 } = await writeSyntheticImageTarZst(dir, `images/${n}.tar.zst`, `p-${i}`);
        return {
          name: n,
          filename: `images/${n}.tar.zst`,
          originalSize: 1,
          compressedSize: 1,
          sha256,
        };
      }),
    );
    const manifest = makeManifest({ contents: { images } });
    const ac = new AbortController();
    let loadsCompleted = 0;
    const docker = makeDockerAdapterMock({
      loadImageStream: async (stream: Readable) => {
        stream.resume();
        await finished(stream);
        loadsCompleted += 1;
        if (loadsCompleted === 1) {
          ac.abort();
        }
      },
    });
    const importer = new Importer(docker);
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await expect(importer.importImages(opened, [...names], ac.signal)).rejects.toMatchObject({
      code: ErrorCodes.JOB_CANCELLED,
    });
  });

  it('異常: チャンク sha256 不一致 → E8001 CHECKSUM_MISMATCH', async () => {
    const dir = await tmp.create('dmig-import-test-');
    await writeSyntheticImageTarZst(dir, 'images/imgA.tar.zst');
    const manifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA',
            filename: 'images/imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256: 'a'.repeat(64),
          },
        ],
      },
    });
    const importer = new Importer(makeDockerAdapterMock());
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await expect(importer.importImages(opened, ['imgA'])).rejects.toMatchObject({
      code: ErrorCodes.CHECKSUM_MISMATCH,
    });
  });

  it('正常: filename が images/ プレフィックス無し → 自動補完で loadImageStream が呼ばれる', async () => {
    const dir = await tmp.create('dmig-import-test-');
    const { sha256 } = await writeSyntheticImageTarZst(dir, 'images/imgA.tar.zst');
    const manifest = makeManifest({
      contents: {
        images: [
          {
            name: 'imgA',
            filename: 'imgA.tar.zst',
            originalSize: 1,
            compressedSize: 1,
            sha256,
          },
        ],
      },
    });
    const loadSpy = vi.fn().mockResolvedValue(undefined);
    const docker = makeDockerAdapterMock({ loadImageStream: loadSpy });
    const importer = new Importer(docker);
    const opened: OpenedPackageBase = { mode: 'base', packageDir: dir, manifest };
    await importer.importImages(opened, ['imgA']);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});
