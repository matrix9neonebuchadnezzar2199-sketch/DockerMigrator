/** 1 つの compose 設定ファイルの最大サイズ（バイト）。超過時は E2012。 */
export const MAX_COMPOSE_CONFIG_FILE_BYTES = 2 * 1024 * 1024;

/** `docker compose config` 相当の展開結果 JSON の想定上限（将来のガード用メモ） */
export const MAX_COMPOSE_CONFIG_EXPANDED_BYTES = 16 * 1024 * 1024;
