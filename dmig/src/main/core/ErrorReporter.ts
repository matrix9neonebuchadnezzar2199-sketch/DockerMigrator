import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { release as osRelease } from 'node:os';
import { app } from 'electron';
import JSZip from 'jszip';

import type { ErrorReportRequest, ErrorReportResult, DmigErrorPayload } from '@shared/types.js';
import { DmigError, wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';

/**
 * エラーレポート ZIP の生成。
 *
 * シークレットを含まないよう、process.env のフィルタリングをホワイトリストで行う。
 */
export class ErrorReporter {
  /** レポートに含めても安全と判断するキーのパターン */
  private static readonly SAFE_ENV_KEYS = [
    /^DMIG_/,
    /^NODE_VERSION$/,
    /^OS$/,
    /^PROCESSOR_ARCHITECTURE$/,
    /^NUMBER_OF_PROCESSORS$/,
    /^LANG$/,
    /^LC_/,
  ];

  async generate(req: ErrorReportRequest): Promise<ErrorReportResult> {
    try {
      await fsp.access(req.outputDir);
    } catch (e: unknown) {
      throw new DmigError(ErrorCodes.REPORT_OUTPUT_INVALID, {
        detail: `path=${req.outputDir}`,
        cause: e instanceof Error ? e : undefined,
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipName = `dmig-error-report-${timestamp}.zip`;
    const zipPath = join(req.outputDir, zipName);

    const zip = new JSZip();

    const report = this.buildReport(req.error, req.lastAction);
    zip.file('report.json', JSON.stringify(report, null, 2));

    zip.file('environment.txt', this.collectSafeEnv());

    if (req.userComment) {
      zip.file('user-comment.txt', req.userComment);
    }

    zip.file('logs.txt', '(将来のログ機能で実装予定)\n');

    zip.file(
      'README.txt',
      [
        'dmig エラーレポート',
        '',
        'このZIPには下記が含まれます:',
        '  - report.json:        エラー情報とシステム情報',
        '  - environment.txt:    実行環境の環境変数（機密情報は除外済み）',
        '  - logs.txt:           デバッグログ（プレースホルダ）',
        '  - user-comment.txt:   ユーザーが入力した補足コメント（あれば）',
        '',
        '機密情報（パスワード・トークン・秘密鍵）は意図的に除外しています。',
        '',
        `生成日時: ${new Date().toISOString()}`,
      ].join('\n'),
    );

    let buffer: Buffer;
    try {
      buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      await fsp.writeFile(zipPath, buffer);
    } catch (e: unknown) {
      throw wrapError(e, ErrorCodes.REPORT_WRITE_FAILED, 'ErrorReporter.generate');
    }

    return { zipPath, sizeBytes: buffer.length };
  }

  private buildReport(error: DmigErrorPayload, lastAction?: string) {
    const getSys = (process as NodeJS.Process & { getSystemVersion?: () => string }).getSystemVersion;
    const platformRelease = typeof getSys === 'function' ? getSys() : osRelease();

    return {
      generatedAt: new Date().toISOString(),
      dmigVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: {
        os: process.platform,
        arch: process.arch,
        release: platformRelease,
      },
      error: {
        code: error.code,
        message: error.message,
        detail: error.detail,
        phase: error.phase,
      },
      lastAction: lastAction ?? '(not provided)',
    };
  }

  /**
   * シークレットを含まない安全な環境変数のみを抜き出す。
   */
  private collectSafeEnv(): string {
    const lines: string[] = [];
    lines.push('# 安全と判断された環境変数のみ');
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined || value === '') continue;
      const isSafe = ErrorReporter.SAFE_ENV_KEYS.some((re) => re.test(key));
      if (isSafe) {
        lines.push(`${key}=${value}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }
}
