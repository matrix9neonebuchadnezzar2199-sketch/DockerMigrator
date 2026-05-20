#!/usr/bin/env python3
"""dmig 動作点検ランナー（自動: npm パイプライン + Docker 確認、手動: チェックリスト表示）。

使い方（リポジトリルートから）:
  python scripts/run_smoke_check.py
  python scripts/run_smoke_check.py --win
  python scripts/run_smoke_check.py --skip-build --verbose
  python scripts/run_smoke_check.py --m10-smoke
  python scripts/run_smoke_check.py --m10-static-check
  python scripts/run_smoke_check.py --scan-rollback-json F:\\Docker_out
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DMIG_DIR = REPO_ROOT / "dmig"
CHECKLIST_HTML = REPO_ROOT / "docs" / "testing" / "smoke-checklist.html"
M10_SMOKE_HTML = REPO_ROOT / "docs" / "testing" / "m10-rollback-smoke-checklist.html"
TESTING_INDEX_HTML = REPO_ROOT / "docs" / "testing" / "index.html"

# M10 手動 smoke: 報告行とシナリオ ID の対応（コンソール出力用）
M10_REPORT_LINES: list[tuple[str, str, str]] = [
    ("S1", "[移行先] パックを読み込む → 取り込み → ロールバック", "必須"),
    ("S2", "[移行先相当] プロジェクトを選ぶ［取り込む］→ ロールバック", "必須（directory_not_empty）"),
    ("S3", "再ロールバック（already_executed）", "必須"),
    ("S4", "旧 .dmig（rollback.json なし）", "任意（旧パックがあれば）"),
    ("S5", "書き出し → rollback.json / ロールバック", "必須"),
    ("S6", "直近の操作を取り消す（インライン）", "必須"),
    ("S7", "directory 手動削除の運用", "任意"),
]

# --m10-static-check: core / IPC の両方を grep（ipc 単体の誤検知を避ける）
M10_STATIC_TARGETS: list[tuple[str, tuple[str, ...], str]] = [
    (
        "dmig/src/main/core/Exporter.ts",
        ("rollbackManager.saveRecord", "createRollbackRecord"),
        "Image Export 正常完了時に rollback.json を save",
    ),
    (
        "dmig/src/main/core/Exporter.ts",
        ("resumeImagePack", "rollbackManager.saveRecord"),
        "Image Resume Export 完了時にも rollback.json を save",
    ),
    (
        "dmig/src/main/core/ComposeExporter.ts",
        ("resumeComposePack", "rollbackManager.saveRecord"),
        "Compose Resume Export 完了時にも rollback.json を save",
    ),
    (
        "dmig/src/main/ipc/compose.ts",
        ("rollbackManager.saveRecord", "createRollbackRecord"),
        "Compose Export IPC が rollback.json を save",
    ),
    (
        "dmig/src/main/core/Importer.ts",
        (".saveRecord", "createRollbackRecord"),
        "Image Import 正常完了時に rollback.json を save",
    ),
    (
        "dmig/src/main/core/ComposeImporter.ts",
        (".saveRecord", "createRollbackRecord"),
        "Compose Import 正常完了時に rollback.json を save",
    ),
]


@dataclass(frozen=True)
class StepResult:
    """1 つの点検ステップの結果。"""

    name: str
    ok: bool
    detail: str = ""


def _npm_cmd() -> list[str]:
    npm = shutil.which("npm")
    if not npm:
        raise FileNotFoundError("npm が PATH にありません。Node.js 22+ をインストールしてください。")
    return [npm]


def _run(
    name: str,
    args: list[str],
    *,
    cwd: Path,
    verbose: bool,
) -> StepResult:
    """サブプロセスを実行し、終了コードで成否を判定する。"""
    display = " ".join(args)
    if verbose:
        print(f"\n--- {name}: {display} (cwd={cwd}) ---\n", flush=True)

    try:
        completed = subprocess.run(
            args,
            cwd=cwd,
            capture_output=not verbose,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError as exc:
        return StepResult(name, False, f"起動失敗: {exc}")

    if verbose:
        return StepResult(name, completed.returncode == 0, f"exit {completed.returncode}")

    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    if completed.returncode != 0:
        tail = (stderr + stdout).strip().splitlines()
        snippet = "\n".join(tail[-12:]) if tail else f"exit {completed.returncode}"
        return StepResult(name, False, snippet)

    detail = _summarize_output(name, stdout + stderr)
    return StepResult(name, True, detail)


def _summarize_output(step_name: str, combined: str) -> str:
    """ログから短い要約行を拾う（vitest など）。"""
    if step_name == "test":
        for line in reversed(combined.splitlines()):
            if "Tests " in line and "passed" in line:
                return line.strip()
    if step_name == "docker":
        for line in combined.splitlines():
            if "Server:" in line or line.strip().startswith("Version:"):
                return line.strip()
    last = [ln for ln in combined.splitlines() if ln.strip()]
    return last[-1].strip() if last else "ok"


def _read_package_version() -> str:
    pkg = DMIG_DIR / "package.json"
    text = pkg.read_text(encoding="utf-8")
    match = re.search(r'"version"\s*:\s*"([^"]+)"', text)
    return match.group(1) if match else "unknown"


def _print_m10_smoke_report() -> None:
    """M10 ロールバック smoke: 報告シートを先に出し、シナリオと 1 対 1 で対応づける。"""
    width = 64
    print("\n" + "=" * width)
    print("  M10 ロールバック手動 smoke — 報告シート")
    print("=" * width)
    print()
    print("実施後、以下をコピーして結果を記入（OK / NG / スキップ / 所感）:")
    print()
    print("【M10 ロールバック smoke 結果】")
    print("前提: dev 再起動済み / Docker 稼働 / main >= 2a1efa4")
    print()
    for sid, title, _req in M10_REPORT_LINES:
        pad = " " * max(1, 34 - len(title))
        print(f"  {sid}  {title}{pad}: ")
    print()
    print("所要時間: ___ 分")
    print("気付いた点:")
    print("  - rollback.json（パックパス）:")
    print("  - Main ターミナルエラー:")
    print("  - UX 違和感:")
    print()
    print("-" * width)
    print("  実施前チェック")
    print("-" * width)
    for label in (
        "git pull 済み（2a1efa4 以降の fix 込み）",
        "npm run dev を停止して Main ごと再起動",
        "Docker Desktop 稼働",
        "作業用出力先を用意（例 F:\\Docker_out）",
    ):
        print(f"  [ ] {label}")
    print()
    print("-" * width)
    print("  シナリオ一覧（詳細手順は正本 HTML）")
    print("-" * width)
    print(f"  {'ID':<4} {'区分':<6} シナリオ")
    print(f"  {'--':<4} {'----':<6} {'-' * 40}")
    for sid, title, req in M10_REPORT_LINES:
        print(f"  {sid:<4} {req:<6} {title}")
    print()
    rel = M10_SMOKE_HTML.relative_to(REPO_ROOT)
    print(f"  正本（手順・合格条件・DevTools）: {rel}")
    print("  ブラウザで開く: file:///" + str(M10_SMOKE_HTML.resolve()).replace("\\", "/"))
    print("  開発起動: cd dmig && npm run dev")
    print("=" * width)


def _print_manual_checklist() -> None:
    print("\n" + "=" * 60)
    print("手動スモーク（Electron UI）")
    print("=" * 60)
    if CHECKLIST_HTML.is_file():
        rel = CHECKLIST_HTML.relative_to(REPO_ROOT)
        print(f"正本: {rel}")
        print(f"一覧: {TESTING_INDEX_HTML.relative_to(REPO_ROOT)}")
        print()
        print("手順は HTML 正本をブラウザで開いて確認してください。")
        print("file:///" + str(CHECKLIST_HTML.resolve()).replace("\\", "/"))
        if M10_SMOKE_HTML.is_file():
            print("M10: file:///" + str(M10_SMOKE_HTML.resolve()).replace("\\", "/"))
    else:
        print("チェックリストが見つかりません:", CHECKLIST_HTML)
    print("\n開発起動: cd dmig && npm run dev")
    print("=" * 60)


def _print_summary(results: list[StepResult]) -> int:
    print("\n" + "=" * 60)
    print("自動点検サマリ")
    print("=" * 60)
    failed = 0
    for r in results:
        mark = "OK" if r.ok else "NG"
        print(f"  [{mark}] {r.name}")
        if r.detail:
            for line in r.detail.splitlines():
                print(f"        {line}")
        if not r.ok:
            failed += 1
    print("=" * 60)
    if failed:
        print(f"自動点検: {failed} 件失敗")
        return 1
    print("自動点検: すべて成功（手動項目は上記チェックリスト）")
    return 0


def _static_check_m10() -> int:
    """各経路に rollback.json save 呼び出しがあるか静的に検査する。"""
    width = 64
    print("\n" + "=" * width)
    print("  M10 静的チェック — rollback.json save 呼び出しの存在")
    print("=" * width)

    failed = 0
    skipped = 0
    for rel_path, required_symbols, description in M10_STATIC_TARGETS:
        target = REPO_ROOT / rel_path
        if not target.is_file():
            print(f"  [SKIP] {rel_path}: ファイルなし")
            skipped += 1
            continue
        try:
            text = target.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"  [NG]   {rel_path}: 読み込み失敗: {exc}")
            failed += 1
            continue

        missing = [sym for sym in required_symbols if sym not in text]
        if missing:
            print(f"  [NG]   {rel_path}")
            print(f"         期待: {description}")
            print(f"         欠落: {', '.join(missing)}")
            failed += 1
        else:
            print(f"  [OK]   {rel_path}  ({description})")

    print("=" * width)
    if failed:
        print(f"M10 静的チェック: {failed} 件失敗 / {skipped} 件スキップ")
        return 1
    print(f"M10 静的チェック: すべて成功（{skipped} 件スキップ）")
    return 0


def _scan_rollback_json(root: Path) -> int:
    """指定ディレクトリ配下の .dmig パックの rollback.json 有無を一覧表示する。"""
    width = 72
    print("\n" + "=" * width)
    print(f"  rollback.json スキャン: {root}")
    print("=" * width)

    if not root.is_dir():
        print(f"  error: ディレクトリがありません: {root}")
        return 2

    found = 0
    missing = 0
    print(f"  {'rollback.json':<15} {'kind':<10} {'entries':<8} pack")
    print(f"  {'-' * 15} {'-' * 10} {'-' * 8} {'-' * 40}")
    for child in sorted(root.iterdir()):
        if not child.is_dir() or not child.name.endswith(".dmig"):
            continue
        rb = child / "rollback.json"
        if not rb.is_file():
            print(f"  {'NONE':<15} {'-':<10} {'-':<8} {child.name}")
            missing += 1
            continue
        try:
            data = json.loads(rb.read_text(encoding="utf-8"))
            kind = data.get("kind", "?")
            entries = len(data.get("entries", []))
            print(f"  {'OK':<15} {kind!s:<10} {entries:<8} {child.name}")
            found += 1
        except (OSError, json.JSONDecodeError, TypeError) as exc:
            print(f"  {'INVALID':<15} {'?':<10} {'?':<8} {child.name}  ({exc})")
            missing += 1

    print("=" * width)
    print(f"  検出: {found} 件 / 欠落・不正: {missing} 件")
    return 0 if missing == 0 else 1


def _configure_stdio() -> None:
    """Windows コンソール (cp932) でもサブプロセスログを落とさない。"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                pass


def main(argv: list[str] | None = None) -> int:
    _configure_stdio()
    parser = argparse.ArgumentParser(description="dmig 動作点検（自動 + 手動チェックリスト表示）")
    parser.add_argument("--skip-build", action="store_true", help="npm run build をスキップ")
    parser.add_argument("--skip-lint", action="store_true", help="npm run lint をスキップ")
    parser.add_argument("--no-docker", action="store_true", help="Docker 稼働確認をスキップ")
    parser.add_argument("--win", action="store_true", help="npm run build:win を追加実行（時間がかかる）")
    parser.add_argument(
        "--manual-only",
        action="store_true",
        help="自動点検を行わず手動チェックリストのみ表示",
    )
    parser.add_argument(
        "--m10-smoke",
        action="store_true",
        help="M10 ロールバック手動 smoke の報告シートとシナリオ一覧のみ表示",
    )
    parser.add_argument(
        "--m10-static-check",
        action="store_true",
        help="rollback.json save 呼び出しが core/IPC 各経路に存在するか静的に検査",
    )
    parser.add_argument(
        "--scan-rollback-json",
        metavar="DIR",
        help="指定ディレクトリ配下の .dmig パックを走査し rollback.json 有無を一覧表示",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="サブプロセス出力をそのまま表示")
    args = parser.parse_args(argv)

    if not DMIG_DIR.is_dir():
        print(f"error: dmig ディレクトリがありません: {DMIG_DIR}", file=sys.stderr)
        return 2

    version = _read_package_version()
    print(f"dmig smoke check - version {version}")
    print(f"repo: {REPO_ROOT}")

    if args.m10_smoke:
        _print_m10_smoke_report()
        return 0

    if args.m10_static_check:
        return _static_check_m10()

    if args.scan_rollback_json:
        return _scan_rollback_json(Path(args.scan_rollback_json).resolve())

    if args.manual_only:
        _print_manual_checklist()
        return 0

    try:
        npm = _npm_cmd()
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    results: list[StepResult] = []

    for script in ("typecheck", "lint" if not args.skip_lint else None, "test"):
        if script is None:
            continue
        results.append(_run(script, [*npm, "run", script], cwd=DMIG_DIR, verbose=args.verbose))

    if not args.skip_build:
        results.append(_run("build", [*npm, "run", "build"], cwd=DMIG_DIR, verbose=args.verbose))

    if args.win:
        results.append(
            _run("build:win", [*npm, "run", "build:win"], cwd=DMIG_DIR, verbose=args.verbose)
        )

    if not args.no_docker:
        docker = shutil.which("docker")
        if docker:
            results.append(
                _run(
                    "docker",
                    [docker, "version", "--format", "Server: {{.Server.Version}}"],
                    cwd=REPO_ROOT,
                    verbose=args.verbose,
                )
            )
        else:
            results.append(StepResult("docker", False, "docker コマンドが PATH にありません"))

    code = _print_summary(results)
    _print_manual_checklist()
    print()
    print("M10 ロールバック手動 smoke の報告テンプレ: python scripts/run_smoke_check.py --m10-smoke")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
