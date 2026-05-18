/** 中断理由の UI ラベル（Step A: ハードコード辞書） */
export const interruptionReasonLabel: Record<string, string> = {
  'user-cancel': 'ユーザー操作で中止',
  error: 'エラーで中断',
  crash: '異常終了で中断',
};

export function labelInterruptionReason(reason: string | undefined): string {
  if (!reason) return '不明';
  return interruptionReasonLabel[reason] ?? reason;
}

/** 走査 warnings の日本語訳 */
export function warningLabel(w: string): string {
  if (w === 'truncated_at_50') {
    return '50件で打ち切りました。サブフォルダを絞って再検索してください。';
  }
  if (w === 'root_not_found') return '指定フォルダが見つかりませんでした。';
  if (w.startsWith('permission_denied:')) {
    return `読み取り権限がありません: ${w.slice('permission_denied:'.length)}`;
  }
  return w;
}
