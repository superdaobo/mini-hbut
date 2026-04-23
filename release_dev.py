#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mini-HBUT 开发分支推送脚本（默认 dev）

用途：
1. 不改版本号
2. 不打 tag
3. 不创建 release
4. 仅提交（可选）并推送到目标分支（默认 dev）
5. 默认对 dev 进行强制推送（本地直推远端）
6. 无交互确认，自动提交并输出中文变更说明
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_URL = "https://github.com/superdaobo/mini-hbut.git"
PROJECT_DIR = Path(__file__).resolve().parent

EXCLUDE_GLOBS = [
    "debug_*.txt",
    "debug_*.log",
    "debug_*.json",
    "debug_*.html",
    ".dist-trash-*",
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

    executable = cmd[0]
    if not os.path.isabs(executable):
        # Windows 下 python subprocess 对 npm/git 等命令名的解析不稳定，先显式做 PATH 查找。
        candidates = [executable]
        if os.name == "nt" and "." not in Path(executable).name:
            candidates = [f"{executable}.cmd", f"{executable}.exe", f"{executable}.bat", executable]
        for name in candidates:
            resolved = shutil.which(name)
            if resolved:
                executable = resolved
                break
    actual_cmd = [executable] + cmd[1:]

    try:
        result = subprocess.run(
            actual_cmd,
            cwd=str(cwd or PROJECT_DIR),
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        err = f"命令不存在或未加入 PATH: {cmd[0]}"
        if check:
            raise RuntimeError(f"命令失败: {' '.join(cmd)}\n{err}")
        return False, "", err

    ok = result.returncode == 0
    out = (result.stdout or "").strip()
    err = (result.stderr or "").strip()

    if check and not ok:
        raise RuntimeError(f"命令失败: {' '.join(cmd)}\n{err or out}")
    return ok, out, err


def run_build_check(skip_build: bool, dry_run: bool) -> None:
    if skip_build:
        print("[INFO] 已跳过构建检查（--skip-build）")
        return
    print("[STEP] 构建检查（npm run build）")
    ok, out, err = run_command(["npm", "run", "build"], dry_run=dry_run, check=False)
    if not ok:
        preview = "\n".join((out or "").splitlines()[-20:] + (err or "").splitlines()[-20:])
        raise RuntimeError(f"构建失败（npm run build）\n{preview}".strip())
    print("[OK] 构建通过")


def collect_excluded_paths() -> list[str]:
    excluded: set[str] = set()
    for pattern in EXCLUDE_GLOBS:
        for path in PROJECT_DIR.rglob(pattern):
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


def map_status_to_reason(status: str) -> str:
    """将 git 变更状态映射为中文原因，便于提交前可读化输出。"""
    s = status.upper().strip()
    if s.startswith("A"):
        return "新增文件（新功能/新资源）"
    if s.startswith("M"):
        return "修改文件（功能优化/缺陷修复）"
    if s.startswith("D"):
        return "删除文件（清理无用内容）"
    if s.startswith("R"):
        return "重命名文件（结构整理）"
    if s.startswith("C"):
        return "复制文件（复用内容）"
    if s.startswith("T"):
        return "类型变更（文件属性调整）"
    if s.startswith("U"):
        return "未合并变更（需关注冲突来源）"
    return "其他变更"


def get_staged_change_report() -> list[dict[str, Any]]:
    """读取 staged 变更，输出每个文件的状态与行数统计。"""
    ok_status, out_status, _ = run_command(["git", "diff", "--cached", "--name-status"])
    ok_num, out_num, _ = run_command(["git", "diff", "--cached", "--numstat"])
    if not ok_status or not ok_num:
        return []

    status_map: dict[str, str] = {}
    for line in (out_status or "").splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        raw_status = parts[0].strip()
        # 重命名行格式：R100\told\tnew，展示新路径即可
        path = parts[-1].strip()
        status_map[path] = raw_status

    reports: list[dict[str, Any]] = []
    for line in (out_num or "").splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        add_s, del_s, path = parts[0].strip(), parts[1].strip(), parts[2].strip()
        # 二进制文件 numstat 为 "-"，这里按 1 处变更计，避免显示 0 处。
        add = int(add_s) if add_s.isdigit() else 0
        delete = int(del_s) if del_s.isdigit() else 0
        status = status_map.get(path, "M")
        changed = add + delete
        if changed == 0 and (add_s == "-" or del_s == "-"):
            changed = 1
        reports.append(
            {
                "path": path,
                "status": status,
                "reason": map_status_to_reason(status),
                "add": add,
                "delete": delete,
                "changed": changed,
            }
        )

    reports.sort(key=lambda x: x["path"])
    return reports


def print_staged_change_report(reports: list[dict[str, Any]]) -> None:
    if not reports:
        print("[INFO] 暂无可提交文件。")
        return

    total_files = len(reports)
    total_changed = sum(int(item["changed"]) for item in reports)
    print(f"[INFO] 本次共 {total_files} 个文件变更，累计修改 {total_changed} 处（按增删行统计）")
    for item in reports:
        print(
            f"  - {item['path']}: {item['reason']}，"
            f"修改 {item['changed']} 处（+{item['add']}/-{item['delete']}）"
        )


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

    report = get_staged_change_report()
    print_staged_change_report(report)

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
    parser.add_argument("--skip-build", action="store_true", help="跳过构建检查（默认会先执行 npm run build）")
    parser.add_argument("--force", action="store_true", help="强制推送（优先级高于 --no-force）")
    parser.add_argument("--no-force", action="store_true", help="禁用强制推送（即使目标分支是 dev）")
    parser.add_argument("--dry-run", action="store_true", help="仅打印命令")
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    args = parse_args()
    if not (PROJECT_DIR / ".git").exists():
        print(f"[ERROR] 不是 git 仓库: {PROJECT_DIR}")
        return 1

    if args.force and args.no_force:
        print("[ERROR] --force 与 --no-force 不能同时使用")
        return 1

    target_branch = args.branch.strip()
    target_is_dev = target_branch.lower() == "dev"
    effective_force = args.force or (target_is_dev and not args.no_force)

    message = args.message.strip() or f"chore: 开发分支自动提交 {datetime.now():%Y-%m-%d %H:%M:%S}"

    print("=" * 60)
    print("Mini-HBUT 开发分支推送脚本")
    print("=" * 60)
    print(f"project: {PROJECT_DIR}")
    print(f"remote : {args.remote} -> {args.remote_url}")
    print(f"branch : {target_branch}")
    print("mode   : no version bump / no tag / no release")
    print(f"build  : {'skip' if args.skip_build else 'npm run build'}")
    print(f"push   : {'force' if effective_force else 'normal'}")
    print("[INFO] 自动模式：不询问确认，直接执行提交与推送")

    try:
        run_build_check(args.skip_build, args.dry_run)
        ensure_origin(args.remote, args.remote_url, args.dry_run)
        stage_and_commit(message, args.skip_commit, args.dry_run)
        push(args.remote, target_branch, effective_force, args.dry_run)
    except Exception as exc:
        print(f"[ERROR] 推送失败: {exc}")
        return 1

    print("[OK] 推送完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
