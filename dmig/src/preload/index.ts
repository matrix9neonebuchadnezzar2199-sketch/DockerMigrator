import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ExportRequest,
  ImportRequest,
  ProgressEvent,
  DmigErrorPayload,
  DmigManifest,
  ImageInfo,
  ComposeProjectInfo,
  ComposeExportRequest,
  ComposeImportRequest,
  SecretScanResult,
  VolumeInfo,
  JobToken,
  CancelResult,
  PreflightRequest,
  PreflightResult,
  ErrorReportRequest,
  ErrorReportResult,
} from '../shared/types.js';

export type Result<T> = { ok: true; data: T } | { ok: false; error: DmigErrorPayload };

/**
 * Renderer 側に型安全なAPIをエクスポーズする。
 */
export interface DmigAPI {
  ping(): Promise<Result<{ version: string }>>;
  listImages(): Promise<Result<ImageInfo[]>>;
  exportImages(req: ExportRequest): Promise<Result<DmigManifest>>;
  importImages(req: ImportRequest): Promise<Result<void>>;
  readManifest(packageDir: string): Promise<Result<DmigManifest>>;
  onProgress(cb: (ev: ProgressEvent) => void): () => void;

  /** 稼働中または過去に起動した Compose プロジェクト一覧 */
  listComposeProjects(): Promise<Result<ComposeProjectInfo[]>>;
  /** ボリューム一覧 */
  listVolumes(): Promise<Result<VolumeInfo[]>>;
  /** .env スキャン（projectName → 結果配列） */
  scanSecrets(projects: ComposeProjectInfo[]): Promise<Result<Record<string, SecretScanResult[]>>>;
  /** Compose プロジェクトをパッケージ化 */
  exportCompose(
    req: ComposeExportRequest,
  ): Promise<Result<{ manifest: DmigManifest; packDir: string }>>;
  /** Compose プロジェクトをパッケージから復元 */
  importCompose(req: ComposeImportRequest): Promise<Result<void>>;
  /** フォルダ選択ダイアログ */
  selectDirectory(options?: {
    title?: string;
    defaultPath?: string;
  }): Promise<Result<string | null>>;

  /** 進行中ジョブを中止する */
  cancel(jobToken: JobToken): Promise<Result<CancelResult>>;

  /** エクスポート前の事前検証（空き容量・サイズ推定） */
  preflight(req: PreflightRequest): Promise<Result<PreflightResult>>;
  /** エラーレポート ZIP を生成して保存 */
  saveErrorReport(req: ErrorReportRequest): Promise<Result<ErrorReportResult>>;
}

const api: DmigAPI = {
  ping: () => ipcRenderer.invoke('dmig:ping'),
  listImages: () => ipcRenderer.invoke('dmig:listImages'),
  exportImages: (req) => ipcRenderer.invoke('dmig:export', req),
  importImages: (req) => ipcRenderer.invoke('dmig:import', req),
  readManifest: (dir) => ipcRenderer.invoke('dmig:readManifest', dir),
  onProgress: (cb) => {
    const listener = (_e: IpcRendererEvent, ev: ProgressEvent) => {
      cb(ev);
    };
    ipcRenderer.on('dmig:progress', listener);
    return () => {
      ipcRenderer.off('dmig:progress', listener);
    };
  },

  listComposeProjects: () => ipcRenderer.invoke('dmig:listComposeProjects'),
  listVolumes: () => ipcRenderer.invoke('dmig:listVolumes'),
  scanSecrets: (projects) => ipcRenderer.invoke('dmig:scanSecrets', projects),
  exportCompose: (req) => ipcRenderer.invoke('dmig:exportCompose', req),
  importCompose: (req) => ipcRenderer.invoke('dmig:importCompose', req),
  selectDirectory: (options) => ipcRenderer.invoke('dmig:selectDirectory', options ?? {}),

  cancel: (jobToken) => ipcRenderer.invoke('dmig:cancel', jobToken),

  preflight: (req) => ipcRenderer.invoke('dmig:preflight', req),
  saveErrorReport: (req) => ipcRenderer.invoke('dmig:saveErrorReport', req),
};

contextBridge.exposeInMainWorld('dmig', api);
