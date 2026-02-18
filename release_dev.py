#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mini-HBUT 开发分支推送脚本（默认 dev）

用途：
1. 不改版本号
2. 不打 tag
3. 不创建 release
4. 仅提交（可选）并推送到目标分支（默认 dev）
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO_URL = "https://github.com/superdaobo/mini-hbut.git"
PROJECT_DIR = Path(__file__).resolve().parent

EXCLUDE_GLOBS = [
    "debug_*",
]
EXCLUDE_DIRS = [
    "tools",
    "src-tauri/exports",
]


def run_command(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    check: bool = False,
    dry_run: bool = False,
) -> tuple[bool, str, str]:
    if dry_run:
        print("[dry-run]", " ".join(cmd))
        return True, "", ""

    result = subprocess.run(
        cmd,
        cwd=str(cwd or PROJECT_DIR),
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    ok = result.returncode == 0
    out = (result.stdout or "").strip()
    err = (result.stderr or "").strip()

    if check and not ok:
        raise RuntimeError(f"命令失败: {' '.join(cmd)}\n{err or out}")
    return ok, out, err


def collect_excluded_paths() -> list[str]:
    excluded: set[str] = set()
    for pattern in EXCLUDE_GLOBS:
        for path in PROJECT_DIR.rglob(pattern):
            if path.is_file():
                excluded.add(path.relative_to(PROJECT_DIR).as_posix())
    for dirname in EXCLUDE_DIRS:
        p = PROJECT_DIR / dirname
        if p.exists():
            excluded.add(p.relative_to(PROJECT_DIR).as_posix())
    return sorted(excluded)


def ensure_origin(remote: str, remote_url: str, dry_run: bool) -> None:
    ok, out, _ = run_command(["git", "remote", "get-url", remote], dry_run=dry_run)
    if ok and out.strip() == remote_url:
        print(f"[OK] {remote} = {remote_url}")
        return

    run_command(["git", "remote", "remove", remote], dry_run=dry_run)
    ok, _, err = run_command(["git", "remote", "add", remote, remote_url], dry_run=dry_run)
    if not ok:
        raise RuntimeError(f"设置远端失败: {err}")
    print(f"[OK] 已设置 {remote} = {remote_url}")


def has_staged_changes() -> bool:
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(PROJECT_DIR),
        check=False,
    )
    return result.returncode == 1


def stage_and_commit(message: str, skip_commit: bool, dry_run: bool) -> None:
    if skip_commit:
        print("[INFO] 跳过提交，仅推送当前 HEAD")
        return

    run_command(["git", "add", "-A"], dry_run=dry_run, check=True)
    excluded = collect_excluded_paths()
    if excluded:
        run_command(["git", "reset", "--"] + excluded, dry_run=dry_run)
        print("[OK] 已暂存变更（已排除 tools / 导出目录）")
    else:
        print("[OK] 已暂存全部变更")

    if dry_run:
        print("[dry-run] 跳过 staged 变更检查")
        return

    if not has_staged_changes():
        print("[INFO] 没有可提交变更，跳过 commit")
        return

    ok, out, err = run_command(["git", "commit", "-m", message], dry_run=dry_run)
    if not ok:
        text = f"{out}\n{err}".lower()
        if "nothing to commit" in text:
            print("[INFO] nothing to commit")
            return
        raise RuntimeError(err or out)
    print(f"[OK] 已提交: {message}")


def push(remote: str, branch: str, force: bool, dry_run: bool) -> None:
    cmd = ["git", "push", "-u", remote, f"HEAD:{branch}"]
    if force:
        cmd.append("--force")
    ok, out, err = run_command(cmd, dry_run=dry_run)
    if not ok:
        raise RuntimeError(err or out)
    print(f"[OK] 已推送到 {remote}/{branch}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="开发分支快速推送脚本（默认 dev）")
    parser.add_argument("--remote", default="origin", help="远端名，默认 origin")
    parser.add_argument("--remote-url", default=REPO_URL, help="远端 URL")
    parser.add_argument("--branch", default="dev", help="目标分支，默认 dev")
    parser.add_argument("--message", default="", help="提交信息")
    parser.add_argument("--skip-commit", action="store_true", help="跳过提交，仅推送")
    parser.add_argument("--force", action="store_true", help="强制推送")
    parser.add_argument("--dry-run", action="store_true", help="仅打印命令")
    parser.add_argument("--no-confirm", action="store_true", help="跳过确认")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not (PROJECT_DIR / ".git").exists():
        print(f"[ERROR] 不是 git 仓库: {PROJECT_DIR}")
        return 1

    message = args.message.strip() or f"ci: trigger {args.branch} build {datetime.now():%Y-%m-%d %H:%M:%S}"

    print("=" * 60)
    print("Mini-HBUT 开发分支推送脚本")
    print("=" * 60)
    print(f"project: {PROJECT_DIR}")
    print(f"remote : {args.remote} -> {args.remote_url}")
    print(f"branch : {args.branch}")
    print("mode   : no version bump / no tag / no release")

    if not args.no_confirm:
        answer = input("确认继续？[y/N]: ").strip().lower()
        if answer != "y":
            print("已取消。")
            return 0

    try:
        ensure_origin(args.remote, args.remote_url, args.dry_run)
        stage_and_commit(message, args.skip_commit, args.dry_run)
        push(args.remote, args.branch, args.force, args.dry_run)
    except Exception as exc:
        print(f"[ERROR] 推送失败: {exc}")
        return 1

    print("[OK] 推送完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
