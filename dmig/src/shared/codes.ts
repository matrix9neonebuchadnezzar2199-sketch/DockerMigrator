/**
 * dmig エラーコード定義（Main / Renderer 共通）
 * E1xxx: Docker接続/操作
 * E2xxx: エクスポート処理（E205x: スナップショット / Phase 6、E206x: 差分計算 / Phase 6、E207x: manifest 1.1 中断・再開 / Phase 6）
 * E3xxx: 圧縮処理
 * E4xxx: I/O・USB
 * E5xxx: インポート処理（E504x: 差分基底 / Phase 6）
 * E6xxx: キャンセル・再開（E602x: 再開 / Phase 6）
 * E7xxx: エラーレポート
 * E8xxx: 整合性
 * E9xxx: 想定外
 */

export const ErrorCodes = {
  DOCKER_NOT_RUNNING: 'E1001',
  DOCKER_CONNECT_FAILED: 'E1002',
  DOCKER_PERMISSION_DENIED: 'E1003',
  DOCKER_API_ERROR: 'E1004',

  IMAGE_LIST_FAILED: 'E2001',
  IMAGE_SAVE_FAILED: 'E2002',
  IMAGE_NOT_FOUND: 'E2003',
  IMAGE_PRUNE_FAILED: 'E2004',
  COMPOSE_LIST_FAILED: 'E2010',
  COMPOSE_NOT_FOUND: 'E2011',
  COMPOSE_CONFIG_READ_FAILED: 'E2012',
  /** docker compose stop/pull 等の CLI 実行失敗 */
  COMPOSE_CLI_FAILED: 'E2013',
  VOLUME_EXPORT_FAILED: 'E2020',
  VOLUME_NOT_FOUND: 'E2021',
  BUILD_CONTEXT_NOT_FOUND: 'E2030',
  BUILD_CONTEXT_TAR_FAILED: 'E2031',
  BIND_MOUNT_TAR_FAILED: 'E2032',
  ENV_FILE_READ_FAILED: 'E2040',

  SNAPSHOT_WRITE_FAILED: 'E2050',
  SNAPSHOT_READ_FAILED: 'E2051',
  SNAPSHOT_CORRUPTED: 'E2052',

  DIFF_COMPUTATION_FAILED: 'E2060',
  SNAPSHOT_INCOMPATIBLE: 'E2061',
  NO_BASE_SNAPSHOT: 'E2062',

  /** manifest 1.1: 中断パッケージを差分の基底として開こうとした */
  INVALID_BASE_PACKAGE: 'E2070',
  /** manifest 1.1: 完了パッケージを再開対象として開こうとした */
  NOT_A_PARTIAL_PACKAGE: 'E2071',
  /** manifest 1.1: chunk の SHA-256 が期待値と一致しない */
  CHUNK_CHECKSUM_MISMATCH: 'E2072',
  /** manifest 1.1: エクスポート時の previousPackage が中断状態 */
  EXPORT_PREVIOUS_IS_PARTIAL: 'E2073',
  /** manifest 1.1: previousPackage チェインに中断ノードが含まれる */
  CHAIN_CONTAINS_PARTIAL: 'E2074',
  /**
   * manifest 1.1: partialState 構造不正（Importer.validatePartialState）。
   * `DmigError.detail` は `reason=snake_case` を先頭にした key=value 連結（値の空白は %20）。
   * 識別子: partial_state_on_v1_0 | empty_pending_chunks | unknown_content_ref |
   * duplicate_chunk_ref | invalid_chunk_bounds | invalid_sha256_format |
   * partial_state_incomplete | invalid_content_kind
   */
  MANIFEST_PARTIAL_INVALID: 'E2075',

  COMPRESS_FAILED: 'E3001',
  CHECKSUM_FAILED: 'E3002',

  USB_PATH_NOT_FOUND: 'E4001',
  DISK_SPACE_INSUFFICIENT: 'E4002',
  WRITE_INTERRUPTED: 'E4003',
  MANIFEST_WRITE_FAILED: 'E4004',
  DISK_SPACE_WARNING: 'E4005',
  PREFLIGHT_FAILED: 'E4006',

  REPORT_WRITE_FAILED: 'E7001',
  REPORT_OUTPUT_INVALID: 'E7002',

  PACK_FORMAT_INVALID: 'E5001',
  PACK_VERSION_INCOMPATIBLE: 'E5002',
  IMAGE_LOAD_FAILED: 'E5003',
  VOLUME_IMPORT_FAILED: 'E5020',
  VOLUME_ALREADY_EXISTS: 'E5021',
  COMPOSE_IMPORT_FAILED: 'E5030',
  DESTINATION_DIR_INVALID: 'E5031',
  DESTINATION_DIR_NOT_EMPTY: 'E5032',

  BASE_PACKAGE_MISMATCH: 'E5040',
  BASE_PACKAGE_NOT_FOUND: 'E5041',

  JOB_CANCELLED: 'E6010',
  JOB_TOKEN_NOT_FOUND: 'E6011',
  JOB_ALREADY_FINISHED: 'E6012',

  PARTIAL_FILE_CORRUPTED: 'E6020',
  RESUME_NOT_APPLICABLE: 'E6021',

  CHECKSUM_MISMATCH: 'E8001',

  UNKNOWN_ERROR: 'E9001',

  /** Renderer バリデーション（IPC 外の入力チェック） */
  UI_COMPOSE_NO_PROJECT: 'E9101',
  UI_COMPOSE_OUTPUT_REQUIRED: 'E9102',
  UI_COMPOSE_IMPORT_DEST_MISSING: 'E9103',

  /** Renderer 描画フェイルセーフ（ErrorBoundary） */
  UI_RENDER_FAILED: 'E9190',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorMessages: Record<ErrorCode, string> = {
  E1001: 'Docker Desktop が起動していません。起動してから再試行してください。',
  E1002: 'Docker Engine に接続できませんでした。ソケットパスを確認してください。',
  E1003: 'Docker ソケットへのアクセス権限がありません。',
  E1004: 'Docker API でエラーが発生しました。',

  E2001: 'イメージ一覧の取得に失敗しました。',
  E2002: 'イメージのエクスポート (docker save) に失敗しました。',
  E2003: '指定されたイメージが見つかりませんでした。',
  E2004: '未使用イメージの削除（docker image prune）に失敗しました。',
  E2010: 'Compose プロジェクトの一覧取得に失敗しました。',
  E2011: '指定された Compose プロジェクトが見つかりませんでした。',
  E2012: 'compose.yaml の読み込みに失敗しました。',
  E2013: 'docker compose コマンドの実行に失敗しました。Docker Desktop が起動しているか、compose ファイルのパスを確認してください。',
  E2020: 'ボリュームのエクスポートに失敗しました。',
  E2021: '指定されたボリュームが見つかりませんでした。',
  E2030: 'ビルドコンテキストのディレクトリが見つかりません。',
  E2031: 'ビルドコンテキストの tar 化に失敗しました。',
  E2032: 'bind mount の tar 化に失敗しました。',
  E2040: '.env ファイルの読み込みに失敗しました。',

  E2050: 'スナップショットの保存に失敗しました。ディスク容量や書き込み権限を確認してください。',
  E2051: 'スナップショットの読み込みに失敗しました。ファイルが存在しないか、アクセス権限がない可能性があります。',
  E2052: 'スナップショットファイルが破損しています。新しくフルエクスポートを実行してください。',

  E2060: '差分の計算に失敗しました。スナップショットまたは Docker の状態を確認してください。',
  E2061: '基底スナップショットの端末識別子が現在の端末と一致しません。同じ端末で作成されたスナップショットを使用してください。',
  E2062: '差分モードが指定されましたが、基底となるスナップショットが存在しません。先にフルエクスポートを実行してください。',

  E2070: '中断されたパッケージを差分の基底として開くことはできません。',
  E2071: '完了済みパッケージを再開対象として開くことはできません。',
  E2072: 'チャンクの SHA-256 検証に失敗しました。',
  E2073: 'エクスポートの基底パッケージが中断状態です。完了パッケージを基底にしてください。',
  E2074: '基底パッケージのチェインに中断ノードが含まれています。',
  E2075: 'manifest の中断状態(partialState)が不正です。',

  E3001: 'zstd 圧縮処理に失敗しました。',
  E3002: 'SHA-256 ハッシュの計算に失敗しました。',

  E4001: '指定された出力パスが見つかりません。USBが接続されているか確認してください。',
  E4002: 'ディスクの空き容量が不足しています。',
  E4003: '書き込みが中断されました。',
  E4004: 'マニフェストファイルの書き込みに失敗しました。',
  E4005: 'ディスクの空き容量がぎりぎりです。続行する前に他のファイルを整理することを推奨します。',
  E4006: '事前検証に失敗しました。',

  E7001: 'エラーレポートの書き込みに失敗しました。',
  E7002: 'エラーレポートの出力先パスが不正です。',

  E5001: 'パッケージ形式が不正です。manifest.json が見つかりません。',
  E5002: 'このパッケージのバージョンには対応していません。',
  E5003: 'イメージのロード (docker load) に失敗しました。',
  E5020: 'ボリュームのインポートに失敗しました。',
  E5021: '同名のボリュームが既に存在します。',
  E5030: 'Compose プロジェクトのインポートに失敗しました。',
  E5031: 'インポート先のディレクトリパスが不正です。',
  E5032: 'インポート先のディレクトリが空ではありません。',

  E5040: '差分パッケージの基底パッケージが一致しません。正しい基底パッケージを指定してください。',
  E5041: '差分パッケージのインポートには基底パッケージが必要ですが、見つかりませんでした。',

  E6010: '処理がユーザーによって中止されました。',
  E6011: '指定されたジョブが見つかりませんでした。既に完了している可能性があります。',
  E6012: 'ジョブは既に完了しています。',

  E6020: '中断時の一時ファイルが破損しています。最初からやり直してください。',
  E6021: '再開条件を満たしていません（バージョン違いなど）。新規実行をお願いします。',

  E8001: 'ファイルの整合性検証に失敗しました (SHA-256 不一致)。',

  E9001: '予期しないエラーが発生しました。',

  E9101: 'プロジェクトが1つも選択されていません。',
  E9102: '出力先を選択してください。',
  E9103: 'インポート先の展開先が未指定のプロジェクトがあります。',

  E9190: '画面の表示中にエラーが発生しました。開発者ツールのコンソールを確認してください。',
};
