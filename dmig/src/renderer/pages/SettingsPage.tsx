import React, { useEffect, useState } from 'react';
import type { DmigSettings } from '../../shared/settings.js';
export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<DmigSettings | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void window.dmig.getSettings().then((r) => {
      setLoading(false);
      if (r.ok) setSettings(r.data);
    });
  }, []);

  const persist = async (patch: Partial<DmigSettings>) => {
    setSaveError(null);
    const r = await window.dmig.updateSettings(patch);
    if (r.ok) {
      setSettings(r.data);
      setSaved('設定を保存しました。');
      window.setTimeout(() => setSaved(null), 2500);
    } else {
      setSaveError(`設定の保存に失敗しました: ${r.error.code}`);
      window.setTimeout(() => setSaveError(null), 4000);
    }
  };

  const pickDefaultDir = async () => {
    const r = await window.dmig.selectDirectory({ title: '既定の出力先フォルダ' });
    if (r.ok && r.data) {
      await persist({ defaultExportDir: r.data });
    }
  };

  if (loading || !settings) {
    return (
      <div className="page-shell">
        <p>設定を読み込んでいます…</p>
      </div>
    );
  }

  return (
    <div className="page-shell settings-page">
      <h2>設定</h2>
      <p className="page-lead">アプリの動作に関する設定です。テーマや言語は今後の更新で追加予定です（判断 D-003）。</p>

      <section className="settings-section">
        <h3>起動時のページ</h3>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.restoreLastPage}
            onChange={(e) => void persist({ restoreLastPage: e.target.checked })}
          />
          前回終了時のページを復元する（オフのときは移行元の概要を表示）
        </label>
        {settings.restoreLastPage && settings.lastPage ? (
          <p className="settings-hint">
            復元対象: <code>{settings.lastPage}</code>
          </p>
        ) : null}
      </section>

      <section className="settings-section">
        <h3>既定の出力先</h3>
        <p className="settings-hint">エクスポート画面の初期値に使います（各ページで上書き可能）。</p>
        <p className="settings-path">{settings.defaultExportDir || '（未設定）'}</p>
        <button type="button" className="btn-secondary" onClick={() => void pickDefaultDir()}>
          フォルダを選ぶ
        </button>
      </section>

      {saved ? <p className="settings-saved">{saved}</p> : null}
      {saveError ? (
        <p className="settings-error" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
};
