/**
 * Renderer 向けエラーコード別ユーザー文言（E コードキー）。
 * 未登録コードは ErrorBox が従来の汎用表示にフォールバックする。
 */

export type ErrorMessageEntry = {
  title: string;
  description: string;
  suggestion: string;
};

/** E コード（`DmigErrorPayload.code`）→ 表示文言 */
export const ERROR_MESSAGES: Record<string, ErrorMessageEntry> = {
  E2075: {
    title: 'パッケージの再開情報が破損しています',
    description:
      'partialState の検証に失敗しました。パッケージファイルが壊れているか、別のバージョンで作成された可能性があります。',
    suggestion: '元のパッケージを再度コピーして取り込み直してください。問題が続く場合は、エクスポートをやり直してください。',
  },
  E2071: {
    title: '完了済みパッケージを再開しようとしました',
    description: 'このパッケージは正常に完了しており、再開対象ではありません。',
    suggestion: '通常の Import 画面からこのパッケージを取り込んでください。',
  },
  E8001: {
    title: 'チェックサムが一致しません',
    description: 'パッケージ内のファイルが転送中に破損した可能性があります。',
    suggestion: '元のパッケージを再度コピーして取り込み直してください。',
  },
  E5002: {
    title: 'パッケージのバージョンが対応していません',
    description:
      'このパッケージは現在のアプリケーションでは取り込めないバージョンで作成されています。',
    suggestion:
      'パッケージを作成した側のアプリケーションを最新版に揃えてから再度書き出してください。',
  },
};

/**
 * 登録済みのユーザー向け文言を返す。未登録・code 未指定は null。
 */
export function lookupErrorMessage(code: string | undefined): ErrorMessageEntry | null {
  if (!code) {
    return null;
  }
  return ERROR_MESSAGES[code] ?? null;
}
