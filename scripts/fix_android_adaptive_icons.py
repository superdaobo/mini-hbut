#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复 Android Adaptive Icon 前景图缩放问题。

Android Adaptive Icon 规范：
- 前景层 (foreground) 尺寸为 108dp（各密度对应像素不同）
- 可见安全区域为中心 72dp（66.67%）
- 系统会裁剪外围 18dp（每侧约 16.67%）

如果前景 PNG 没有预留外围 padding，图标会显得"过大/被裁剪"。
本脚本将现有前景图缩小到 66.67% 并居中放置在正确尺寸的画布上。
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[ERROR] Pillow 未安装，无法修复图标。请执行: pip install Pillow")
    sys.exit(1)

PROJECT_DIR = Path(__file__).resolve().parent.parent
ICONS_DIR = PROJECT_DIR / "src-tauri" / "icons" / "android"

# 各密度下 foreground 的目标尺寸（108dp 对应像素）
FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# 同时处理 legacy 目录
LEGACY_DIRS = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# 安全区域比例：使用标准 66.67% 填充（72/108）
# 这是 Android 官方推荐的安全区域，确保图标在所有 launcher 上不被裁剪
SAFE_ZONE_RATIO = 72.0 / 108.0


def fix_foreground(dir_name: str, target_size: int) -> bool:
    """将前景图缩小到安全区域大小并居中放置。"""
    fg_path = ICONS_DIR / dir_name / "ic_launcher_foreground.png"
    if not fg_path.exists():
        return False

    img = Image.open(fg_path).convert("RGBA")
    current_size = img.size[0]  # 假设正方形

    # 如果图片已经是正确尺寸且有透明边距，跳过
    if current_size == target_size:
        # 检查是否已有 padding（检查四角是否透明）
        pixels = img.load()
        corner_alpha = pixels[0, 0][3] if pixels else 255
        if corner_alpha == 0:
            print(f"  [SKIP] {dir_name}/ic_launcher_foreground.png (already padded)")
            return False

    # 计算安全区域内的图标大小
    icon_size = int(target_size * SAFE_ZONE_RATIO)

    # 缩放原图到安全区域大小
    resized = img.resize((icon_size, icon_size), Image.LANCZOS)

    # 创建目标尺寸的透明画布
    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))

    # 居中粘贴
    offset = (target_size - icon_size) // 2
    canvas.paste(resized, (offset, offset), resized)

    # 保存
    canvas.save(fg_path, "PNG", optimize=True)
    print(f"  [FIX] {dir_name}/ic_launcher_foreground.png ({current_size}px -> {target_size}px canvas, {icon_size}px icon)")
    return True


def main() -> int:
    print("=" * 60)
    print("Fix Android Adaptive Icon foreground padding")
    print("=" * 60)

    if not ICONS_DIR.exists():
        print(f"[ERROR] Icons directory not found: {ICONS_DIR}")
        return 1

    fixed = 0

    # 修复 mipmap 目录
    for dir_name, target_size in FOREGROUND_SIZES.items():
        if fix_foreground(dir_name, target_size):
            fixed += 1

    # 修复 legacy 目录
    for dir_name, target_size in LEGACY_DIRS.items():
        if fix_foreground(dir_name, target_size):
            fixed += 1

    if fixed > 0:
        print(f"\n[OK] Fixed {fixed} foreground icons with proper adaptive padding.")
    else:
        print("\n[OK] All foreground icons already have correct padding (or Pillow not available).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
