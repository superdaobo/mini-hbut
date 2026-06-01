#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将今日课程桌面小组件注入 Tauri 生成的 Android 工程。

在 `npm run tauri android init` 之后、构建之前执行。
将 android/app/src/main/ 下的 widget 相关文件复制到 src-tauri/gen/android/app/src/main/，
并 patch AndroidManifest.xml 注册 receiver + service。

注意：widget 周期刷新依赖 AndroidX WorkManager，脚本会同步补齐依赖。
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


def copy_native_sources():
    """复制 Tauri Android 可直接编译的原生后台源码。"""
    source_files = [
        "java/com/hbut/mini/KeepAliveForegroundService.java",
        "java/com/hbut/mini/BootCompletedReceiver.java",
    ]
    stale_capacitor_sources = [
        "java/com/hbut/mini/HBUTNativePlugin.java",
        "java/com/hbut/mini/MiniHbutWidgetPlugin.java",
        "java/com/hbut/mini/BackgroundFetchHeadlessTask.java",
    ]
    for rel_path in stale_capacitor_sources:
        stale = TAURI_ANDROID / rel_path
        if stale.exists():
            stale.unlink()
            print(f"  [REMOVE] stale Capacitor-only source {rel_path}")

    count = 0
    for rel_path in source_files:
        src = CAPACITOR_ANDROID / rel_path
        dst = TAURI_ANDROID / rel_path
        if not src.exists():
            print(f"  [SKIP] {rel_path} (not found)")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        count += 1
        print(f"  [COPY] {rel_path}")
    print(f"[OK] Copied {count} native Android files")
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
        "res/values/strings_widget.xml",
        "res/values/colors_widget.xml",
        "res/drawable/widget_background.xml",
        "res/drawable/widget_preview_today_courses.xml",
        "res/drawable/widget_badge_bg.xml",
        "res/drawable/widget_period_badge.xml",
        "res/drawable/widget_dot_accent.xml",
        "res/drawable/widget_capsule_accent.xml",
        "res/drawable/widget_capsule_period.xml",
        "res/drawable/widget_capsule_location.xml",
        "res/drawable/ic_stat_mini_hbut.xml",
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
    before_application = '    <uses-permission android:name="android.permission.INTERNET" />\n\n    <application'
    if before_application in text:
        required_permissions = [
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.RECEIVE_BOOT_COMPLETED",
            "android.permission.WAKE_LOCK",
            "android.permission.FOREGROUND_SERVICE",
            "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
            "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        ]
        inserts = ""
        for perm in required_permissions:
            if f'android:name="{perm}"' not in text:
                inserts += f'    <uses-permission android:name="{perm}" />\n'
        if inserts:
            text = text.replace(
                before_application,
                '    <uses-permission android:name="android.permission.INTERNET" />\n' + inserts + "\n    <application",
                1,
            )

    application_entries = []
    if "KeepAliveForegroundService" not in text:
        application_entries.append('''
        <service
            android:name=".KeepAliveForegroundService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="dataSync" />''')

    if "BootCompletedReceiver" not in text:
        application_entries.append('''
        <receiver
            android:name=".BootCompletedReceiver"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>''')

    if "TodayCoursesProvider" not in text:
        application_entries.append('''
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
        </receiver>''')

    if "ElectricityWidgetProvider" not in text:
        application_entries.append('''
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
        </receiver>''')

    if "ExamWidgetProvider" not in text:
        application_entries.append('''
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
        </receiver>''')

    if "TodayCoursesRemoteViewsService" not in text:
        application_entries.append('''
        <!-- 今日课程小组件 RemoteViewsService -->
        <service
            android:name="com.hbut.mini.widget.TodayCoursesRemoteViewsService"
            android:permission="android.permission.BIND_REMOTEVIEWS"
            android:exported="false" />''')

    if application_entries and "</application>" in text:
        widget_xml = "\n".join(application_entries) + "\n"
        text = text.replace("</application>", widget_xml + "\n    </application>")
    elif application_entries:
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
    print("[OK] Patched AndroidManifest.xml with widget/background entries + deep link")
    return True


def patch_gradle_dependencies():
    """补齐 Tauri Android 工程中的 WorkManager 依赖。"""
    generated_app_dir = TAURI_ANDROID.parents[1]
    candidates = [
        generated_app_dir / "build.gradle.kts",
        generated_app_dir / "build.gradle",
        TAURI_ANDROID.parent / "build.gradle.kts",
        TAURI_ANDROID.parent / "build.gradle",
    ]
    patched = False
    for gradle_path in candidates:
        if not gradle_path.exists():
            continue
        text = gradle_path.read_text(encoding="utf-8")
        if "androidx.work:work-runtime-ktx" in text:
            print(f"[OK] WorkManager dependency already exists in {gradle_path.name}")
            return True
        if "dependencies {" not in text:
            continue
        if gradle_path.suffix == ".kts":
            dep = '    implementation("androidx.work:work-runtime-ktx:2.9.0")\n'
        else:
            dep = "    implementation 'androidx.work:work-runtime-ktx:2.9.0'\n"
        text = text.replace("dependencies {", "dependencies {\n" + dep, 1)
        gradle_path.write_text(text, encoding="utf-8")
        print(f"[OK] Added WorkManager dependency to {gradle_path.name}")
        patched = True
        break
    if not patched:
        print("[WARN] Could not patch WorkManager dependency; Gradle file not found or unsupported")
    return patched


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
    ok = copy_native_sources() and ok
    ok = copy_widget_sources() and ok
    ok = copy_widget_resources() and ok
    ok = patch_manifest() and ok
    ok = patch_gradle_dependencies() and ok

    if ok:
        print("\n[OK] All widget patches applied successfully.")
    else:
        print("\n[WARN] Some patches may have failed, check output above.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
