#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将今日课程桌面小组件注入 Tauri 生成的 Android 工程。

在 `npm run tauri android init` 之后、构建之前执行。
将 android/app/src/main/ 下的 widget 相关文件复制到 src-tauri/gen/android/app/src/main/，
并 patch AndroidManifest.xml 注册 receiver + service。
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
CAPACITOR_ANDROID = PROJECT_DIR / "android" / "app" / "src" / "main"
TAURI_ANDROID = PROJECT_DIR / "src-tauri" / "gen" / "android" / "app" / "src" / "main"


def copy_widget_sources():
    """复制 Kotlin 源文件到 Tauri 生成的 Android 工程。"""
    src_dir = CAPACITOR_ANDROID / "java" / "com" / "hbut" / "mini" / "widget"
    dst_dir = TAURI_ANDROID / "java" / "com" / "hbut" / "mini" / "widget"

    if not src_dir.exists():
        print(f"[WARN] Widget source dir not found: {src_dir}")
        return False

    # 排除 Capacitor 插件文件（Tauri 工程没有 Capacitor 依赖）
    # MiniHbutWidgetPlugin.kt 在 packages/ 目录下，不在这里
    # 但 WidgetDataStore 引用的 context 来自 Android SDK，无需 Capacitor
    EXCLUDE_FILES = set()  # 当前所有文件都是纯 Android SDK，无需排除

    dst_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for kt_file in src_dir.glob("*.kt"):
        if kt_file.name in EXCLUDE_FILES:
            print(f"  [SKIP] {kt_file.name} (Capacitor-only)")
            continue
        shutil.copy2(kt_file, dst_dir / kt_file.name)
        count += 1
        print(f"  [COPY] {kt_file.name}")

    print(f"[OK] Copied {count} Kotlin widget files")
    return count > 0


def copy_widget_resources():
    """复制 widget 相关的 XML 资源文件。"""
    resource_files = [
        # appwidget-provider XML
        ("res/xml/appwidget_today_courses.xml", "res/xml/appwidget_today_courses.xml"),
        # 布局文件
        ("res/layout/widget_today_courses_4x2.xml", "res/layout/widget_today_courses_4x2.xml"),
        ("res/layout/widget_today_courses_2x2.xml", "res/layout/widget_today_courses_2x2.xml"),
        ("res/layout/widget_today_courses_4x1.xml", "res/layout/widget_today_courses_4x1.xml"),
        ("res/layout/widget_item_course_row.xml", "res/layout/widget_item_course_row.xml"),
        # Drawable
        ("res/drawable/widget_preview_today_courses.xml", "res/drawable/widget_preview_today_courses.xml"),
        ("res/drawable/widget_background.xml", "res/drawable/widget_background.xml"),
        # 颜色资源
        ("res/values/colors_widget.xml", "res/values/colors_widget.xml"),
        ("res/values-night/colors_widget.xml", "res/values-night/colors_widget.xml"),
        ("res/values-v31/colors_widget.xml", "res/values-v31/colors_widget.xml"),
        ("res/values-night-v31/colors_widget.xml", "res/values-night-v31/colors_widget.xml"),
        # 字符串资源
        ("res/values/strings_widget.xml", "res/values/strings_widget.xml"),
    ]

    count = 0
    for src_rel, dst_rel in resource_files:
        src = CAPACITOR_ANDROID / src_rel
        dst = TAURI_ANDROID / dst_rel
        if not src.exists():
            print(f"  [SKIP] {src_rel} (not found)")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        count += 1

    print(f"[OK] Copied {count} resource files")
    return count > 0


def patch_manifest():
    """在 Tauri 生成的 AndroidManifest.xml 中注册 widget receiver 和 service。"""
    manifest_path = TAURI_ANDROID / "AndroidManifest.xml"
    if not manifest_path.exists():
        print(f"[WARN] AndroidManifest.xml not found: {manifest_path}")
        return False

    text = manifest_path.read_text(encoding="utf-8")

    # 检查是否已经注入过
    if "TodayCoursesProvider" in text:
        print("[OK] Widget already registered in AndroidManifest.xml")
        return True

    # 注入 widget receiver + service（在 </application> 之前）
    widget_xml = """
        <!-- 今日课程小组件 Provider -->
        <receiver
            android:name="com.hbut.mini.widget.TodayCoursesProvider"
            android:exported="true"
            android:label="@string/widget_today_courses_title">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="com.hbut.mini.widget.ACTION_REFRESH" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/appwidget_today_courses" />
        </receiver>

        <!-- 今日课程小组件 RemoteViewsService -->
        <service
            android:name="com.hbut.mini.widget.TodayCoursesRemoteViewsService"
            android:permission="android.permission.BIND_REMOTEVIEWS"
            android:exported="false" />
"""

    if "</application>" in text:
        text = text.replace("</application>", widget_xml + "\n    </application>")
    else:
        print("[WARN] Could not find </application> tag in manifest")
        return False

    # 注入 deep link intent-filter 到主 Activity（如果不存在）
    if 'android:scheme="minihbut"' not in text:
        # 找到主 Activity 的 </activity> 并在之前插入 intent-filter
        deep_link_filter = """
            <!-- Deep link: minihbut://schedule（小组件点击跳转） -->
            <intent-filter android:autoVerify="false">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="minihbut" android:host="schedule" />
            </intent-filter>
"""
        # 在第一个 </activity> 之前插入
        text = text.replace("</activity>", deep_link_filter + "        </activity>", 1)

    manifest_path.write_text(text, encoding="utf-8")
    print("[OK] Patched AndroidManifest.xml with widget receiver + deep link")
    return True


def patch_build_gradle():
    """确保 Tauri 生成的 build.gradle 包含 Kotlin 插件和 WorkManager 依赖。"""
    # 尝试 .kts 和 .gradle 两种格式
    gradle_kts = TAURI_ANDROID.parent / "build.gradle.kts"
    gradle_groovy = TAURI_ANDROID.parent / "build.gradle"

    # App-level gradle
    app_gradle_kts = TAURI_ANDROID.parent / "build.gradle.kts"
    app_gradle_groovy = TAURI_ANDROID.parent / "build.gradle"

    # 查找 app 级别的 gradle 文件
    app_dir = TAURI_ANDROID.parent  # src-tauri/gen/android/app
    candidates = [
        app_dir / "build.gradle.kts",
        app_dir / "build.gradle",
    ]
    app_gradle = next((p for p in candidates if p.exists()), None)

    if app_gradle is None:
        print("[WARN] App build.gradle not found, skip Kotlin/WorkManager patch")
        return False

    text = app_gradle.read_text(encoding="utf-8")

    if app_gradle.suffix == ".kts":
        # Kotlin DSL
        if "kotlin-android" not in text and 'kotlin("android")' not in text:
            # 在 plugins { } 块中添加 kotlin
            if "plugins {" in text:
                text = text.replace(
                    "plugins {",
                    'plugins {\n    id("org.jetbrains.kotlin.android") version "1.9.22"',
                    1
                )
            else:
                text = 'plugins {\n    id("org.jetbrains.kotlin.android") version "1.9.22"\n}\n' + text

        if "work-runtime" not in text:
            # 添加 WorkManager 依赖
            if "dependencies {" in text:
                text = text.replace(
                    "dependencies {",
                    'dependencies {\n    implementation("androidx.work:work-runtime-ktx:2.9.0")',
                    1
                )

        if "jvmTarget" not in text:
            # 添加 kotlinOptions
            if "android {" in text:
                text = text.replace(
                    "android {",
                    'android {\n    kotlinOptions {\n        jvmTarget = "17"\n    }',
                    1
                )
    else:
        # Groovy DSL
        if "kotlin-android" not in text:
            if "apply plugin:" in text:
                # 在第一个 apply plugin 之后添加
                text = text.replace(
                    "apply plugin: 'com.android.application'",
                    "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'",
                    1
                )
            else:
                text = "apply plugin: 'kotlin-android'\n" + text

        if "work-runtime" not in text:
            if "dependencies {" in text:
                text = text.replace(
                    "dependencies {",
                    'dependencies {\n    implementation "androidx.work:work-runtime-ktx:2.9.0"',
                    1
                )

        if "jvmTarget" not in text:
            if "android {" in text:
                text = text.replace(
                    "android {",
                    "android {\n    kotlinOptions {\n        jvmTarget = '17'\n    }",
                    1
                )

    app_gradle.write_text(text, encoding="utf-8")
    print(f"[OK] Patched {app_gradle.name} with Kotlin + WorkManager")

    # 也需要在根 build.gradle 添加 Kotlin classpath
    root_gradle_candidates = [
        TAURI_ANDROID.parent.parent / "build.gradle.kts",
        TAURI_ANDROID.parent.parent / "build.gradle",
    ]
    root_gradle = next((p for p in root_gradle_candidates if p.exists()), None)
    if root_gradle:
        root_text = root_gradle.read_text(encoding="utf-8")
        if "kotlin-gradle-plugin" not in root_text and "org.jetbrains.kotlin.android" not in root_text:
            if root_gradle.suffix == ".kts":
                if "plugins {" in root_text:
                    root_text = root_text.replace(
                        "plugins {",
                        'plugins {\n    id("org.jetbrains.kotlin.android") version "1.9.22" apply false',
                        1
                    )
            else:
                if "dependencies {" in root_text:
                    root_text = root_text.replace(
                        "dependencies {",
                        "dependencies {\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'",
                        1
                    )
            root_gradle.write_text(root_text, encoding="utf-8")
            print(f"[OK] Patched root {root_gradle.name} with Kotlin classpath")

    return True


def main() -> int:
    print("=" * 60)
    print("Patch Tauri Android project with Widget support")
    print("=" * 60)

    if not TAURI_ANDROID.exists():
        print(f"[ERROR] Tauri Android project not found: {TAURI_ANDROID}")
        print("  Run 'npm run tauri android init' first.")
        return 1

    if not CAPACITOR_ANDROID.exists():
        print(f"[ERROR] Capacitor Android source not found: {CAPACITOR_ANDROID}")
        return 1

    ok = True
    ok = copy_widget_sources() and ok
    ok = copy_widget_resources() and ok
    ok = patch_manifest() and ok
    ok = patch_build_gradle() and ok

    if ok:
        print("\n[OK] All widget patches applied successfully.")
    else:
        print("\n[WARN] Some patches may have failed, check output above.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
