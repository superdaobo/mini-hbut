#!/usr/bin/env python3
"""
Push current project changes to dev branch to trigger CI builds.

Behavior:
1) Does NOT bump version.
2) Does NOT create git tag.
3) Does NOT create GitHub release.
4) Only commit (optional) and push to target branch (default: dev).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO_URL = "https://github.com/superdaobo/mini-hbut.git"
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR

EXCLUDE_GLOBS = [
    "debug_*",
]
EXCLUDE_DIRS = [
    "tools",
    "src-tauri/exports",
]


def run_command(
    cmd: list[str],
    cwd: Path | None = None,
    check: bool = True,
    capture: bool = True,
    dry_run: bool = False,
) -> tuple[bool, str, str]:
    if dry_run:
        print("[dry-run]", " ".join(cmd))
        return True, "", ""
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd or PROJECT_DIR),
            check=check,
            capture_output=capture,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        out = (result.stdout or "").strip()
        err = (result.stderr or "").strip()
        return True, out, err
    except subprocess.CalledProcessError as e:
        out = (e.stdout or "").strip()
        err = (e.stderr or "").strip()
        return False, out, err
    except Exception as e:  # noqa: BLE001
        return False, "", str(e)


def collect_excluded_paths() -> list[str]:
    excluded: set[str] = set()
    for pattern in EXCLUDE_GLOBS:
        for path in PROJECT_DIR.rglob(pattern):
            if path.is_file():
                excluded.add(path.relative_to(PROJECT_DIR).as_posix())
    for dirname in EXCLUDE_DIRS:
        dir_path = PROJECT_DIR / dirname
        if dir_path.exists():
            excluded.add(dir_path.relative_to(PROJECT_DIR).as_posix())
    return sorted(excluded)


def ensure_git_remote(remote: str, remote_url: str, dry_run: bool) -> bool:
    ok, current_remote, _ = run_command(
        ["git", "remote", "get-url", remote],
        check=False,
        dry_run=dry_run,
    )
    if ok and current_remote == remote_url:
        print(f"[ok] remote {remote}: {remote_url}")
        return True

    run_command(["git", "remote", "remove", remote], check=False, dry_run=dry_run)
    ok, _, err = run_command(["git", "remote", "add", remote, remote_url], dry_run=dry_run)
    if not ok:
        print(f"[error] failed to set remote {remote}: {err}")
        return False
    print(f"[ok] set remote {remote}: {remote_url}")
    return True


def has_staged_changes(dry_run: bool) -> bool:
    if dry_run:
        return True
    # Return code: 0 no diff, 1 has diff
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(PROJECT_DIR),
        check=False,
    )
    return result.returncode == 1


def stage_and_commit(message: str, skip_commit: bool, dry_run: bool) -> bool:
    if skip_commit:
        print("[info] skip commit enabled, will only push current HEAD")
        return True

    run_command(["git", "add", "-A"], dry_run=dry_run)
    excluded = collect_excluded_paths()
    if excluded:
        run_command(["git", "reset", "--"] + excluded, check=False, dry_run=dry_run)
        print("[info] staged changes with exclusions")
    else:
        print("[info] staged all changes")

    if not has_staged_changes(dry_run):
        print("[info] no staged changes, skip commit")
        return True

    ok, out, err = run_command(["git", "commit", "-m", message], check=False, dry_run=dry_run)
    if ok:
        print("[ok] commit created")
        if out:
            print(out)
        return True

    # Non-zero can happen when nothing to commit after reset.
    text = f"{out}\n{err}".strip()
    if "nothing to commit" in text.lower():
        print("[info] nothing to commit")
        return True

    print(f"[error] commit failed: {text}")
    return False


def push_to_branch(remote: str, branch: str, force: bool, dry_run: bool) -> bool:
    cmd = ["git", "push", "-u", remote, f"HEAD:{branch}"]
    if force:
        cmd.append("--force")
    ok, out, err = run_command(cmd, check=False, dry_run=dry_run)
    if ok:
        print(f"[ok] pushed to {remote}/{branch}")
        if out:
            print(out)
        return True
    print(f"[error] push failed: {err or out}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Commit and push current code to dev branch for CI build only."
    )
    parser.add_argument("--remote", default="origin", help="git remote name (default: origin)")
    parser.add_argument("--remote-url", default=REPO_URL, help="git remote URL")
    parser.add_argument("--branch", default="dev", help="target branch (default: dev)")
    parser.add_argument("--message", default="", help="commit message")
    parser.add_argument("--skip-commit", action="store_true", help="skip commit, only push HEAD")
    parser.add_argument("--force", action="store_true", help="force push to target branch")
    parser.add_argument("--dry-run", action="store_true", help="print commands without execution")
    parser.add_argument("--no-confirm", action="store_true", help="do not ask confirmation")
    args = parser.parse_args()

    if not (PROJECT_DIR / ".git").exists():
        print(f"[error] not a git repository: {PROJECT_DIR}")
        return 1

    message = args.message.strip() or f"ci: trigger {args.branch} build {datetime.now():%Y-%m-%d %H:%M:%S}"

    print("=" * 60)
    print("Mini-HBUT dev push script")
    print("=" * 60)
    print(f"project: {PROJECT_DIR}")
    print(f"remote : {args.remote} -> {args.remote_url}")
    print(f"branch : {args.branch}")
    print("mode   : build-only (no version bump / no tag / no release)")

    if not args.no_confirm:
        answer = input("Continue? [y/N]: ").strip().lower()
        if answer != "y":
            print("Cancelled.")
            return 0

    if not ensure_git_remote(args.remote, args.remote_url, args.dry_run):
        return 1

    if not stage_and_commit(message, args.skip_commit, args.dry_run):
        return 1

    if not push_to_branch(args.remote, args.branch, args.force, args.dry_run):
        return 1

    print("\n[done] push completed.")
    print("[tip] this script does not touch version/tag/release.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

