#!/usr/bin/env python3
"""dmig 動作点検ランナー（自動: npm パイプライン + Docker 確認、手動: チェックリスト表示）。

使い方（リポジトリルートから）:
  python scripts/run_smoke_check.py
  python scripts/run_smoke_check.py --win
  python scripts/run_smoke_check.py --skip-build --verbose
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DMIG_DIR = REPO_ROOT / "dmig"
CHECKLIST_MD = REPO_ROOT / "docs" / "testing" / "smoke-checklist.md"


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


def _print_manual_checklist() -> None:
    print("\n" + "=" * 60)
    print("手動スモーク（Electron UI）")
    print("=" * 60)
    if CHECKLIST_MD.is_file():
        print(f"正本: {CHECKLIST_MD.relative_to(REPO_ROOT)}")
        print()
        print(CHECKLIST_MD.read_text(encoding="utf-8"))
    else:
        print("チェックリストが見つかりません:", CHECKLIST_MD)
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
    parser.add_argument("-v", "--verbose", action="store_true", help="サブプロセス出力をそのまま表示")
    args = parser.parse_args(argv)

    if not DMIG_DIR.is_dir():
        print(f"error: dmig ディレクトリがありません: {DMIG_DIR}", file=sys.stderr)
        return 2

    version = _read_package_version()
    print(f"dmig smoke check - version {version}")
    print(f"repo: {REPO_ROOT}")

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
    return code


if __name__ == "__main__":
    raise SystemExit(main())
