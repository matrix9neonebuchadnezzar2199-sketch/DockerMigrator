/**
 * Phase 6: スナップショット差分計算エンジン。
 *
 * 規約:
 * - machine-id 不一致は E2061
 * - strict 時は hash が両方ある場合のみ hash 比較、欠落時は mtime+size にフォールバック
 */
import type { Snapshot } from '@shared/snapshot-types.js';
import type {
  DiffComposeEntry,
  DiffImageEntry,
  DiffResult,
  DiffVolumeEntry,
  VolumeDiffStrategy,
} from '@shared/types.js';
import { DmigError, wrapError } from '../errors/DmigError.js';
import { ErrorCodes } from '../errors/codes.js';

/**
 * 2 つの {@link Snapshot} を比較して {@link DiffResult} を構築する。
 */
export class DiffEngine {
  /**
   * 基底スナップショットと現在スナップショットの差分を計算する。
   *
   * @param base - 基底（前回）
   * @param current - 現在
   * @param strategy - ボリューム比較戦略
   */
  compute(base: Snapshot, current: Snapshot, strategy: VolumeDiffStrategy): DiffResult {
    if (base.machineId !== current.machineId) {
      throw new DmigError(ErrorCodes.SNAPSHOT_INCOMPATIBLE, {
        detail: `baseMachineId=${base.machineId} currentMachineId=${current.machineId}`,
        phase: 'DiffEngine.compute',
      });
    }

    try {
      return {
        baseSnapshotId: base.id,
        baseMachineId: base.machineId,
        computedAt: new Date().toISOString(),
        volumeStrategy: strategy,
        images: this.diffImages(base, current),
        volumes: this.diffVolumes(base, current, strategy),
        composeProjects: this.diffCompose(base, current),
      };
    } catch (e: unknown) {
      if (e instanceof DmigError) throw e;
      throw wrapError(e, ErrorCodes.DIFF_COMPUTATION_FAILED, 'DiffEngine.compute');
    }
  }

  private diffImages(base: Snapshot, current: Snapshot): DiffImageEntry[] {
    const result: DiffImageEntry[] = [];
    const baseById = new Map(base.entries.images.map((i) => [i.id, i]));
    const currentById = new Map(current.entries.images.map((i) => [i.id, i]));

    for (const img of current.entries.images) {
      if (baseById.has(img.id)) continue;

      const matchByTag = base.entries.images.find((b) =>
        b.repoTags.some((t) => img.repoTags.includes(t)),
      );
      if (matchByTag) {
        result.push({
          kind: 'modified',
          imageId: img.id,
          repoTags: img.repoTags,
          size: img.size,
          previousImageId: matchByTag.id,
        });
      } else {
        result.push({
          kind: 'added',
          imageId: img.id,
          repoTags: img.repoTags,
          size: img.size,
        });
      }
    }

    for (const img of base.entries.images) {
      if (currentById.has(img.id)) continue;
      const stillExists = current.entries.images.some((c) =>
        c.repoTags.some((t) => img.repoTags.includes(t)),
      );
      if (!stillExists) {
        result.push({
          kind: 'removed',
          imageId: img.id,
          repoTags: img.repoTags,
          size: img.size,
        });
      }
    }

    return result;
  }

  private diffVolumes(
    base: Snapshot,
    current: Snapshot,
    strategy: VolumeDiffStrategy,
  ): DiffVolumeEntry[] {
    const result: DiffVolumeEntry[] = [];
    const baseByName = new Map(base.entries.volumes.map((v) => [v.name, v]));
    const currentByName = new Map(current.entries.volumes.map((v) => [v.name, v]));

    for (const cur of current.entries.volumes) {
      const prev = baseByName.get(cur.name);
      if (!prev) {
        result.push({ kind: 'added', name: cur.name, size: cur.size });
        continue;
      }

      let reason: DiffVolumeEntry['reason'] | undefined;
      if (strategy === 'strict' && prev.hash && cur.hash) {
        if (prev.hash !== cur.hash) reason = 'hash';
      } else {
        if (prev.size !== cur.size) reason = 'size';
        else if (prev.mtime !== cur.mtime) reason = 'mtime';
      }
      if (reason) {
        result.push({ kind: 'modified', name: cur.name, size: cur.size, reason });
      }
    }

    for (const prev of base.entries.volumes) {
      if (!currentByName.has(prev.name)) {
        result.push({ kind: 'removed', name: prev.name, size: prev.size });
      }
    }

    return result;
  }

  private diffCompose(base: Snapshot, current: Snapshot): DiffComposeEntry[] {
    const result: DiffComposeEntry[] = [];
    const baseByName = new Map(base.entries.composeProjects.map((p) => [p.name, p]));
    const currentByName = new Map(current.entries.composeProjects.map((p) => [p.name, p]));

    for (const cur of current.entries.composeProjects) {
      const prev = baseByName.get(cur.name);
      if (!prev) {
        result.push({ kind: 'added', projectName: cur.name });
        continue;
      }
      if (prev.configHash !== cur.configHash) {
        result.push({
          kind: 'modified',
          projectName: cur.name,
          reason: 'config',
        });
        continue;
      }
      const changedServices = this.findChangedServices(prev.services, cur.services);
      if (changedServices.length > 0) {
        result.push({
          kind: 'modified',
          projectName: cur.name,
          reason: 'services',
          changedServices,
        });
      }
    }

    for (const prev of base.entries.composeProjects) {
      if (!currentByName.has(prev.name)) {
        result.push({ kind: 'removed', projectName: prev.name });
      }
    }

    return result;
  }

  private findChangedServices(
    prev: Array<{ name: string; imageId?: string }>,
    cur: Array<{ name: string; imageId?: string }>,
  ): string[] {
    const changed: string[] = [];
    const prevByName = new Map(prev.map((s) => [s.name, s]));
    for (const c of cur) {
      const p = prevByName.get(c.name);
      if (!p || p.imageId !== c.imageId) changed.push(c.name);
    }
    for (const p of prev) {
      if (!cur.some((c) => c.name === p.name)) changed.push(p.name);
    }
    return changed;
  }
}
