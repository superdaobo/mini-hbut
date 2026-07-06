#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 iOS App Store 1024 图标压平为不透明 RGB，避免 TestFlight 90717 校验失败。"""

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

# 这些文件名对应 1024x1024 的 App Store 营销图标。
APP_STORE_ICON_NAMES = {
    "AppIcon-512@2x.png",
    "AppIcon-1024x1024@1x.png",
}

BACKGROUND = (255, 255, 255)


def flatten_icon(path: Path) -> bool:
    with Image.open(path) as image:
        if image.mode == "RGB":
            return False

        flattened = Image.new("RGB", image.size, BACKGROUND)
        flattened.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[3])
        flattened.save(path, "PNG", optimize=True)
        return True


def main() -> int:
    if not IOS_ICON_DIR.is_dir():
        print(f"[ERROR] iOS 图标目录不存在: {IOS_ICON_DIR}")
        return 1

    changed = 0
    for name in sorted(APP_STORE_ICON_NAMES):
        icon_path = IOS_ICON_DIR / name
        if not icon_path.exists():
            print(f"[icon-fix] 跳过缺失文件: {icon_path}")
            continue
        if flatten_icon(icon_path):
            changed += 1
            print(f"[icon-fix] 已移除 alpha: {icon_path.relative_to(PROJECT_DIR)}")

    if CAPACITOR_ICON.exists() and flatten_icon(CAPACITOR_ICON):
        changed += 1
        print(f"[icon-fix] 已移除 alpha: {CAPACITOR_ICON.relative_to(PROJECT_DIR)}")

    if changed == 0:
        print("[icon-fix] 所有 App Store 图标已为不透明 RGB，无需修改。")
    else:
        print(f"[icon-fix] 共更新 {changed} 个图标。")

    return 0


if __name__ == "__main__":
    sys.exit(main())
