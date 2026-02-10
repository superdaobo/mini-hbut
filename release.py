#!/usr/bin/env python3
"""
Mini-HBUT 发布脚本

功能:
1. 自动更新版本号(package.json / tauri.conf.json / Cargo.toml)
2. Git 提交、打 tag、推送代码与标签
3. 推送支持 5xx/网络抖动自动重试
4. 推送失败会直接退出，不再误报“发布成功”

常用:
    python release.py                   # patch +1
    python release.py minor             # minor +1
    python release.py major             # major +1
    python release.py --push-only --version 1.0.25
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
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR

# 不希望纳入发布 commit 的内容
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


def run_command(cmd: list[str], cwd: Path | None = None, check: bool = True) -> tuple[bool, str, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd or PROJECT_DIR),
            check=check,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return True, (result.stdout or "").strip(), (result.stderr or "").strip()
    except subprocess.CalledProcessError as exc:
        return False, (exc.stdout or "").strip(), (exc.stderr or "").strip()
    except Exception as exc:  # pragma: no cover
        return False, "", str(exc)


def should_retry(stdout: str, stderr: str) -> bool:
    text = f"{stdout}\n{stderr}".lower()
    return any(re.search(pattern, text) for pattern in TRANSIENT_PATTERNS)


def run_with_retry(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    retries: int = 4,
    first_delay: float = 2.0,
) -> tuple[bool, str, str]:
    delay = first_delay
    last_out = ""
    last_err = ""
    for attempt in range(1, retries + 1):
        ok, out, err = run_command(cmd, cwd=cwd, check=False)
        last_out, last_err = out, err
        if ok:
            return True, out, err
        if attempt < retries and should_retry(out, err):
            print(f"  ⚠️ 命令失败(第 {attempt}/{retries} 次)，{delay:.0f}s 后重试: {' '.join(cmd)}")
            time.sleep(delay)
            delay *= 1.8
            continue
        return False, out, err
    return False, last_out, last_err


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: dict):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str):
    path.write_text(content, encoding="utf-8")


def parse_version(version: str) -> tuple[int, int, int]:
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)$", version.strip())
    if not match:
        raise ValueError(f"非法版本号: {version}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


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


def current_version() -> str:
    package_json = PROJECT_DIR / "package.json"
    data = read_json(package_json)
    return str(data.get("version", "1.0.0"))


def update_version_in_files(new_version: str):
    print(f"\n📝 更新版本号到 {new_version}...")
    updated = []

    package_json = PROJECT_DIR / "package.json"
    data = read_json(package_json)
    data["version"] = new_version
    write_json(package_json, data)
    updated.append("package.json")
    print(f"  ✅ package.json: {new_version}")

    tauri_conf = PROJECT_DIR / "src-tauri" / "tauri.conf.json"
    data = read_json(tauri_conf)
    data["version"] = new_version
    write_json(tauri_conf, data)
    updated.append("src-tauri/tauri.conf.json")
    print(f"  ✅ tauri.conf.json: {new_version}")

    cargo_toml = PROJECT_DIR / "src-tauri" / "Cargo.toml"
    content = read_text(cargo_toml)
    content = re.sub(
        r'^version\s*=\s*"[^"]+"',
        f'version = "{new_version}"',
        content,
        count=1,
        flags=re.MULTILINE,
    )
    write_text(cargo_toml, content)
    updated.append("src-tauri/Cargo.toml")
    print(f"  ✅ Cargo.toml: {new_version}")

    return updated


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


def ensure_origin_remote():
    ok, out, _ = run_command(["git", "remote", "get-url", "origin"], check=False)
    if not ok or out.strip() != REPO_URL:
        run_command(["git", "remote", "remove", "origin"], check=False)
        ok, _, err = run_command(["git", "remote", "add", "origin", REPO_URL], check=False)
        if not ok:
            raise RuntimeError(f"配置远程仓库失败: {err}")
        print(f"  ✅ 已设置 origin: {REPO_URL}")


def stage_release_files():
    ok, _, err = run_command(["git", "add", "-A"], check=False)
    if not ok:
        raise RuntimeError(f"git add 失败: {err}")
    excluded = collect_excluded_paths()
    if excluded:
        run_command(["git", "reset", "--"] + excluded, check=False)
        print("  ✅ 已暂存所有更改（已排除调试文件/tools）")
    else:
        print("  ✅ 已暂存所有更改")


def maybe_commit(message: str):
    ok, _, _ = run_command(["git", "diff", "--cached", "--quiet"], check=False)
    if ok:
        print("  ℹ️ 没有新的暂存变更，跳过 commit")
        return
    ok, _, err = run_command(["git", "commit", "-m", message], check=False)
    if not ok:
        raise RuntimeError(f"git commit 失败: {err}")
    print(f"  ✅ 提交: {message}")


def recreate_tag(tag_name: str):
    run_command(["git", "tag", "-d", tag_name], check=False)
    ok, _, err = run_command(["git", "tag", "-a", tag_name, "-m", f"Release {tag_name}"], check=False)
    if not ok:
        raise RuntimeError(f"创建标签失败: {err}")
    print(f"  ✅ 创建标签: {tag_name}")


def push_main_and_tag(tag_name: str):
    print(f"\n📤 推送到 {REPO_URL}...")

    ok_main, _, err_main = run_with_retry(["git", "push", "-u", "origin", "main"])
    if ok_main:
        print("  ✅ 推送代码成功")
    else:
        raise RuntimeError(f"推送代码失败: {err_main}")

    ok_tag, _, err_tag = run_with_retry(["git", "push", "origin", f"refs/tags/{tag_name}", "--force"])
    if ok_tag:
        print("  ✅ 推送标签成功")
    else:
        raise RuntimeError(f"推送标签失败: {err_tag}")


def publish(version: str, *, push_only: bool):
    tag_name = f"v{version}"
    print("\n📤 Git 操作...")
    ensure_origin_remote()

    if not push_only:
        stage_release_files()
        maybe_commit(f"🚀 Release v{version}")
    else:
        print("  ✅ push-only 模式：跳过版本文件更新和 commit")

    recreate_tag(tag_name)
    push_main_and_tag(tag_name)

    print(f"\n✅ 成功发布 {tag_name} 到 GitHub!")
    print(f"🔗 查看发布: https://github.com/superdaobo/mini-hbut/releases/tag/{tag_name}")
    print("🔗 查看 Actions: https://github.com/superdaobo/mini-hbut/actions")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mini-HBUT 发布脚本")
    parser.add_argument("bump", nargs="?", choices=["major", "minor", "patch"], default="patch")
    parser.add_argument("--version", dest="version", help="指定目标版本号，例如 1.0.25")
    parser.add_argument("--push-only", action="store_true", help="只重打标签并推送，不改版本文件、不提交")
    parser.add_argument("-y", "--no-confirm", action="store_true", help="跳过确认")
    return parser.parse_args()


def main():
    print("=" * 55)
    print("🚀 Mini-HBUT 版本发布脚本")
    print("=" * 55)

    args = parse_args()
    now = current_version()
    target = args.version if args.version else bump_version(now, args.bump)

    print(f"\n📌 当前版本: v{now}")
    print(f"🎯 目标版本: v{target}")
    if args.push_only:
        print("🛠️  模式: push-only（不改版本文件）")

    if not args.no_confirm:
        print("\n将执行:")
        if not args.push_only:
            print("  1. 更新版本文件")
            print("  2. Git 提交")
        else:
            print("  1. 跳过版本更新与提交")
        print(f"  3. 重建并推送标签 v{target}")
        print("  4. 推送 main 分支")
        answer = input("\n确认继续? [y/N]: ").strip().lower()
        if answer != "y":
            print("❌ 已取消")
            return

    if not args.push_only:
        update_version_in_files(target)

    publish(target, push_only=args.push_only)

    print("\n" + "=" * 55)
    print(f"✅ v{target} 发布完成")
    print("GitHub Actions 将自动构建:")
    print("  • Android APK (arm64)")
    print("  • Windows 安装包 (MSI/EXE)")
    print("  • macOS 安装包 (DMG)")
    print("=" * 55)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n❌ 发布失败: {exc}")
        sys.exit(1)
