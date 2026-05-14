import type { Writable } from 'node:stream';

/**
 * tar の pack / extract を抽象化するインターフェース。
 *
 * 実装:
 *   - SystemTarBackend: ホストの tar コマンドを spawn
 *   - TarStreamBackend: tar-stream パッケージで純 Node 実装
 *
 * すべての pack 実装は、入力ディレクトリを巡回して tar 形式のバイト列を
 * 引数の Writable に書き込み、Promise の完了をもって終了を通知する。
 * extract 実装はその逆。
 *
 * AbortSignal: 全実装で対応必須。aborted 後は破棄してから reject する。
 */
export interface TarBackend {
  /** 識別用の名前（ログ用） */
  readonly name: 'system' | 'stream';

  /**
   * srcDir の中身を tar 形式で out に書き出す。
   * 完了したら out は end されない（下流の zstd 等が end を握る契約）。
   *
   * 注意: out への書き込みのみ責任を持つ。out の end / destroy は呼び出し側。
   */
  pack(srcDir: string, out: Writable, options?: TarOpOptions): Promise<void>;

  /**
   * tar 形式のバイト列を読んで destDir に展開する。
   */
  extract(input: NodeJS.ReadableStream, destDir: string, options?: TarOpOptions): Promise<void>;
}

export interface TarOpOptions {
  signal?: AbortSignal;
  /** 進捗バイト数の通知（500ms 間隔程度） */
  onBytes?: (bytes: number) => void;
}

/**
 * 実装の存在確認用。SystemTarBackend は tar コマンドが
 * 実際に動くかを probe する。
 */
export interface TarBackendProbe {
  probe(): Promise<boolean>;
}
