import pkg from '../../package.json';

/**
 * 実行中アプリのセマンティックバージョン（`dmig/package.json` の `version`）。
 * manifest の `source.appVersion` および UI 表示に使う。
 */
export const APP_VERSION: string = pkg.version;
