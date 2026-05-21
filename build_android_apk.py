#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mini-HBUT Android APK 构建脚本。

默认流程：
1. npm run build
2. npx cap sync android
3. android/gradlew.bat assembleDebug
4. 输出 APK 路径

常用示例：
    python build_android_apk.py
    python build_android_apk.py --release
    python build_android_apk.py --install
    python build_android_apk.py --skip-web-build --skip-sync
    python build_android_apk.py --dry-run
"""

from __future__ import annotations

import argparse
import ctypes
import os
import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
ANDROID_DIR = PROJECT_DIR / "android"


class BuildError(RuntimeError):
    """构建流程中可预期的失败。"""


def configure_utf8_console() -> None:
    """让 Windows 终端优先使用 UTF-8，避免中文帮助与状态输出乱码。"""
    if os.name == "nt":
        try:
            ctypes.windll.kernel32.SetConsoleCP(65001)
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        except OSError:
            pass

    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def resolve_tool(name: str) -> str:
    """在 Windows 下优先解析 .cmd/.exe/.bat，避免 subprocess 找不到 npm/npx。"""
    candidates = [name]
    if os.name == "nt" and "." not in Path(name).name:
        candidates = [f"{name}.cmd", f"{name}.exe", f"{name}.bat", name]

    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return name


def gradle_wrapper() -> Path:
    wrapper = ANDROID_DIR / ("gradlew.bat" if os.name == "nt" else "gradlew")
    if not wrapper.exists():
        raise BuildError(f"未找到 Android Gradle Wrapper: {wrapper}")
    return wrapper


def ensure_project_layout() -> None:
    required_paths = [
        PROJECT_DIR / "package.json",
        PROJECT_DIR / "capacitor.config.ts",
        ANDROID_DIR / "app",
    ]
    missing = [path for path in required_paths if not path.exists()]
    if missing:
        joined = "\n".join(f"  - {path}" for path in missing)
        raise BuildError(f"当前目录不像项目根目录，缺少：\n{joined}")
    gradle_wrapper()


def command_to_text(command: list[str | Path]) -> str:
    return " ".join(str(part) for part in command)


def run_step(
    title: str,
    command: list[str | Path],
    *,
    cwd: Path,
    dry_run: bool = False,
) -> None:
    print(f"\n[STEP] {title}")
    print(f"[CMD]  {command_to_text(command)}")

    if dry_run:
        print("[SKIP] dry-run 模式，未执行")
        return

    completed = subprocess.run(
        [str(part) for part in command],
        cwd=str(cwd),
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode != 0:
        raise BuildError(f"{title} 失败，退出码：{completed.returncode}")

    print(f"[OK]   {title} 完成")


def latest_apk(release: bool) -> Path:
    variant = "release" if release else "debug"
    output_dir = ANDROID_DIR / "app" / "build" / "outputs" / "apk" / variant
    apks = sorted(output_dir.glob("*.apk"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not apks:
        raise BuildError(f"未找到 {variant} APK，预期目录：{output_dir}")
    return apks[0]


def install_apk(apk_path: Path, *, dry_run: bool) -> None:
    adb = shutil.which("adb.exe") or shutil.which("adb")
    if not adb:
        raise BuildError("未找到 adb，请确认 Android SDK platform-tools 已加入 PATH")

    run_step(
        "安装 APK 到已连接设备",
        [adb, "install", "-r", apk_path],
        cwd=PROJECT_DIR,
        dry_run=dry_run,
    )


def build_android_apk(args: argparse.Namespace) -> Path | None:
    ensure_project_layout()

    npm = resolve_tool("npm")
    npx = resolve_tool("npx")
    gradlew = gradle_wrapper()
    assemble_task = "assembleRelease" if args.release else "assembleDebug"

    if not args.skip_web_build:
        run_step("构建 Web 产物", [npm, "run", "build"], cwd=PROJECT_DIR, dry_run=args.dry_run)
    else:
        print("\n[SKIP] 已跳过 Web 构建（--skip-web-build）")

    if not args.skip_sync:
        run_step("同步 Capacitor Android 工程", [npx, "cap", "sync", "android"], cwd=PROJECT_DIR, dry_run=args.dry_run)
    else:
        print("\n[SKIP] 已跳过 Capacitor 同步（--skip-sync）")

    if args.clean:
        run_step("清理 Android Gradle 构建缓存", [gradlew, "clean"], cwd=ANDROID_DIR, dry_run=args.dry_run)

    run_step(f"构建 Android {'Release' if args.release else 'Debug'} APK", [gradlew, assemble_task], cwd=ANDROID_DIR, dry_run=args.dry_run)

    if args.dry_run:
        print("\n[DONE] dry-run 完成，没有生成 APK")
        return None

    apk_path = latest_apk(args.release)
    print(f"\n[DONE] APK 已生成：{apk_path}")

    if args.install:
        install_apk(apk_path, dry_run=False)

    return apk_path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="串联构建 Mini-HBUT Android APK")
    parser.add_argument("--release", action="store_true", help="构建 Release APK，默认构建 Debug APK")
    parser.add_argument("--install", action="store_true", help="构建完成后通过 adb install -r 安装到已连接设备")
    parser.add_argument("--clean", action="store_true", help="构建前先执行 Gradle clean")
    parser.add_argument("--skip-web-build", action="store_true", help="跳过 npm run build")
    parser.add_argument("--skip-sync", action="store_true", help="跳过 npx cap sync android")
    parser.add_argument("--dry-run", action="store_true", help="只打印将要执行的命令，不真正构建")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    configure_utf8_console()
    args = parse_args(argv or sys.argv[1:])
    try:
        build_android_apk(args)
    except KeyboardInterrupt:
        print("\n[FAIL] 用户中断")
        return 130
    except BuildError as exc:
        print(f"\n[FAIL] {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
