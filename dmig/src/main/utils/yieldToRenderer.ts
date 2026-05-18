/**
 * Main プロセスが Renderer へ IPC 進捗を送った直後に呼ぶ。
 * invoke ハンドラ内の連続処理でも UI がイベントを描画できるようイベントループへ譲る。
 */
export function yieldToRenderer(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
