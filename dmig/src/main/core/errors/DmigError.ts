import type { ErrorCode } from './codes.js';
import { ErrorMessages } from './codes.js';

/**
 * dmig 全モジュール共通の例外クラス。
 * code (E1001等) と日本語メッセージを必ず保持する。
 */
export class DmigError extends Error {
  public readonly code: ErrorCode;
  public readonly detail?: string;
  public readonly phase?: string;

  constructor(code: ErrorCode, options?: { detail?: string; phase?: string; cause?: unknown }) {
    const msg = `[${code}] ${ErrorMessages[code]}`;
    const cause = options?.cause instanceof Error ? options.cause : undefined;
    super(msg, cause ? { cause } : undefined);
    this.name = 'DmigError';
    this.code = code;
    this.detail = options?.detail;
    this.phase = options?.phase;
  }

  toPayload() {
    return {
      code: this.code,
      message: ErrorMessages[this.code],
      detail: this.detail,
      phase: this.phase,
    };
  }
}

export function wrapError(e: unknown, fallbackCode: ErrorCode, phase?: string): DmigError {
  if (e instanceof DmigError) return e;
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return new DmigError(fallbackCode, {
    detail,
    phase,
    cause: e instanceof Error ? e : undefined,
  });
}
