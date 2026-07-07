#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从官方源图重新生成 iOS 图标，并产出 App Store 专用不透明图标。

与 Android 的 fix_android_adaptive_icons.py 对齐，优先使用 official_badge.png，
避免 iOS 仍停留在旧的 icon.png 版本。
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
    PROJECT_DIR
    / "ios"
    / "App"
    / "App"
    / "Assets.xcassets"
    / "AppIcon.appiconset"
    / "AppIcon-512@2x.png"
)

SOURCE_CANDIDATES = [
    PROJECT_DIR / "src-tauri" / "icons" / "source" / "official_badge.png",
    PROJECT_DIR / "public" / "splash" / "app_icon.png",
    PROJECT_DIR / "src-tauri" / "icons" / "icon.png",
]

APP_STORE_ICON_PAIRS = {
    "AppIcon-512@2x.png": "AppIcon-512@2x-appstore.png",
    "AppIcon-1024x1024@1x.png": "AppIcon-1024x1024@1x-appstore.png",
}

APP_STORE_BACKGROUND = (61, 136, 252)
ICON_SCALE = 1.0


def resolve_source() -> Path:
    for candidate in SOURCE_CANDIDATES:
        if candidate.exists():
            return candidate
    searched = "\n  - ".join(str(path) for path in SOURCE_CANDIDATES)
    raise FileNotFoundError(f"iOS 图标源图不存在，已查找:\n  - {searched}")


def crop_transparent_padding(source: Image.Image) -> Image.Image:
    bbox = source.getbbox()
    if bbox is None:
        return source
    return source.crop(bbox)


def fit_image(
    source: Image.Image,
    canvas_size: int,
    scale: float,
    background: tuple[int, int, int, int],
) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), background)
    artwork = crop_transparent_padding(source.convert("RGBA"))
    content_size = max(1, round(canvas_size * scale))
    resized = artwork.resize((content_size, content_size), Image.Resampling.LANCZOS)
    offset = (canvas_size - content_size) // 2
    canvas.alpha_composite(resized, (offset, offset))
    return canvas


def save_png(image: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "PNG", optimize=True)


def regenerate_ios_icons() -> int:
    source_path = resolve_source()
    source = Image.open(source_path).convert("RGBA")
    written = 0

    for target_path in sorted(IOS_ICON_DIR.glob("*.png")):
        if target_path.name.endswith("-appstore.png"):
            continue

        with Image.open(target_path) as existing:
            canvas_size = max(existing.size)
        regenerated = fit_image(source, canvas_size, ICON_SCALE, (0, 0, 0, 0))
        save_png(regenerated, target_path)
        written += 1

    print(
        f"[icon-gen] iOS icons regenerated from {source_path.relative_to(PROJECT_DIR)} "
        f"({written} PNG files)."
    )
    return written


def flatten_to_appstore(source_path: Path, target_path: Path) -> bool:
    with Image.open(source_path) as image:
        flattened = Image.new("RGB", image.size, APP_STORE_BACKGROUND)
        flattened.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[3])
        target_path.parent.mkdir(parents=True, exist_ok=True)
        flattened.save(target_path, "PNG", optimize=True)
        return True


def generate_app_store_icons() -> int:
    changed = 0
    for source_name, target_name in APP_STORE_ICON_PAIRS.items():
        source_path = IOS_ICON_DIR / source_name
        target_path = IOS_ICON_DIR / target_name
        if not source_path.exists():
            print(f"[icon-fix] 跳过缺失源图: {source_path}")
            continue
        if flatten_to_appstore(source_path, target_path):
            changed += 1
            print(
                f"[icon-fix] 已生成 App Store 图标: {target_path.relative_to(PROJECT_DIR)}"
            )

    primary_source = IOS_ICON_DIR / "AppIcon-512@2x.png"
    primary_target = IOS_ICON_DIR / "AppIcon-512@2x-appstore.png"
    if primary_source.exists() and primary_target.exists():
        if flatten_to_appstore(primary_source, CAPACITOR_ICON):
            changed += 1
            print(
                f"[icon-fix] 已同步 Capacitor 图标: {CAPACITOR_ICON.relative_to(PROJECT_DIR)}"
            )

    return changed


def main() -> int:
    if not IOS_ICON_DIR.is_dir():
        print(f"[ERROR] iOS 图标目录不存在: {IOS_ICON_DIR}")
        return 1

    try:
        regenerate_ios_icons()
        changed = generate_app_store_icons()
    except FileNotFoundError as error:
        print(f"[ERROR] {error}")
        return 1

    if changed == 0:
        print("[icon-fix] App Store 图标已同步。")
    else:
        print(f"[icon-fix] 共更新 {changed} 个 App Store 图标。")
    return 0


if __name__ == "__main__":
    sys.exit(main())