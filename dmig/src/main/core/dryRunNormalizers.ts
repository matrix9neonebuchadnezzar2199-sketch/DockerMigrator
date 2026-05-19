import { ErrorMessages } from './errors/codes.js';
import { ErrorCodes } from './errors/codes.js';
import type {
  ComposeProjectInfo,
  DryRunFinding,
  DmigErrorPayload,
  PreflightResult,
  ProbeSummary,
  SecretScanResult,
} from '@shared/types.js';

/** bind mount で info 扱いとする既知の安全パス（PoC）。 */
const SAFE_BIND_HOST_PATHS = [
  '/etc/localtime',
  '/etc/timezone',
  '/usr/share/zoneinfo',
  '/etc/hosts',
] as const;

function formatGb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

/**
 * ホストパスが PoC 上「安全」とみなせるか（読み取り専用相当の扱い）。
 */
export function isSafeBindMountHostPath(hostPath: string): boolean {
  const normalized = hostPath.replace(/\\/g, '/');
  return SAFE_BIND_HOST_PATHS.some(
    (p) => normalized === p || normalized.startsWith(`${p}/`),
  );
}

/**
 * preflight 結果を DryRunFinding に正規化する。
 */
export function normalizeCapacity(
  preflight: PreflightResult | null,
  preflightError: DmigErrorPayload | null,
): DryRunFinding[] {
  const findings: DryRunFinding[] = [];

  if (preflightError) {
    findings.push({
      id: 'capacity-preflight-error',
      severity: 'error',
      category: 'capacity',
      message: preflightError.message,
      target: preflightError.detail,
      hint: preflightError.code,
    });
    return findings;
  }

  if (!preflight) {
    return findings;
  }

  const { space, estimate, warnings } = preflight;

  if (space.status === 'insufficient') {
    findings.push({
      id: 'capacity-insufficient',
      severity: 'error',
      category: 'capacity',
      message: `出力先の空き容量が不足しています（必要 ${formatGb(space.requiredBytes)} / 空き ${formatGb(
        space.freeBytes,
      )}）`,
      target: space.path,
      hint: `推奨 ${formatGb(space.recommendedBytes)} 以上`,
    });
  } else if (space.status === 'warning') {
    findings.push({
      id: 'capacity-warning',
      severity: 'warn',
      category: 'capacity',
      message: ErrorMessages[ErrorCodes.DISK_SPACE_WARNING],
      target: space.path,
      hint: `推奨 ${formatGb(space.recommendedBytes)} 以上`,
    });
  }

  for (let i = 0; i < warnings.length; i++) {
    findings.push({
      id: `capacity-extra-warn-${i}`,
      severity: 'warn',
      category: 'capacity',
      message: warnings[i]!,
    });
  }

  for (const entry of estimate.breakdown) {
    const category =
      entry.kind === 'image'
        ? 'image'
        : entry.kind === 'volume'
          ? 'volume'
          : entry.kind === 'bindMount'
            ? 'bind-mount'
            : 'other';
    findings.push({
      id: `capacity-breakdown-${sanitizeIdPart(entry.kind)}-${sanitizeIdPart(entry.name)}`,
      severity: 'info',
      category,
      message: `推定圧縮後: ${formatGb(entry.estimatedBytes)}（元 ${formatGb(entry.originalBytes)}）`,
      target: entry.name,
    });
  }

  if (findings.length === 0 || !findings.some((f) => f.id === 'capacity-estimate-summary')) {
    findings.push({
      id: 'capacity-estimate-summary',
      severity: 'info',
      category: 'capacity',
      message: `推定圧縮後合計: ${formatGb(estimate.totalEstimated)}`,
      target: space.path,
    });
  }

  return findings;
}

/**
 * シークレットスキャン結果を DryRunFinding に正規化する。
 */
export function normalizeSecrets(
  secretsByProject: Record<string, SecretScanResult[]>,
): DryRunFinding[] {
  const findings: DryRunFinding[] = [];

  for (const [projectName, scans] of Object.entries(secretsByProject)) {
    for (const scan of scans) {
      for (const f of scan.findings) {
        const severity =
          f.severity === 'high' ? 'error' : f.severity === 'medium' ? 'warn' : 'info';
        findings.push({
          id: `secret-${sanitizeIdPart(projectName)}-${sanitizeIdPart(scan.filePath)}-${f.line}`,
          severity,
          category: 'secret',
          message: `${f.key}（${f.ruleName}）が検出されました`,
          target: `${projectName}: ${scan.filePath}:${f.line}`,
          hint: `プレビュー: ${f.preview}`,
        });
      }
    }
  }

  return findings;
}

/**
 * Compose プロジェクトの bind mount 一覧を DryRunFinding に正規化する。
 */
export function normalizeBindMounts(
  projects: ComposeProjectInfo[],
  projectNames: string[],
): DryRunFinding[] {
  const nameSet = new Set(projectNames);
  const findings: DryRunFinding[] = [];

  for (const project of projects) {
    if (!nameSet.has(project.name)) {
      continue;
    }
    for (const bm of project.bindMounts) {
      if (!bm.hostPath?.trim()) {
        continue;
      }
      const readOnlyLike = bm.readOnly || isSafeBindMountHostPath(bm.hostPath);
      findings.push({
        id: `bind-${sanitizeIdPart(project.name)}-${sanitizeIdPart(bm.serviceName)}-${sanitizeIdPart(bm.hostPath)}`,
        severity: readOnlyLike ? 'info' : 'warn',
        category: 'bind-mount',
        message: readOnlyLike
          ? `読み取り専用 bind mount: ${bm.hostPath} → ${bm.containerPath}`
          : `書き込み可能な bind mount: ${bm.hostPath} → ${bm.containerPath}`,
        target: `${project.name}/${bm.serviceName}`,
        hint: readOnlyLike
          ? undefined
          : 'エクスポート後、移行先で同等のホストパス準備が必要です',
      });
    }
  }

  return findings;
}

/**
 * probePackage 結果を DryRunFinding に正規化する。
 */
export function normalizeProbe(probe: ProbeSummary): DryRunFinding[] {
  const findings: DryRunFinding[] = [];
  const target = probe.packageDir;

  switch (probe.status) {
    case 'ok_complete':
      findings.push({
        id: 'package-ok-complete',
        severity: 'info',
        category: 'package',
        message: 'パッケージは完了状態です',
        target,
        hint: probe.dmigVersion ? `dmig ${probe.dmigVersion}` : undefined,
      });
      break;
    case 'ok_partial':
      findings.push({
        id: 'package-ok-partial',
        severity: 'warn',
        category: 'package',
        message: `中断パッケージです（未完了チャンク ${probe.pendingChunkCount} 件）`,
        target,
        hint: probe.interruptionReason,
      });
      break;
    case 'missing_dir':
    case 'missing_manifest':
      findings.push({
        id: `package-${probe.status}`,
        severity: 'error',
        category: 'package',
        message:
          probe.status === 'missing_dir'
            ? 'パッケージディレクトリが見つかりません'
            : 'manifest.json が見つかりません',
        target,
      });
      break;
    case 'invalid_manifest':
    case 'invalid_partial':
    case 'version_incompatible':
      findings.push({
        id: `package-${probe.status}`,
        severity: 'error',
        category: 'package',
        message: `パッケージ検証エラー: ${probe.status}`,
        target,
        hint: probe.diagnostic,
      });
      break;
    default:
      findings.push({
        id: 'package-unknown',
        severity: 'warn',
        category: 'package',
        message: `不明なパッケージ状態: ${probe.status}`,
        target,
      });
  }

  return findings;
}

/**
 * IPC レイヤの想定外エラーを 1 件の finding にする。
 */
export function normalizeGenericError(
  message: string,
  detail?: string,
): DryRunFinding[] {
  return [
    {
      id: 'other-generic-error',
      severity: 'error',
      category: 'other',
      message,
      target: detail,
    },
  ];
}
