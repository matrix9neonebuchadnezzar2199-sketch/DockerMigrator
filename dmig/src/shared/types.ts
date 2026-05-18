/**
 * dmig 共通型定義
 */

export interface ImageInfo {
  id: string;
  repoTags: string[];
  size: number;
  created: number;
}

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  size?: number;
}

export interface ProgressEvent {
  taskId: string;
  phase: 'save' | 'compress' | 'write' | 'verify' | 'load' | 'decompress' | 'snapshot';
  /** 処理済みバイト数 */
  current: number;
  /** 合計バイト数（不明時は 0） */
  total: number;
  message: string;
  percentage: number;
  /** 直近の転送速度（bytes/sec） */
  bytesPerSec?: number;
  /** 推定残り時間（秒） */
  etaSeconds?: number;
}

// =============================================================================
// manifest 1.1: 中断・再開 (partialState)
// 正本: docs/dmig-manifest-1.1-partial-resume-draft-v0.2.md
// =============================================================================

/**
 * manifest.json のスキーマ世代。
 * 省略時は Importer 等で 1.0 相当として扱う。
 */
export type SchemaVersion = '1.0' | '1.1';

/**
 * 再開時のチャンク検証方針（パッケージ単位で表明する意図）。
 * 1.0 manifest やフィールド欠落時は Importer 側で安全側（verify-all 相当）に寄せる想定。
 */
export type ChecksumPolicy = 'verify-all' | 'verify-resumed' | 'trust-completed';

/**
 * 中断理由（診断用・任意）。再開可否の判定には使わない（pendingChunks の有無で決める）。
 */
export type InterruptionReason = 'user-cancel' | 'error' | 'crash';

/**
 * manifest `contents` の系統を識別する。
 * 異なる系統間で `name` が衝突した場合に、chunk が指す対象を一意に特定するため
 * `ChunkRef` とセットで使う。
 *
 * 系統が追加された場合は本型に追加し、Importer 側の `chunkRef` 解決などの
 * 網羅 `switch` がコンパイルエラーで検知できる形を維持する。
 */
export type ContentKind = 'image' | 'volume' | 'composeProject';

/**
 * 未完了 chunk への参照。
 *
 * `contentKind` + `contentId` の複合キーで `manifest.contents` 内のエントリを
 * 一意に指す。`contentId` は当該系統内の `name`（現行 `ManifestImageEntry.name` 等）
 * を流用する。
 *
 * 将来 `contents` エントリに独立した `id` を追加した場合は、本コメントと
 * Importer 側の解決ロジックを更新して `id` 参照に統一する。
 *
 * 不変条件:
 *   - `byteOffset` >= 0
 *   - `byteLength` > 0
 *   - `byteOffset` + `byteLength` <= 該当 content の総バイト長
 *   - 同一 (`contentKind`, `contentId`, `chunkIndex`) は `pendingChunks` 内に高々 1 個
 *   - `expectedSha256` は hex 小文字 64 文字想定
 */
export interface ChunkRef {
  contentKind: ContentKind;
  contentId: string;
  chunkIndex: number;
  byteOffset: number;
  byteLength: number;
  /** SHA-256  hex 小文字 64 文字想定 */
  expectedSha256: string;
}

/**
 * 中断パッケージのメタ情報。完了パッケージにはキーごと存在させない。
 * `pendingChunks` は 1 件以上（空配列の partialState は不正）。
 */
export interface PartialState {
  pendingChunks: ChunkRef[];
  /** ISO8601 */
  lastUpdatedAt: string;
  checksumPolicy: ChecksumPolicy;
  /**
   * Exporter 内部用の不透明トークン（ファイルオフセット等）。Importer は解釈しない。
   */
  resumeToken?: string;
  interruptionReason?: InterruptionReason;
}

/**
 * `dmig:probePackage` の判定結果ステータス。
 *
 * パッケージの異常はすべてこの値で表現し、IPC レイヤでは throw しない（`Result<T>` の
 * `ok: false` は Main ハンドラの想定外 throw 用に予約）。UI は `status` を主に分岐し、
 * `diagnostic` は折りたたみ・開発者向けの補助とする。
 */
export type PackageProbeStatus =
  | 'ok_complete'
  | 'ok_partial'
  | 'invalid_manifest'
  | 'invalid_partial'
  | 'missing_dir'
  | 'missing_manifest'
  | 'version_incompatible';

/**
 * `dmig:probePackage` の結果サマリ。例外を投げずに完了/中断/異常を判別できる軽量型。
 *
 * 不変条件:
 *   - `status` が `ok_*` のとき: `manifestPresent === true`、`schemaVersion` / `dmigVersion` は埋まる
 *   - `status` が `ok_partial` のとき: `pendingChunkCount >= 1`
 *   - `status` が `ok_complete` / `ok_partial` のとき: `diagnostic` は **常に undefined**
 *   - `status` が `invalid_*` / `version_incompatible` のとき: `diagnostic` に補足を載せる
 *   - `status` が `missing_dir` / `missing_manifest` のとき: `manifestPresent === false`、
 *     `schemaVersion` / `dmigVersion` は undefined、`pendingChunkCount` は 0
 */
export interface ProbeSummary {
  packageDir: string;
  status: PackageProbeStatus;
  manifestPresent: boolean;
  schemaVersion?: SchemaVersion;
  dmigVersion?: string;
  /** `partialState?.pendingChunks.length` または 0 */
  pendingChunkCount: number;
  lastUpdatedAt?: string;
  interruptionReason?: InterruptionReason;
  checksumPolicy?: ChecksumPolicy;
  /** 中断 UI 用。先頭 8 件まで（`PROBE_PREVIEW_LIMIT` と一致させる）。 */
  pendingChunksPreview?: Array<Pick<ChunkRef, 'contentKind' | 'contentId' | 'chunkIndex'>>;
  /**
   * 異常系のみ設定（`invalid_manifest` / `invalid_partial` / `version_incompatible`）。
   * 正常系では **undefined を保証**する。
   */
  diagnostic?: string;
}

export interface DmigManifest {
  dmigVersion: string;
  createdAt: string;
  source: {
    os: NodeJS.Platform;
    arch: string;
    dockerVersion?: string;
    appVersion: string;
  };
  contents: {
    images: ManifestImageEntry[];
    /** Phase 5 追加 */
    volumes?: ManifestVolumeEntry[];
    /** Phase 5 追加 */
    composeProjects?: ManifestComposeEntry[];
  };
  totalSize: number;
  /** Phase 6: マニフェストスキーマ。無い場合は v1.0 として扱う。 */
  schemaVersion?: SchemaVersion;
  /** Phase 6: 差分パッケージの基底となる前回パッケージ。フルエクスポート時は省略。 */
  previousPackage?: {
    id: string;
    createdAt: string;
  };
  /** Phase 6: パッケージ全体の基底参照（差分チェーン用、任意）。 */
  baseRef?: string;
  /**
   * 1.1 のみ・中断パッケージのみ。完了パッケージでは省略する。
   * 存在する場合 `pendingChunks.length >= 1`。
   */
  partialState?: PartialState;
}

export interface ManifestImageEntry {
  name: string;
  filename: string;
  originalSize: number;
  compressedSize: number;
  sha256: string;
  /** Phase 6: 完全同梱 or 差分。省略時はフル扱い。 */
  kind?: 'full' | 'delta';
  /** Phase 6: 差分の基底エントリ参照（例: 前回 sha256）。 */
  baseRef?: string;
}

export interface ManifestVolumeEntry {
  name: string;
  filename: string;
  compressedSize: number;
  sha256: string;
  driver: string;
  kind?: 'full' | 'delta';
  baseRef?: string;
}

export interface ManifestComposeEntry {
  name: string;
  /** project-manifest.json への相対パス */
  manifestFile: string;
  /** 概要情報（一覧表示用） */
  serviceCount: number;
  volumeCount: number;
  hasEnvFile: boolean;
  envFileMasked: boolean;
  kind?: 'full' | 'delta';
  baseRef?: string;
}

export interface ExportRequest extends Cancellable {
  imageNames: string[];
  outputDir: string;
  packName?: string;
  compressionLevel?: number;
  /** Phase 6: 完全 or 差分（差分は後続 IPC で利用予定）。 */
  diffMode?: DiffMode;
  /** Phase 6: 差分の基底スナップショット ID。 */
  baseSnapshotId?: string;
  /** Phase 6: ボリューム差分の厳密さ（既定は後続で 'fast' 扱い）。 */
  volumeDiffStrategy?: VolumeDiffStrategy;
  /**
   * Phase 6: エクスポート完了後にスナップショットを自動保存する。
   * 省略時は true として扱う（後続フェーズで実装）。
   */
  autoSaveSnapshot?: boolean;
}

export interface ImportRequest extends Cancellable {
  packageDir: string;
  selectedImages: string[];
}

export interface DmigErrorPayload {
  code: string;
  message: string;
  detail?: string;
  phase?: string;
}

// ─────────────────────────────────────────────────────────────────
// Phase 5.1: キャンセル機構
// ─────────────────────────────────────────────────────────────────

/** Renderer が生成するジョブ識別子（crypto.randomUUID()）。 */
export type JobToken = string;

/** キャンセル可能なリクエストの共通部分。 */
export interface Cancellable {
  /** 省略時はキャンセル不可（後方互換） */
  jobToken?: JobToken;
}

/** キャンセル IPC の応答。 */
export interface CancelResult {
  aborted: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────
// Phase 5: Compose プロジェクト関連
// ─────────────────────────────────────────────────────────────────

/**
 * 稼働中または過去に起動した Compose プロジェクトの検出結果。
 * ラベル com.docker.compose.project を持つコンテナから逆引きで生成される。
 */
export interface ComposeProjectInfo {
  /** プロジェクト名（com.docker.compose.project） */
  name: string;
  /** compose.yaml の絶対パス（com.docker.compose.project.config_files の先頭） */
  configFiles: string[];
  /** プロジェクトの作業ディレクトリ（com.docker.compose.project.working_dir） */
  workingDir: string;
  /** プロジェクトに属するサービス一覧 */
  services: ComposeServiceInfo[];
  /** プロジェクトが使う named volume 名 */
  volumeNames: string[];
  /** プロジェクトが使う bind mount 一覧（ホストパスと container パス） */
  bindMounts: BindMountInfo[];
  /** .env ファイル等の検出結果 */
  envFiles: EnvFileInfo[];
  /** 推定合計サイズ（イメージ＋ボリューム＋コンテキストの近似） */
  estimatedSize: number;
}

export interface ComposeServiceInfo {
  /** サービス名（com.docker.compose.service） */
  name: string;
  /** 使用しているイメージ名 */
  image: string;
  /** build: 指定がある場合のホスト側コンテキストの絶対パス */
  buildContextPath: string | null;
  /** コンテナの現在状態（running, exited 等） */
  state: string;
}

export interface BindMountInfo {
  serviceName: string;
  /** ホスト側絶対パス */
  hostPath: string;
  /** コンテナ側パス */
  containerPath: string;
  /** readonly 指定があるか */
  readOnly: boolean;
}

export interface EnvFileInfo {
  /** .env ファイルの絶対パス */
  path: string;
  /** 存在するか */
  exists: boolean;
}

/** `docker compose` のワンクリック操作（ホスト CLI 経由）。 */
export type ComposeLifecycleAction = 'stop' | 'pull';

export interface ComposeLifecycleRequest {
  projectName: string;
  action: ComposeLifecycleAction;
}

// ─────────────────────────────────────────────────────────────────
// シークレット検出（SecretScanner）
// ─────────────────────────────────────────────────────────────────

/**
 * シークレット検出結果。ファイル1つにつき1件。
 */
export interface SecretScanResult {
  /** 対象ファイル絶対パス */
  filePath: string;
  /** 検出された機密候補 */
  findings: SecretFinding[];
}

export interface SecretFinding {
  /** 行番号（1始まり） */
  line: number;
  /** 検出されたキー名（例: "DB_PASSWORD"） */
  key: string;
  /** 値のプレビュー（先頭5文字＋***、ログ用） */
  preview: string;
  /** マッチしたルール名（例: "password-like", "aws-secret", "jwt"） */
  ruleName: string;
  /** 重要度 */
  severity: 'high' | 'medium' | 'low';
}

/**
 * ユーザーがシークレット警告ダイアログで選んだアクション。
 * - exclude: .env を同梱せず除外する（デフォルト）
 * - mask:    値を ***MASKED*** に置換した .env.masked を生成
 * - include: マスクせず .env をそのまま同梱
 */
export type SecretAction = 'exclude' | 'mask' | 'include';

/**
 * bind mount の各エントリに対するユーザー選択。
 * - packageContent: ホストディレクトリを tar 化して同梱
 * - recordPathOnly: パスのみ記録（端末Bで同名/別パスを用意してもらう）
 */
export type BindMountAction = 'packageContent' | 'recordPathOnly';

export interface BindMountChoice {
  hostPath: string;
  action: BindMountAction;
}

// ─────────────────────────────────────────────────────────────────
// Compose エクスポート/インポートのリクエスト
// ─────────────────────────────────────────────────────────────────

export interface ComposeExportRequest extends Cancellable {
  /** 対象プロジェクト名（複数可） */
  projectNames: string[];
  /** 出力先 USB パス */
  outputDir: string;
  /** パッケージ名（省略時は自動生成） */
  packName?: string;
  /** zstd 圧縮レベル（1-22, デフォルト3） */
  compressionLevel?: number;
  /** プロジェクトごとのシークレット処理選択 */
  secretActions: Record<string, SecretAction>;
  /** プロジェクトごとの bind mount 処理選択 */
  bindMountChoices: Record<string, BindMountChoice[]>;
  /** Phase 6: 差分エクスポート（Compose 差分に該当するプロジェクトのみ同梱） */
  diffMode?: DiffMode;
  /** Phase 6: 基底スナップショット ID（省略時は最新） */
  baseSnapshotId?: string;
  /** Phase 6: ボリューム厳密ハッシュ */
  volumeDiffStrategy?: VolumeDiffStrategy;
  /** Phase 6: 完了後に現在状態をスナップショット保存（既定 true） */
  autoSaveSnapshot?: boolean;
}

/** 中断済みパッケージの再開エクスポート（Main 専用）。 */
export interface ResumeExportRequest extends Cancellable {
  /** 再開対象の .dmig パッケージディレクトリ */
  packageDir: string;
  /** zstd 圧縮レベル（省略時は 3） */
  compressionLevel?: number;
}

export interface ComposeImportRequest extends Cancellable {
  packageDir: string;
  /** インポート対象のプロジェクト名 */
  selectedProjects: string[];
  /** 端末B側で compose.yaml を展開する先（プロジェクト名ごと） */
  destinationDirs: Record<string, string>;
  /** bind mount の展開先パスマッピング（hostPath を別パスに差し替えたい場合） */
  bindMountRemap?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────
// project-manifest.json（パッケージ内、プロジェクトごとに1つ）
// ─────────────────────────────────────────────────────────────────

export interface ProjectManifest {
  projectName: string;
  configFiles: string[];
  workingDir: string;
  services: ProjectManifestService[];
  volumes: ProjectManifestVolume[];
  bindMounts: ProjectManifestBindMount[];
  envFiles: ProjectManifestEnvFile[];
}

export interface ProjectManifestService {
  name: string;
  image: string;
  /** イメージが同パッケージに同梱されているか */
  imagePackaged: boolean;
  /** ビルドコンテキスト情報（同梱されている場合） */
  buildContext: {
    tarFile: string;
    originalPath: string;
  } | null;
}

export interface ProjectManifestVolume {
  name: string;
  packaged: boolean;
  tarFile: string | null;
  driver: string;
}

export interface ProjectManifestBindMount {
  serviceName: string;
  hostPath: string;
  containerPath: string;
  packaged: boolean;
  tarFile: string | null;
  readOnly: boolean;
}

export interface ProjectManifestEnvFile {
  /** パッケージ内の相対パス（".env" / ".env.masked" / null） */
  path: string | null;
  /** マスク処理されたか */
  masked: boolean;
  /** 検出されたシークレットのキー名一覧（参考） */
  secretsDetected: string[];
}

// ─────────────────────────────────────────────────────────────────
// Phase 5.1: tar バックエンド
// ─────────────────────────────────────────────────────────────────

/**
 * tar の実装種別。
 * - 'system': ホストの tar コマンドを spawn（Linux/macOS/WSL/Git for Windows）
 * - 'stream': tar-stream パッケージで純 Node 実装（依存なし、低速）
 * - 'auto':   起動時に probe して自動選択（デフォルト）
 */
export type TarBackendKind = 'system' | 'stream' | 'auto';

// ─────────────────────────────────────────────────────────────────
// Phase 5.1 第3回: 事前検証・エラーレポート
// ─────────────────────────────────────────────────────────────────

/**
 * 空き容量チェックの結果。
 */
export interface SpaceCheckResult {
  /** 検査対象パス */
  path: string;
  /** ドライブ全体の容量（bytes） */
  totalBytes: number;
  /** 空き容量（bytes） */
  freeBytes: number;
  /** 推定必要量（bytes、SizeEstimator から） */
  requiredBytes: number;
  /** 余裕係数を含めた推奨必要量（requiredBytes * 1.1 等） */
  recommendedBytes: number;
  /** 検査結果: ok=十分, warning=ぎりぎり, insufficient=不足 */
  status: 'ok' | 'warning' | 'insufficient';
}

/**
 * エクスポート前のサイズ推定結果。
 * 圧縮後サイズは元サイズの係数倍で仮定（実測ベースの典型値）。
 */
export interface SizeEstimate {
  /** イメージの推定圧縮後合計 */
  imagesEstimated: number;
  /** ボリュームの推定圧縮後合計 */
  volumesEstimated: number;
  /** ビルドコンテキスト・bind mount の推定圧縮後合計 */
  contextsEstimated: number;
  /** 合計 */
  totalEstimated: number;
  /** 内訳の詳細（UI 表示用） */
  breakdown: SizeEstimateEntry[];
}

export interface SizeEstimateEntry {
  kind: 'image' | 'volume' | 'buildContext' | 'bindMount';
  name: string;
  originalBytes: number;
  estimatedBytes: number;
}

/**
 * エクスポートの事前検証リクエスト。
 * Compose の場合は projectNames、Image のみの場合は imageNames を使う。
 */
export interface PreflightRequest {
  outputDir: string;
  /** Compose プロジェクト名（指定時、関連イメージ・ボリュームを集約推定） */
  projectNames?: string[];
  /** Image 名（個別エクスポート時） */
  imageNames?: string[];
}

export interface PreflightResult {
  estimate: SizeEstimate;
  space: SpaceCheckResult;
  /** 検証で見つかった追加の警告（OS/arch 差異、tar バックエンド等） */
  warnings: string[];
}

/**
 * エラーレポート ZIP 生成リクエスト。
 */
export interface ErrorReportRequest {
  /** 出力先ディレクトリ */
  outputDir: string;
  /** エラー情報（直近のエラー） */
  error: DmigErrorPayload;
  /** 直近の操作（任意、UI が分かる範囲で渡す） */
  lastAction?: string;
  /** ユーザーからのコメント（任意） */
  userComment?: string;
}

export interface ErrorReportResult {
  /** 生成された ZIP ファイルのパス */
  zipPath: string;
  /** ZIP のサイズ（bytes） */
  sizeBytes: number;
}

// ============================================================
// Phase 6: 差分エクスポート関連の型
// ============================================================

/** 差分モード。'full' = 完全エクスポート、'delta' = 差分のみ。 */
export type DiffMode = 'full' | 'delta';

/**
 * ボリューム差分判定戦略。
 * 'fast': mtime + size による高速判定（見落としリスク有）
 * 'strict': SHA-256 全ハッシュ計算（正確だが低速）
 */
export type VolumeDiffStrategy = 'fast' | 'strict';

/** 差分エントリの種別。 */
export type DiffEntryKind = 'added' | 'modified' | 'removed';

/** イメージの差分エントリ。 */
export interface DiffImageEntry {
  kind: DiffEntryKind;
  /** 現在側の Image ID（removed の場合は基底側の ID）。 */
  imageId: string;
  repoTags: string[];
  /** バイト。removed の場合は基底側のサイズ。 */
  size: number;
  /** modified のとき、基底側の Image ID。 */
  previousImageId?: string;
}

/** ボリュームの差分エントリ。 */
export interface DiffVolumeEntry {
  kind: DiffEntryKind;
  name: string;
  size: number;
  /** modified のときの変更理由。 */
  reason?: 'mtime' | 'size' | 'hash';
}

/** Compose プロジェクトの差分エントリ。 */
export interface DiffComposeEntry {
  kind: DiffEntryKind;
  projectName: string;
  reason?: 'config' | 'services';
  changedServices?: string[];
}

/** 差分計算結果。 */
export interface DiffResult {
  baseSnapshotId: string;
  baseMachineId: string;
  computedAt: string;
  volumeStrategy: VolumeDiffStrategy;
  images: DiffImageEntry[];
  volumes: DiffVolumeEntry[];
  composeProjects: DiffComposeEntry[];
}

/** 差分プレビュー要求。 */
export interface DiffPreviewRequest {
  /** 基底スナップショット ID（省略時は最新を自動選択）。 */
  baseSnapshotId?: string;
  /** ボリューム差分戦略（省略時は 'fast'）。 */
  volumeStrategy?: VolumeDiffStrategy;
  jobToken?: JobToken;
}

/** 差分プレビュー結果（UI 表示用サマリ付き）。 */
export interface DiffPreviewResult {
  diff: DiffResult;
  summary: {
    images: { added: number; modified: number; removed: number };
    volumes: { added: number; modified: number; removed: number };
    composeProjects: { added: number; modified: number; removed: number };
  };
  /** 推定転送サイズ（圧縮前、バイト）。added/modified のみ。 */
  estimatedSizeRaw: number;
  /** 推定転送サイズ（圧縮後、バイト）。SizeEstimator と同一係数。 */
  estimatedSizeCompressed: number;
}

// ─────────────────────────────────────────────────────────────────
// Phase 6: スナップショット型の再エクスポート（定義は snapshot-types.ts）
// ─────────────────────────────────────────────────────────────────

export type {
  Snapshot,
  SnapshotSummary,
  SnapshotImageEntry,
  SnapshotVolumeEntry,
  SnapshotComposeEntry,
  MachineInfo,
} from './snapshot-types.js';
