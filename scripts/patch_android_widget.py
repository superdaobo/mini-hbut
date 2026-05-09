#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将今日课程桌面小组件注入 Tauri 生成的 Android 工程。

在 `npm run tauri android init` 之后、构建之前执行。
将 android/app/src/main/ 下的 widget 相关文件复制到 src-tauri/gen/android/app/src/main/，
并 patch AndroidManifest.xml 注册 receiver + service。

注意：widget 代码仅使用 Android SDK 标准 API，不依赖 WorkManager 等额外库。
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

    dst_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for kt_file in src_dir.glob("*.kt"):
        shutil.copy2(kt_file, dst_dir / kt_file.name)
        count += 1
        print(f"  [COPY] {kt_file.name}")

    print(f"[OK] Copied {count} Kotlin widget files")
    return count > 0


def copy_widget_resources():
    """复制 widget 相关的 XML 资源文件。"""
    resource_files = [
        "res/xml/appwidget_today_courses.xml",
        "res/xml/appwidget_electricity.xml",
        "res/xml/appwidget_exam.xml",
        "res/layout/widget_today_courses_4x2.xml",
        "res/layout/widget_today_courses_2x2.xml",
        "res/layout/widget_today_courses_4x1.xml",
        "res/layout/widget_item_course_row.xml",
        "res/layout/widget_electricity.xml",
        "res/layout/widget_exam.xml",
        "res/drawable/widget_preview_today_courses.xml",
        "res/drawable/widget_background.xml",
        "res/drawable/widget_dot_accent.xml",
        "res/drawable/widget_capsule_accent.xml",
        "res/drawable/widget_capsule_period.xml",
        "res/drawable/widget_capsule_location.xml",
        "res/values/colors_widget.xml",
        "res/values-night/colors_widget.xml",
        "res/values-v31/colors_widget.xml",
        "res/values-night-v31/colors_widget.xml",
        "res/values/strings_widget.xml",
    ]

    count = 0
    for rel_path in resource_files:
        src = CAPACITOR_ANDROID / rel_path
        dst = TAURI_ANDROID / rel_path
        if not src.exists():
            print(f"  [SKIP] {rel_path} (not found)")
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

    if "TodayCoursesProvider" in text:
        print("[OK] Widget already registered in AndroidManifest.xml")
        return True

    widget_xml = '''
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

        <!-- 电费小组件 Provider -->
        <receiver
            android:name="com.hbut.mini.widget.ElectricityWidgetProvider"
            android:exported="true"
            android:label="@string/widget_electricity_title">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="com.hbut.mini.widget.ACTION_ELECTRICITY_REFRESH" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/appwidget_electricity" />
        </receiver>

        <!-- 考试安排小组件 Provider -->
        <receiver
            android:name="com.hbut.mini.widget.ExamWidgetProvider"
            android:exported="true"
            android:label="@string/widget_exam_title">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="com.hbut.mini.widget.ACTION_EXAM_REFRESH" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/appwidget_exam" />
        </receiver>

        <!-- 今日课程小组件 RemoteViewsService -->
        <service
            android:name="com.hbut.mini.widget.TodayCoursesRemoteViewsService"
            android:permission="android.permission.BIND_REMOTEVIEWS"
            android:exported="false" />
'''

    if "</application>" in text:
        text = text.replace("</application>", widget_xml + "\n    </application>")
    else:
        print("[WARN] Could not find </application> tag in manifest")
        return False

    if 'android:scheme="minihbut"' not in text:
        deep_link_filter = '''
            <!-- Deep link: minihbut://schedule -->
            <intent-filter android:autoVerify="false">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="minihbut" android:host="schedule" />
            </intent-filter>
'''
        text = text.replace("</activity>", deep_link_filter + "        </activity>", 1)

    manifest_path.write_text(text, encoding="utf-8")
    print("[OK] Patched AndroidManifest.xml with widget receiver + deep link")
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

    if ok:
        print("\n[OK] All widget patches applied successfully.")
    else:
        print("\n[WARN] Some patches may have failed, check output above.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
