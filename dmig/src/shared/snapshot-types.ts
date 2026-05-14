/**
 * Phase 6: スナップショット関連の共有型。
 * 差分エクスポートの基準となる「前回の状態」を表現する。
 * types.ts が肥大化しているため別ファイルに分離。
 */

/** スナップショット 1 件のフルデータ。 */
export interface Snapshot {
  /** スナップショット ID（ISO 8601 由来の文字列。ファイル名では `:` を `-` に置換）。 */
  id: string;
  /** このスナップショットを作成した端末の machine-id。 */
  machineId: string;
  /** 作成日時（ISO 8601）。 */
  createdAt: string;
  /** Docker Engine バージョン（例: "27.3.1"）。 */
  dockerVersion: string;
  /** OS 情報。 */
  os: {
    platform: string;
    release: string;
  };
  /** スナップショット JSON のスキーマ（将来拡張用）。 */
  schemaVersion: '1.0';
  /** 各リソースの状態。 */
  entries: {
    images: SnapshotImageEntry[];
    volumes: SnapshotVolumeEntry[];
    composeProjects: SnapshotComposeEntry[];
  };
}

/** スナップショット一覧表示用の軽量サマリ。 */
export interface SnapshotSummary {
  id: string;
  machineId: string;
  createdAt: string;
  imageCount: number;
  volumeCount: number;
  composeProjectCount: number;
  /** ファイルサイズ（バイト）。 */
  fileSize: number;
}

/** イメージのスナップショット記録。 */
export interface SnapshotImageEntry {
  /** Image ID（sha256:... 形式）。差分判定の主キー。 */
  id: string;
  /** リポジトリタグ一覧（例: ["nginx:latest"]）。 */
  repoTags: string[];
  /** イメージサイズ（バイト）。 */
  size: number;
}

/** ボリュームのスナップショット記録。 */
export interface SnapshotVolumeEntry {
  /** ボリューム名。差分判定の主キー。 */
  name: string;
  /** 最終更新時刻（ISO 8601）。mtime ベース差分判定で使用。 */
  mtime: string;
  /** 推定サイズ（バイト）。サイズ差分判定で使用。 */
  size: number;
  /** SHA-256 ハッシュ（厳密モード時のみ設定）。 */
  hash?: string;
}

/** Compose プロジェクトのスナップショット記録。 */
export interface SnapshotComposeEntry {
  /** プロジェクト名。差分判定の主キー。 */
  name: string;
  /** compose 設定の SHA-256（内容変更検知用）。 */
  configHash: string;
  /** サービス一覧（image ID 集合で差分判定）。 */
  services: Array<{
    name: string;
    imageId?: string;
  }>;
}

/** machine-id 情報。 */
export interface MachineInfo {
  /** machine-id（UUID v4）。 */
  machineId: string;
  /** 生成日時（ISO 8601）。 */
  generatedAt: string;
}
