#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 RGBA 源图生成 App Store 专用不透明 RGB 图标。

Tauri 编译要求 bundle 图标为 RGBA，而 TestFlight 90717 要求 1024 营销图标不含 alpha。
因此保留 RGBA 源图，并额外生成 *-appstore.png 供 iOS 资源目录同步使用。
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[ERROR] Pillow 未安装，请执行: python -m pip install Pillow")
    sys.exit(1)


PROJECT_DIR = Path(__file__).resolve().parent.parent
IOS_ICON_DIR = PROJECT_DIR / "src-tauri" / "icons" / "ios"
CAPACITOR_ICON = (
    PROJECT_DIR / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"
)

APP_STORE_ICON_PAIRS = {
    "AppIcon-512@2x.png": "AppIcon-512@2x-appstore.png",
    "AppIcon-1024x1024@1x.png": "AppIcon-1024x1024@1x-appstore.png",
}

BACKGROUND = (61, 136, 252)


def flatten_to_appstore(source_path: Path, target_path: Path) -> bool:
    with Image.open(source_path) as image:
        if target_path.exists():
            with Image.open(target_path) as existing:
                if existing.mode == "RGB" and existing.size == image.size:
                    return False

        flattened = Image.new("RGB", image.size, BACKGROUND)
        flattened.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[3])
        target_path.parent.mkdir(parents=True, exist_ok=True)
        flattened.save(target_path, "PNG", optimize=True)
        return True


def main() -> int:
    if not IOS_ICON_DIR.is_dir():
        print(f"[ERROR] iOS 图标目录不存在: {IOS_ICON_DIR}")
        return 1

    changed = 0
    for source_name, target_name in APP_STORE_ICON_PAIRS.items():
        source_path = IOS_ICON_DIR / source_name
        target_path = IOS_ICON_DIR / target_name
        if not source_path.exists():
            print(f"[icon-fix] 跳过缺失源图: {source_path}")
            continue
        if flatten_to_appstore(source_path, target_path):
            changed += 1
            print(f"[icon-fix] 已生成 App Store 图标: {target_path.relative_to(PROJECT_DIR)}")

    primary_source = IOS_ICON_DIR / "AppIcon-512@2x.png"
    primary_target = IOS_ICON_DIR / "AppIcon-512@2x-appstore.png"
    if primary_source.exists() and primary_target.exists() and flatten_to_appstore(primary_source, CAPACITOR_ICON):
        changed += 1
        print(f"[icon-fix] 已同步 Capacitor 图标: {CAPACITOR_ICON.relative_to(PROJECT_DIR)}")

    if changed == 0:
        print("[icon-fix] App Store 图标已是最新，无需修改。")
    else:
        print(f"[icon-fix] 共更新 {changed} 个 App Store 图标。")

    return 0


if __name__ == "__main__":
    sys.exit(main())
