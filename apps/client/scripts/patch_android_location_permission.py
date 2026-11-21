#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
#1370：向 Tauri 生成的 Android 工程 AndroidManifest.xml 注入定位权限声明。

背景：CI 每次 `npm run tauri android init` 全新生成 src-tauri/gen/android/（不入库），
生成的 AndroidManifest.xml 只有 INTERNET / POST_NOTIFICATIONS 等权限，没有定位权限
声明。缺少 <uses-permission> 声明时，系统不会弹出运行时授权框，WebView 内
navigator.geolocation 必然失败——即使 Tauri 壳 RustWebChromeClient 已实现
onGeolocationPermissionsShowPrompt 的运行时授权请求，清单缺声明也是无效的。

本脚本在 `npm run tauri android init` 之后、构建之前执行，幂等注入：
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
用途：校园导览与小塔出行的实时定位（地图定位 / 附近车辆 / 实时位置）。

目标路径解析：优先相对当前工作目录（CI 在 apps/client 下执行），其次相对本脚本
所在工程根（便于本地从任意目录调用），与 patch_android_safe_area.py 一致。

幂等性：以两条权限名判重（存在即跳过），重复执行不重复插入；
文件缺失或 <manifest> 标签找不到时给出明确错误并以非 0 退出（让 CI 红，
而不是静默跳过）；注入结果先做 XML 解析校验，非法时拒绝写回。
"""

from __future__ import annotations

import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

# #1370 需要注入的两条定位权限：精确（ACCESS_FINE_LOCATION）+ 粗略（ACCESS_COARSE_LOCATION）
FINE_PERMISSION = "android.permission.ACCESS_FINE_LOCATION"
COARSE_PERMISSION = "android.permission.ACCESS_COARSE_LOCATION"

MANIFEST_RELPATH = Path("src-tauri/gen/android/app/src/main/AndroidManifest.xml")


def candidate_roots() -> list[Path]:
    """目标根目录候选：cwd 优先（CI 语义），脚本所在工程根兜底（本地语义）。"""
    roots = [Path(os.getcwd()).resolve()]
    if roots[0] != PROJECT_DIR:
        roots.append(PROJECT_DIR)
    return roots


def find_manifest() -> Path | None:
    for root in candidate_roots():
        candidate = root / MANIFEST_RELPATH
        if candidate.exists():
            return candidate
    return None


def patch_permissions(text: str) -> tuple[str, bool]:
    """在 <manifest ...> 开始标签之后插入缺失的定位权限（幂等）。"""
    missing = [
        perm
        for perm in (FINE_PERMISSION, COARSE_PERMISSION)
        if f'android:name="{perm}"' not in text
    ]
    if not missing:
        return text, False

    manifest_match = re.search(r"<manifest\b[^>]*>", text)
    if not manifest_match:
        raise SystemExit("[ERROR] <manifest> tag not found in AndroidManifest.xml; aborting")

    # 中文注释说明用途（校园导览与小塔出行实时定位）；只插入缺失的权限行
    block = (
        '    <!-- Mini-HBUT location permission patch (#1370)：校园导览与小塔出行实时定位\n'
        '    所需定位权限；缺少清单声明时 navigator.geolocation 必然失败，故在 CI 注入。 -->\n'
        + "".join(f'    <uses-permission android:name="{perm}" />\n' for perm in missing)
    )
    patched = text[: manifest_match.end()] + "\n" + block + text[manifest_match.end() :]

    # 写回前校验注入结果是合法 XML，避免把损坏的清单交给 Gradle
    try:
        ET.fromstring(patched)
    except ET.ParseError as exc:
        raise SystemExit(f"[ERROR] Patched manifest is not valid XML, refusing to write: {exc}")
    return patched, True


def main() -> int:
    print("=" * 60)
    print("Patch Tauri Android manifest with location permissions (#1370)")
    print("=" * 60)

    manifest_path = find_manifest()
    if manifest_path is None:
        print("[ERROR] AndroidManifest.xml not found (run 'npm run tauri android init' first):")
        for root in candidate_roots():
            print(f"  - {root / MANIFEST_RELPATH}")
        return 1

    text = manifest_path.read_text(encoding="utf-8")
    text, added = patch_permissions(text)
    if added:
        manifest_path.write_text(text, encoding="utf-8")
        print(f"[OK] Patched {manifest_path}")
        print("  [ADD] ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION (校园导览与小塔出行实时定位)")
    else:
        print(f"[OK] {manifest_path} already declares location permissions; nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())
