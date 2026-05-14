import { promises as fsp } from 'node:fs';
import type { SecretScanResult, SecretFinding } from '@shared/types.js';
import { wrapError } from './errors/DmigError.js';
import { ErrorCodes } from './errors/codes.js';

/**
 * .env ファイル等を走査して機密情報を検出する。
 * 値そのものは結果に含めない（preview のみマスク済み）。
 */

interface SecretRule {
  name: string;
  keyPattern?: RegExp;
  valuePattern?: RegExp;
  severity: 'high' | 'medium' | 'low';
}

const RULES: SecretRule[] = [
  { name: 'aws-access-key-id', valuePattern: /^AKIA[0-9A-Z]{16}$/, severity: 'high' },
  { name: 'aws-secret-access-key', keyPattern: /AWS_SECRET_ACCESS_KEY/i, severity: 'high' },
  { name: 'stripe-live-key', valuePattern: /^sk_live_[a-zA-Z0-9]{16,}$/, severity: 'high' },
  {
    name: 'jwt-token',
    valuePattern: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    severity: 'high',
  },
  { name: 'github-pat', valuePattern: /^gh[ps]_[A-Za-z0-9]{36}$/, severity: 'high' },
  {
    name: 'private-key-block',
    valuePattern: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
    severity: 'high',
  },
  { name: 'password-like', keyPattern: /PASSWORD|PASSWD|PWD/i, severity: 'medium' },
  { name: 'secret-like', keyPattern: /SECRET/i, severity: 'medium' },
  { name: 'token-like', keyPattern: /TOKEN/i, severity: 'medium' },
  { name: 'api-key-like', keyPattern: /API[_-]?KEY/i, severity: 'medium' },
  { name: 'generic-key', keyPattern: /(^|_)KEY($|_)/i, severity: 'low' },
];

export class SecretScanner {
  /**
   * 単一ファイルをスキャン。.env 形式（KEY=VALUE）を前提とする。
   */
  async scanFile(filePath: string): Promise<SecretScanResult> {
    let content: string;
    try {
      content = await fsp.readFile(filePath, 'utf-8');
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === 'ENOENT') {
        return { filePath, findings: [] };
      }
      throw wrapError(e, ErrorCodes.ENV_FILE_READ_FAILED, `scanFile(${filePath})`);
    }

    const findings: SecretFinding[] = [];
    const lines = content.split(/\r?\n/);

    lines.forEach((rawLine, idx) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;

      const eqIdx = line.indexOf('=');
      if (eqIdx < 0) return;

      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!value) return;

      let best: SecretFinding | null = null;
      for (const rule of RULES) {
        const keyHit = rule.keyPattern ? rule.keyPattern.test(key) : false;
        const valueHit = rule.valuePattern ? rule.valuePattern.test(value) : false;
        if (keyHit || valueHit) {
          const candidate: SecretFinding = {
            line: idx + 1,
            key,
            preview: this.maskPreview(value),
            ruleName: rule.name,
            severity: rule.severity,
          };
          if (!best || this.severityRank(rule.severity) > this.severityRank(best.severity)) {
            best = candidate;
          }
        }
      }
      if (best) findings.push(best);
    });

    return { filePath, findings };
  }

  /**
   * 複数ファイルをまとめてスキャン。
   */
  async scanFiles(filePaths: string[]): Promise<SecretScanResult[]> {
    const results: SecretScanResult[] = [];
    for (const p of filePaths) {
      results.push(await this.scanFile(p));
    }
    return results;
  }

  private maskPreview(value: string): string {
    if (value.length <= 4) return '***';
    return `${value.slice(0, Math.min(5, Math.floor(value.length / 3)))}*****`;
  }

  private severityRank(s: 'high' | 'medium' | 'low'): number {
    if (s === 'high') return 3;
    if (s === 'medium') return 2;
    return 1;
  }

  /**
   * 検出されたキーの値を ***MASKED*** に置換した .env を書き出す。
   */
  async writeMaskedEnv(srcPath: string, destPath: string, findings: SecretFinding[]): Promise<void> {
    const maskKeys = new Set(findings.map((f) => f.key));
    let content: string;
    try {
      content = await fsp.readFile(srcPath, 'utf-8');
    } catch (e) {
      throw wrapError(e, ErrorCodes.ENV_FILE_READ_FAILED, `writeMaskedEnv/read(${srcPath})`);
    }

    const masked = content
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const eqIdx = line.indexOf('=');
        if (eqIdx < 0) return line;
        const key = line.slice(0, eqIdx).trim();
        if (maskKeys.has(key)) {
          return `${key}=***MASKED***`;
        }
        return line;
      })
      .join('\n');

    try {
      await fsp.writeFile(destPath, masked, 'utf-8');
    } catch (e) {
      throw wrapError(e, ErrorCodes.ENV_FILE_READ_FAILED, `writeMaskedEnv/write(${destPath})`);
    }
  }
}
