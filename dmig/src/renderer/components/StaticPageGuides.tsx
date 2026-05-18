import React from 'react';

/** イメージ単体エクスポートページの解説（右上パネル用） */
export function ExportPageGuideBody(): React.ReactElement {
  return (
    <>
      <p>
        <strong>📤 このページでできること</strong>
        <br />
        ローカル Docker のイメージを USB 等に <code>.dmig</code> パッケージとして書き出します。
      </p>

      <h3>🪜 操作の流れ</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th className="guide-icon-cell">#</th>
            <th>手順</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="guide-icon-cell">1️⃣</td>
            <td>出力先</td>
            <td>USB のドライブレター（例: <code>E:\</code>）など、書き込み可能なパスを指定</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">2️⃣</td>
            <td>イメージ選択</td>
            <td>チェックを付けたタグ付きイメージだけがパックに含まれます</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">3️⃣</td>
            <td>エクスポート開始</td>
            <td>圧縮・ハッシュ計算・<code>manifest.json</code> 生成まで一括実行</td>
          </tr>
        </tbody>
      </table>

      <h3>⚡ 一覧の見方</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th className="guide-icon-cell">列</th>
            <th>意味</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="guide-icon-cell">☑</td>
            <td>パックに含めるかどうか</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">🏷️</td>
            <td>
              <code>repository:tag</code> 形式のイメージ名
            </td>
          </tr>
          <tr>
            <td className="guide-icon-cell">📊</td>
            <td>ホスト上のイメージサイズ（圧縮前の目安）</td>
          </tr>
        </tbody>
      </table>

      <div className="guide-note">
        ⚠️ 実際の転送時間は USB の速度・同時 I/O・イメージのレイヤ数に強く依存します。Compose
        まるごと移行は <strong>Compose</strong> ページを利用してください。
      </div>
    </>
  );
}

/** イメージ単体インポートページの解説 */
export function ImportPageGuideBody(): React.ReactElement {
  return (
    <>
      <p>
        <strong>📥 このページでできること</strong>
        <br />
        既存の <code>.dmig</code> パッケージからイメージを Docker に読み込みます。
      </p>

      <h3>🪜 操作の流れ</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th className="guide-icon-cell">#</th>
            <th>手順</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="guide-icon-cell">1️⃣</td>
            <td>パス入力</td>
            <td>
              パッケージの<strong>ディレクトリ</strong>（<code>manifest.json</code> があるフォルダ）を指定
            </td>
          </tr>
          <tr>
            <td className="guide-icon-cell">2️⃣</td>
            <td>読み込み</td>
            <td>
              <code>manifest.json</code> を検証し、含まれるイメージ一覧を表示
            </td>
          </tr>
          <tr>
            <td className="guide-icon-cell">3️⃣</td>
            <td>選択して取込</td>
            <td>必要なイメージだけチェックを残してインポート開始</td>
          </tr>
        </tbody>
      </table>

      <h3>📁 パス例</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th>種類</th>
            <th>例</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Windows</td>
            <td>
              <code>E:\backup\dmig-2026-01-01.dmig</code>
            </td>
          </tr>
          <tr>
            <td>Linux</td>
            <td>
              <code>/media/usb/mypack.dmig</code>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="guide-note">
        💡 Compose プロジェクト同梱のパックは <strong>Compose</strong> ページの「インポート」タブから復元します。
      </div>
    </>
  );
}

/** Compose エクスポートタブの解説 */
export function ComposeExportGuideBody(): React.ReactElement {
  return (
    <>
      <p>
        <strong>🐳 このタブでできること</strong>
        <br />
        検出された Compose プロジェクトを <code>.dmig</code> にまとめ、イメージ・ボリューム・設定を USB 等へ書き出します。
      </p>

      <h3>🪜 エクスポートの流れ</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th className="guide-icon-cell">#</th>
            <th>段階</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="guide-icon-cell">1️⃣</td>
            <td>出力先・選択</td>
            <td>USB パスを指定し、カードのチェックで対象プロジェクトを決定</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">2️⃣</td>
            <td>差分（任意）</td>
            <td>スナップショットと比較し、変更のあるプロジェクトだけに絞れます</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">3️⃣</td>
            <td>bind / 秘密情報</td>
            <td>必要に応じてダイアログで方針を確定してから書き出し開始</td>
          </tr>
        </tbody>
      </table>

      <h3>🛠️ 熟練者向けワンクリック</h3>
      <p style={{ marginBottom: 6 }}>
        ホストの <code>docker compose</code> を working_dir 付きで呼び出します。pull はネットワークとディスクを消費します。
      </p>
      <table className="guide-table">
        <thead>
          <tr>
            <th className="guide-icon-cell"> </th>
            <th>ボタン</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="guide-icon-cell">🎯</td>
            <td>稼働中のみ選択</td>
            <td>RUNNING コンテナがあるプロジェクトだけチェックを付け、他は外します</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">⏹</td>
            <td>選択をすべて停止</td>
            <td>各プロジェクトに <code>docker compose stop</code>。コンテナは残ります</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">⬇</td>
            <td>選択のイメージ取得</td>
            <td>
              <code>docker compose pull</code>。digest 未固定だと取得後の挙動が変わることがあります
            </td>
          </tr>
          <tr>
            <td className="guide-icon-cell">🧹</td>
            <td>dangling 整理</td>
            <td>確認後に <code>docker image prune -f</code>。タグ無し dangling のみ</td>
          </tr>
        </tbody>
      </table>

      <h3>📦 カード内の数字とボタン</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th className="guide-icon-cell">表示</th>
            <th>意味</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="guide-icon-cell">📦</td>
            <td>
              参照イメージ・named volume・build コンテキスト・bind 先を走査した <strong>圧縮目安</strong>（実サイズは前後します）
            </td>
          </tr>
          <tr>
            <td className="guide-icon-cell">⏹</td>
            <td>そのプロジェクトだけ compose stop</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">⬇</td>
            <td>そのプロジェクトだけ compose pull</td>
          </tr>
        </tbody>
      </table>

      <h3>📊 合計容量・予想時間</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th>項目</th>
            <th>説明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>合計移動容量</td>
            <td>
              事前検証（preflight）が通っているときはその合計バイトを優先表示。未検証時はカード推定の合算
            </td>
          </tr>
          <tr>
            <td>予想転送時間</td>
            <td>USB シーケンシャル書き込みを控えめに見積もった目安（USB2 や小ファイル多めの bind では遅くなりがち）</td>
          </tr>
        </tbody>
      </table>

      <div className="guide-note">
        ℹ️ プロジェクト一覧は <code>com.docker.compose.project</code> ラベル付きコンテナから検出します。一度も{' '}
        <code>compose up</code> していないプロジェクトは出ません。
      </div>
    </>
  );
}

/** Compose インポートタブの解説 */
export function ComposeImportGuideBody(): React.ReactElement {
  return (
    <>
      <p>
        <strong>📥 このタブでできること</strong>
        <br />
        書き出した <code>.dmig</code> を別マシンで展開し、選択した Compose プロジェクトを復元します。
      </p>

      <h3>🪜 インポートの流れ</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th className="guide-icon-cell">#</th>
            <th>手順</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="guide-icon-cell">1️⃣</td>
            <td>パッケージ指定</td>
            <td>
              <code>manifest.json</code> がある <code>.dmig</code> ディレクトリを選ぶ
            </td>
          </tr>
          <tr>
            <td className="guide-icon-cell">2️⃣</td>
            <td>プロジェクト選択</td>
            <td>取り込む Compose 名にチェックを付ける</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">3️⃣</td>
            <td>展開先</td>
            <td>各プロジェクトごとにホスト上のディレクトリを指定（📂 から選択可）</td>
          </tr>
          <tr>
            <td className="guide-icon-cell">4️⃣</td>
            <td>インポート開始</td>
            <td>イメージ load・ボリューム展開・compose ファイル配置を順に実行</td>
          </tr>
        </tbody>
      </table>

      <h3>🗂️ 一覧の見方</h3>
      <table className="guide-table">
        <thead>
          <tr>
            <th>列・表示</th>
            <th>意味</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>services / volumes</td>
            <td>パックに含まれるサービス数・ボリューム数の目安</td>
          </tr>
          <tr>
            <td>.env</td>
            <td>マスク済みの場合は <code>(masked)</code> と表示されます</td>
          </tr>
          <tr>
            <td>展開先</td>
            <td>
              緑: 指定済み / 黄: <strong>未指定</strong>（このままではインポート不可）
            </td>
          </tr>
        </tbody>
      </table>

      <div className="guide-note">
        ⏹ 実行中は「中止」でジョブをキャンセルできます（<code>jobToken</code> 単位）。
      </div>
    </>
  );
}
