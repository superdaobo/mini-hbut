#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mini-HBUT 发布脚本（主分支模式）

目标：
1. 更新版本号（package.json / tauri.conf.json / Cargo.toml）
2. 提交代码、重建 tag、推送到 origin/main
3. 在推送前将当前远端 main 归档到 old（可关闭）
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
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

TRANSIENT_PATTERNS = [
    r"\b502\b",
    r"\b500\b",
    r"internal server error",
    r"timed out",
    r"connection reset",
    r"connection aborted",
    r"tls handshake timeout",
    r"could not resolve host",
    r"http2 stream",
]


def run_command(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    check: bool = False,
) -> tuple[bool, str, str]:
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


def should_retry(stdout: str, stderr: str) -> bool:
    text = f"{stdout}\n{stderr}".lower()
    return any(re.search(pattern, text) for pattern in TRANSIENT_PATTERNS)


def run_with_retry(
    cmd: list[str],
    *,
    retries: int = 4,
    first_delay: float = 2.0,
) -> tuple[bool, str, str]:
    delay = first_delay
    last_out = ""
    last_err = ""
    for i in range(1, retries + 1):
        ok, out, err = run_command(cmd, check=False)
        last_out, last_err = out, err
        if ok:
            return True, out, err
        if i < retries and should_retry(out, err):
            print(f"  [WARN] 命令失败，第{i}/{retries}次，{delay:.0f}s后重试: {' '.join(cmd)}")
            time.sleep(delay)
            delay *= 1.8
            continue
        return False, out, err
    return False, last_out, last_err


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: dict) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def parse_version(version: str) -> tuple[int, int, int]:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", version.strip())
    if not m:
        raise ValueError(f"非法版本号: {version}")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def bump_version(current: str, bump: str) -> str:
    major, minor, patch = parse_version(current)
    if bump == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump == "minor":
        minor += 1
        patch = 0
    else:
        patch += 1
    return f"{major}.{minor}.{patch}"


def get_current_version() -> str:
    package_json = PROJECT_DIR / "package.json"
    data = read_json(package_json)
    return str(data.get("version", "1.0.0"))


def update_version_files(new_version: str) -> None:
    print(f"\n[STEP] 更新版本号到 {new_version}")

    package_json = PROJECT_DIR / "package.json"
    package_data = read_json(package_json)
    package_data["version"] = new_version
    write_json(package_json, package_data)
    print("  [OK] package.json")

    tauri_conf = PROJECT_DIR / "src-tauri" / "tauri.conf.json"
    tauri_data = read_json(tauri_conf)
    tauri_data["version"] = new_version
    write_json(tauri_conf, tauri_data)
    print("  [OK] src-tauri/tauri.conf.json")

    cargo_toml = PROJECT_DIR / "src-tauri" / "Cargo.toml"
    cargo_text = read_text(cargo_toml)
    cargo_text = re.sub(
        r'^version\s*=\s*"[^"]+"',
        f'version = "{new_version}"',
        cargo_text,
        count=1,
        flags=re.MULTILINE,
    )
    write_text(cargo_toml, cargo_text)
    print("  [OK] src-tauri/Cargo.toml")


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


def ensure_origin_remote() -> None:
    ok, out, _ = run_command(["git", "remote", "get-url", "origin"])
    if ok and out.strip() == REPO_URL:
        print(f"  [OK] origin = {REPO_URL}")
        return

    run_command(["git", "remote", "remove", "origin"])
    ok, _, err = run_command(["git", "remote", "add", "origin", REPO_URL])
    if not ok:
        raise RuntimeError(f"配置 origin 失败: {err}")
    print(f"  [OK] 设置 origin = {REPO_URL}")


def stage_and_commit(message: str, push_only: bool) -> None:
    if push_only:
        print("  [INFO] push-only：跳过版本文件更新和提交")
        return

    ok, _, err = run_command(["git", "add", "-A"])
    if not ok:
        raise RuntimeError(f"git add 失败: {err}")

    excluded = collect_excluded_paths()
    if excluded:
        run_command(["git", "reset", "--"] + excluded)
        print("  [OK] 已暂存变更（已排除 tools / 导出目录）")
    else:
        print("  [OK] 已暂存全部变更")

    has_changes = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(PROJECT_DIR),
        check=False,
    ).returncode == 1
    if not has_changes:
        print("  [INFO] 没有可提交变更，跳过 commit")
        return

    ok, _, err = run_command(["git", "commit", "-m", message])
    if not ok:
        raise RuntimeError(f"git commit 失败: {err}")
    print(f"  [OK] 已提交: {message}")


def recreate_tag(tag_name: str) -> None:
    run_command(["git", "tag", "-d", tag_name])
    ok, _, err = run_command(["git", "tag", "-a", tag_name, "-m", f"Release {tag_name}"])
    if not ok:
        raise RuntimeError(f"创建标签失败: {err}")
    print(f"  [OK] 已创建标签: {tag_name}")


def archive_remote_main_to_old() -> None:
    print("\n[STEP] 归档远端 main -> old")
    ok, _, err = run_command(["git", "fetch", "origin", "main"])
    if not ok:
        print(f"  [WARN] 拉取 origin/main 失败，跳过归档: {err}")
        return

    ok, _, err = run_with_retry(["git", "push", "origin", "origin/main:refs/heads/old", "--force"])
    if not ok:
        raise RuntimeError(f"归档 old 分支失败: {err}")
    print("  [OK] 已将远端当前 main 归档到 old")


def push_main_and_tag(tag_name: str) -> None:
    print("\n[STEP] 推送 main 与标签")
    ok_main, _, err_main = run_with_retry(["git", "push", "-u", "origin", "HEAD:main"])
    if not ok_main:
        raise RuntimeError(f"推送 main 失败: {err_main}")
    print("  [OK] main 推送成功")

    ok_tag, _, err_tag = run_with_retry(["git", "push", "origin", f"refs/tags/{tag_name}", "--force"])
    if not ok_tag:
        raise RuntimeError(f"推送标签失败: {err_tag}")
    print("  [OK] 标签推送成功")


def publish(version: str, *, push_only: bool, archive_old: bool) -> None:
    tag_name = f"v{version}"
    ensure_origin_remote()
    stage_and_commit(f"Release v{version}", push_only)

    if archive_old:
        archive_remote_main_to_old()

    recreate_tag(tag_name)
    push_main_and_tag(tag_name)

    print(f"\n[OK] 发布成功：{tag_name}")
    print(f"[LINK] Release: https://github.com/superdaobo/mini-hbut/releases/tag/{tag_name}")
    print("[LINK] Actions: https://github.com/superdaobo/mini-hbut/actions")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mini-HBUT 发布脚本（主分支模式）")
    parser.add_argument("bump", nargs="?", choices=["major", "minor", "patch"], default="patch")
    parser.add_argument("--version", help="指定目标版本号，例如 1.2.3")
    parser.add_argument("--push-only", action="store_true", help="仅推送 main + tag，不更新版本文件、不提交")
    parser.add_argument(
        "--no-archive-old",
        action="store_true",
        help="不执行 main -> old 归档（默认执行）",
    )
    parser.add_argument("-y", "--no-confirm", action="store_true", help="跳过确认")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    current = get_current_version()
    target = args.version if args.version else bump_version(current, args.bump)
    archive_old = not args.no_archive_old

    print("=" * 60)
    print("Mini-HBUT 发布脚本（main 主线）")
    print("=" * 60)
    print(f"[INFO] 当前版本: v{current}")
    print(f"[INFO] 目标版本: v{target}")
    print(f"[INFO] push-only: {args.push_only}")
    print(f"[INFO] 归档旧主线(main->old): {archive_old}")

    if not args.no_confirm:
        print("\n将执行以下操作：")
        if not args.push_only:
            print("  1) 更新版本文件并提交")
        else:
            print("  1) 跳过版本更新与提交")
        print("  2) （可选）归档远端当前 main 到 old")
        print("  3) 重建并推送标签")
        print("  4) 推送当前代码到 origin/main")
        answer = input("\n确认继续？[y/N]: ").strip().lower()
        if answer != "y":
            print("已取消。")
            return

    if not args.push_only:
        update_version_files(target)

    publish(target, push_only=args.push_only, archive_old=archive_old)

    print("\n[OK] 发布流程已完成。")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n[ERROR] 发布失败: {exc}")
        sys.exit(1)
