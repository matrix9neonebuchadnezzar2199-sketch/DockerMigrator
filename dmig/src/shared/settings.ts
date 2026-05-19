/** 永続化するユーザー設定（Step B 撤回後の新規設計）。 */
export type DmigSettings = {
  /** エクスポート等の既定出力先（空なら各ページのローカル state） */
  defaultExportDir?: string;
  /** true のとき次回起動で lastPage を復元 */
  restoreLastPage: boolean;
  /** 復元対象 PageKey（文字列。Renderer で検証） */
  lastPage?: string;
};

export const DEFAULT_DMIG_SETTINGS: DmigSettings = {
  restoreLastPage: false,
};
