#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将自研后台通知插件（tauri-plugin-hbut-background）的 Kotlin 源码接入 Tauri 生成的 Android 工程。

背景（#631）：CI 每次 `tauri android init` 全新生成 src-tauri/gen/android/，
本地 #612 的 sourceSets 追加段（kotlin.srcDir 指向插件 kotlin 目录）与
androidx.work:work-runtime-ktx 依赖会丢失，导致 CI 构建的 APK 不含后台通知代码。

本脚本在 `npm run tauri android init` 之后、构建之前执行，幂等追加：
1. android { sourceSets { main { kotlin.srcDir(...) } } } —— 直接编译插件 Kotlin 源码
2. dependencies { implementation("androidx.work:work-runtime-ktx:2.9.0") } —— Worker 调度依赖

相对路径语义与本地 #612 一致：本模块目录为 src-tauri/gen/android/app，
../../../ = src-tauri，因此 srcDir 指向 ../../../plugins/tauri-plugin-hbut-background/android/src/main/kotlin。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
GRADLE_CANDIDATES = [
    PROJECT_DIR / "src-tauri" / "gen" / "android" / "app" / "build.gradle.kts",
    PROJECT_DIR / "src-tauri" / "gen" / "android" / "app" / "build.gradle",
]

# 与本地 #612 集成段完全一致的标记（存在即视为已追加，跳过）
KOTLIN_SRC_DIR_MARKER = "tauri-plugin-hbut-background/android/src/main/kotlin"
WORK_RUNTIME_DEP_MARKER = "androidx.work:work-runtime-ktx"
WORK_RUNTIME_VERSION = "2.9.0"


def patch_source_sets(text: str, is_kts: bool) -> tuple[str, bool]:
    """在 android {} 块内追加 sourceSets，引用后台插件 Kotlin 源码（幂等）。"""
    if KOTLIN_SRC_DIR_MARKER in text:
        return text, False
    android_match = re.search(r"\bandroid\s*\{", text)
    if not android_match:
        raise SystemExit("android { block not found in Gradle file")
    if is_kts:
        block = (
            "\n    sourceSets {\n"
            "        // #612 最小追加：直接引用自研后台插件 android/ Kotlin 源码（含 WorkManager 成绩检测）。\n"
            "        // 相对路径基于本模块目录 gen/android/app：../../.. = src-tauri（与 rust.rootDirRel 同级语义）。\n"
            "        // 注意：src-tauri/gen/android 为生成工程，删除重建后需重新追加本段（见插件 README）。\n"
            '        getByName("main") {\n'
            '            kotlin.srcDir("../../../plugins/tauri-plugin-hbut-background/android/src/main/kotlin")\n'
            "        }\n"
            "    }\n"
        )
    else:
        block = (
            "\n    sourceSets {\n"
            "        // #612 最小追加：直接引用自研后台插件 android/ Kotlin 源码（含 WorkManager 成绩检测）。\n"
            '        main {\n'
            '            kotlin.srcDir "../../../plugins/tauri-plugin-hbut-background/android/src/main/kotlin"\n'
            "        }\n"
            "    }\n"
        )
    return text[: android_match.end()] + block + text[android_match.end() :], True


def patch_work_manager_dependency(text: str, is_kts: bool) -> tuple[str, bool]:
    """在 dependencies {} 块内追加 androidx.work:work-runtime-ktx（幂等）。"""
    if WORK_RUNTIME_DEP_MARKER in text:
        return text, False
    dependencies_match = re.search(r"\bdependencies\s*\{", text)
    if not dependencies_match:
        raise SystemExit("dependencies { block not found in Gradle file")
    if is_kts:
        dep = f'    implementation("androidx.work:work-runtime-ktx:{WORK_RUNTIME_VERSION}")\n'
    else:
        dep = f"    implementation 'androidx.work:work-runtime-ktx:{WORK_RUNTIME_VERSION}'\n"
    return text[: dependencies_match.end()] + "\n" + dep + text[dependencies_match.end() :], True


def main() -> int:
    print("=" * 60)
    print("Patch Tauri Android project with background notification support (#631)")
    print("=" * 60)

    gradle_path = next((p for p in GRADLE_CANDIDATES if p.exists()), None)
    if gradle_path is None:
        print("[ERROR] Android Gradle file not found (run 'npm run tauri android init' first):")
        for candidate in GRADLE_CANDIDATES:
            print(f"  - {candidate}")
        return 1

    is_kts = gradle_path.suffix == ".kts"
    text = gradle_path.read_text(encoding="utf-8")
    text, source_sets_added = patch_source_sets(text, is_kts)
    text, dependency_added = patch_work_manager_dependency(text, is_kts)
    if source_sets_added or dependency_added:
        gradle_path.write_text(text, encoding="utf-8")
        print(f"[OK] Patched {gradle_path}")
    else:
        print(f"[OK] {gradle_path} already contains background sourceSets + work-runtime-ktx; nothing to do")

    if source_sets_added:
        print("  [ADD] sourceSets.main.kotlin.srcDir -> tauri-plugin-hbut-background kotlin")
    if dependency_added:
        print(f"  [ADD] implementation('androidx.work:work-runtime-ktx:{WORK_RUNTIME_VERSION}')")
    return 0


if __name__ == "__main__":
    sys.exit(main())
