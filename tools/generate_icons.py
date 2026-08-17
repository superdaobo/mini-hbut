#!/usr/bin/env python3
"""
图标生成脚本
从源图片生成各种尺寸的应用图标
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
ICONS_DIR = SCRIPT_DIR.parent / "apps" / "client" / "src-tauri" / "icons"
ANDROID_ICONS_DIR = ICONS_DIR / "android"
IOS_ICONS_DIR = ICONS_DIR / "ios"

# Windows/通用图标尺寸
ICON_SIZES = [32, 64, 128, 256, 512, 1024]

# 要求高清封面尺寸
SOURCE_REQUIRED_SIZE = 1024

# Windows Store 图标尺寸
STORE_SIZES = {
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

# Android 图标尺寸
ANDROID_SIZES = {
    "hdpi": 72,
    "mdpi": 48,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# iOS 图标尺寸
IOS_SIZES = [20, 29, 40, 60, 76, 83.5, 1024]

def ensure_dir(path: Path):
    """确保目录存在"""
    path.mkdir(parents=True, exist_ok=True)

def resize_image(img: Image.Image, size: int) -> Image.Image:
    """调整图片大小，保持正方形"""
    return img.resize((size, size), Image.Resampling.LANCZOS)

def generate_icons(source_path: str):
    """生成所有图标"""
    print(f"📷 加载源图片: {source_path}")
    
    # 加载源图片
    img = Image.open(source_path)
    
    # 确保是 RGBA 格式
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # 确保是正方形
    size = max(img.size)
    if img.size[0] != img.size[1]:
        new_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        offset = ((size - img.size[0]) // 2, (size - img.size[1]) // 2)
        new_img.paste(img, offset)
        img = new_img

    # 强制使用 1024x1024 作为高清封面
    if img.size[0] != SOURCE_REQUIRED_SIZE:
        img = resize_image(img, SOURCE_REQUIRED_SIZE)
    
    print(f"✅ 源图片尺寸: {img.size}")
    
    ensure_dir(ICONS_DIR)
    ensure_dir(ANDROID_ICONS_DIR)
    ensure_dir(IOS_ICONS_DIR)
    
    # 生成基础图标
    print("\n📦 生成基础图标...")
    for s in ICON_SIZES:
        icon = resize_image(img, s)
        
        if s == 32:
            icon.save(ICONS_DIR / "32x32.png")
            print(f"  ✅ 32x32.png")
        elif s == 64:
            icon.save(ICONS_DIR / "64x64.png")
            print(f"  ✅ 64x64.png")
        elif s == 128:
            icon.save(ICONS_DIR / "128x128.png")
            print(f"  ✅ 128x128.png")
        elif s == 256:
            icon.save(ICONS_DIR / "128x128@2x.png")
            print(f"  ✅ 128x128@2x.png")
        elif s == 512:
            icon.save(ICONS_DIR / "icon-512.png")
            print(f"  ✅ icon-512.png")
        elif s == 1024:
            icon.save(ICONS_DIR / "icon.png")
            print(f"  ✅ icon.png (1024x1024)")
    
    # 生成 SVG (实际上是 PNG，但作为备用)
    resize_image(img, 1024).save(ICONS_DIR / "icon.svg.png")
    
    # 生成 Windows Store 图标
    print("\n📦 生成 Windows Store 图标...")
    for name, size in STORE_SIZES.items():
        icon = resize_image(img, size)
        icon.save(ICONS_DIR / name)
        print(f"  ✅ {name}")
    
    # 生成 ICO 文件 (Windows)
    print("\n📦 生成 Windows ICO...")
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = [resize_image(img, s) for s in ico_sizes]
    ico_images[0].save(
        ICONS_DIR / "icon.ico",
        format='ICO',
        sizes=[(s, s) for s in ico_sizes]
    )
    print(f"  ✅ icon.ico")
    
    # 生成 ICNS 文件 (macOS)
    print("\n📦 生成 macOS ICNS...")
    # ICNS 需要特殊处理，这里生成 PNG 系列
    resize_image(img, 1024).save(ICONS_DIR / "icon.icns.png")
    print(f"  ✅ icon.icns (PNG fallback)")
    
    # 生成 Android 图标
    print("\n📦 生成 Android 图标...")
    for dpi, size in ANDROID_SIZES.items():
        dpi_dir = ANDROID_ICONS_DIR / dpi
        ensure_dir(dpi_dir)
        
        icon = resize_image(img, size)
        icon.save(dpi_dir / "ic_launcher.png")
        
        # 圆角版本
        icon.save(dpi_dir / "ic_launcher_round.png")
        
        # 前景图
        foreground = resize_image(img, int(size * 1.5))
        foreground.save(dpi_dir / "ic_launcher_foreground.png")
        
        print(f"  ✅ {dpi}/ ({size}px)")
    
    # 生成 iOS 图标
    print("\n📦 生成 iOS 图标...")
    for size in IOS_SIZES:
        int_size = int(size)
        icon = resize_image(img, int_size)
        
        # 1x
        icon.save(IOS_ICONS_DIR / f"AppIcon-{int_size}x{int_size}@1x.png")
        
        # 2x
        icon_2x = resize_image(img, int_size * 2)
        icon_2x.save(IOS_ICONS_DIR / f"AppIcon-{int_size}x{int_size}@2x.png")
        
        # 3x
        icon_3x = resize_image(img, int_size * 3)
        icon_3x.save(IOS_ICONS_DIR / f"AppIcon-{int_size}x{int_size}@3x.png")
        
        print(f"  ✅ {int_size}x{int_size} (@1x, @2x, @3x)")
    
    print("\n✅ 所有图标生成完成!")
    print(f"📁 输出目录: {ICONS_DIR}")

def main():
    if len(sys.argv) < 2:
        print("用法: python generate_icons.py <源图片路径>")
        print("示例: python generate_icons.py logo.png")
        sys.exit(1)
    
    source = sys.argv[1]
    if not os.path.exists(source):
        print(f"❌ 文件不存在: {source}")
        sys.exit(1)
    
    generate_icons(source)

if __name__ == "__main__":
    main()
