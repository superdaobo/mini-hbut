#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重新生成 Android 启动图标，修复安装器灰底、小图标和 adaptive 裁切问题。

Android 会同时使用两套资源：
- legacy `ic_launcher.png`：部分安装器/低版本系统直接展示它，必须是不透明白底。
- adaptive `ic_launcher_foreground.png`：Android 8+ 会和白色 background 组合并裁切蒙版，
  前景必须完整落入 72dp 安全区，不能贴 108dp 画布边缘。
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[ERROR] Pillow 未安装，无法生成 Android 图标。请执行: python -m pip install Pillow")
    sys.exit(1)


PROJECT_DIR = Path(__file__).resolve().parent.parent
ICONS_DIR = PROJECT_DIR / "src-tauri" / "icons" / "android"

SOURCE_CANDIDATES = [
    PROJECT_DIR / "src-tauri" / "icons" / "source" / "official_badge.png",
    PROJECT_DIR / "public" / "splash" / "app_icon.png",
    PROJECT_DIR / "src-tauri" / "icons" / "ios" / "AppIcon-512@2x.png",
]

DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

LEGACY_SCALE = 1.0
ADAPTIVE_SAFE_ZONE_RATIO = 72 / 108
LAUNCHER_BACKGROUND_RGB = (61, 136, 252)
LAUNCHER_BACKGROUND_HEX = "#3D88FC"


def resolve_source() -> Path:
    for candidate in SOURCE_CANDIDATES:
        if candidate.exists():
            return candidate
    searched = "\n  - ".join(str(path) for path in SOURCE_CANDIDATES)
    raise FileNotFoundError(f"Android 图标源图不存在，已查找:\n  - {searched}")


def crop_transparent_padding(source: Image.Image) -> Image.Image:
    bbox = source.getbbox()
    if bbox is None:
        return source
    return source.crop(bbox)


def fit_image(source: Image.Image, canvas_size: int, scale: float, background: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), background)
    source = crop_transparent_padding(source.convert("RGBA"))
    content_size = max(1, round(canvas_size * scale))
    resized = source.resize((content_size, content_size), Image.Resampling.LANCZOS)
    offset = (canvas_size - content_size) // 2

    if background[3] == 255:
        canvas.alpha_composite(resized, (offset, offset))
    else:
        canvas.paste(resized, (offset, offset), resized)
    return canvas


def save_png(image: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "PNG", optimize=True)


def write_launcher_xml() -> None:
    anydpi_dir = ICONS_DIR / "mipmap-anydpi-v26"
    anydpi_dir.mkdir(parents=True, exist_ok=True)
    icon_xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
    (anydpi_dir / "ic_launcher.xml").write_text(icon_xml, encoding="utf-8")
    (anydpi_dir / "ic_launcher_round.xml").write_text(icon_xml, encoding="utf-8")

    values_dir = ICONS_DIR / "values"
    values_dir.mkdir(parents=True, exist_ok=True)
    (values_dir / "ic_launcher_background.xml").write_text(
        f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">{LAUNCHER_BACKGROUND_HEX}</color>
</resources>
""",
        encoding="utf-8",
    )


def generate_icons() -> int:
    source_path = resolve_source()
    source = Image.open(source_path).convert("RGBA")

    written = 0
    for density, (legacy_size, foreground_size) in DENSITIES.items():
        # 两套目录都保留，避免 Capacitor/Tauri/手动 Gradle 构建取到不同资源。
        for dir_name in (density, f"mipmap-{density}"):
            target_dir = ICONS_DIR / dir_name

            legacy_icon = fit_image(source, legacy_size, LEGACY_SCALE, (*LAUNCHER_BACKGROUND_RGB, 255))
            save_png(legacy_icon, target_dir / "ic_launcher.png")
            save_png(legacy_icon, target_dir / "ic_launcher_round.png")
            written += 2

            foreground = fit_image(
                source,
                foreground_size,
                ADAPTIVE_SAFE_ZONE_RATIO,
                (255, 255, 255, 0),
            )
            save_png(foreground, target_dir / "ic_launcher_foreground.png")
            written += 1

    write_launcher_xml()
    print(f"[icon-gen] Android launcher icons regenerated from {source_path} ({written} PNG files).")
    return 0


if __name__ == "__main__":
    sys.exit(generate_icons())
