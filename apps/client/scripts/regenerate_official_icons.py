#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 official_badge 重生全平台 Tauri 图标资产。

统一桌面端（icon.ico/icon.png 等）、Android、iOS 图标源，避免 Windows 任务栏/桌面
仍使用旧的 icon.png 版本。
"""

from __future__ import annotations

import base64
import io
import shutil
import struct
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[ERROR] Pillow 未安装，请执行: python -m pip install Pillow")
    sys.exit(1)


PROJECT_DIR = Path(__file__).resolve().parent.parent
ICONS_DIR = PROJECT_DIR / "src-tauri" / "icons"

SOURCE_CANDIDATES = [
    ICONS_DIR / "source" / "official_badge.png",
    PROJECT_DIR / "public" / "splash" / "app_icon.png",
    ICONS_DIR / "icon.png",
]

ROOT_PNG_TARGETS = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon-512.png": 512,
    "icon.png": 1024,
    "icon.svg.png": 1024,
    "icon.icns.png": 1024,
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

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
ICO_REUSE_MAP = {
    32: "32x32.png",
    64: "64x64.png",
    128: "128x128.png",
    256: "128x128@2x.png",
}

ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]
MASTER_CANVAS = 1024
MASTER_SCALE = 1.0


def resolve_source() -> Path:
    for candidate in SOURCE_CANDIDATES:
        if candidate.exists():
            return candidate
    searched = "\n  - ".join(str(path) for path in SOURCE_CANDIDATES)
    raise FileNotFoundError(f"官方图标源图不存在，已查找:\n  - {searched}")


def crop_transparent_padding(source: Image.Image) -> Image.Image:
    bbox = source.getbbox()
    if bbox is None:
        return source
    return source.crop(bbox)


def fit_image(source: Image.Image, canvas_size: int, scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    artwork = crop_transparent_padding(source.convert("RGBA"))
    content_size = max(1, round(canvas_size * scale))
    resized = artwork.resize((content_size, content_size), Image.Resampling.LANCZOS)
    offset = (canvas_size - content_size) // 2
    canvas.alpha_composite(resized, (offset, offset))
    return canvas


def save_png(master: Image.Image, target: Path, size: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fitted = master if master.size == (size, size) else master.resize((size, size), Image.Resampling.LANCZOS)
    fitted.save(target, "PNG", optimize=True)


def regenerate_desktop_pngs(master: Image.Image) -> None:
    for filename, size in ROOT_PNG_TARGETS.items():
        save_png(master, ICONS_DIR / filename, size)

    svg_target = ICONS_DIR / "icon.svg"
    encoded = base64.b64encode((ICONS_DIR / "icon.png").read_bytes()).decode("ascii")
    svg_target.write_text(
        "\n".join(
            [
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
                f'  <image width="1024" height="1024" href="data:image/png;base64,{encoded}" />',
                "</svg>",
                "",
            ]
        ),
        encoding="utf-8",
    )


def regenerate_icon_ico(master: Image.Image) -> None:
    frames: list[tuple[int, bytes]] = []
    for size in ICO_SIZES:
        reuse_name = ICO_REUSE_MAP.get(size)
        if reuse_name:
            frame_bytes = (ICONS_DIR / reuse_name).read_bytes()
        else:
            buffer = io.BytesIO()
            master.resize((size, size), Image.Resampling.LANCZOS).save(buffer, format="PNG", optimize=True)
            frame_bytes = buffer.getvalue()
        frames.append((size, frame_bytes))

    ico_path = ICONS_DIR / "icon.ico"
    with ico_path.open("wb") as handle:
        handle.write(struct.pack("<HHH", 0, 1, len(frames)))
        image_offset = 6 + (len(frames) * 16)
        for size, frame_bytes in frames:
            directory_size = 0 if size == 256 else size
            handle.write(struct.pack("<BBBBHHII", directory_size, directory_size, 0, 0, 1, 32, len(frame_bytes), image_offset))
            image_offset += len(frame_bytes)
        for _, frame_bytes in frames:
            handle.write(frame_bytes)

    if ico_path.stat().st_size < 4096:
        raise RuntimeError(f"生成的 icon.ico 异常偏小: {ico_path.stat().st_size} bytes")


def regenerate_icon_icns(master: Image.Image) -> None:
    if sys.platform != "darwin":
        print("[icon-gen] 跳过 icon.icns（非 macOS 环境）")
        return

    iconset_dir = PROJECT_DIR / ".tmp-official-icon.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir(parents=True, exist_ok=True)

    for size in ICNS_SIZES:
        save_png(master, iconset_dir / f"icon_{size}x{size}.png", size)
        if size <= 512:
            double = size * 2
            save_png(master, iconset_dir / f"icon_{size}x{size}@2x.png", double)

    icns_path = ICONS_DIR / "icon.icns"
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)],
        check=True,
    )
    shutil.rmtree(iconset_dir, ignore_errors=True)


def run_platform_scripts() -> None:
    subprocess.run(
        [sys.executable, "scripts/fix_android_adaptive_icons.py"],
        check=True,
        cwd=PROJECT_DIR,
    )
    subprocess.run(
        [sys.executable, "scripts/fix_ios_app_icons.py"],
        check=True,
        cwd=PROJECT_DIR,
    )


def main() -> None:
    source_path = resolve_source()
    print(f"[icon-gen] source={source_path.relative_to(PROJECT_DIR)}")

    source_image = Image.open(source_path)
    master = fit_image(source_image, MASTER_CANVAS, MASTER_SCALE)

    regenerate_desktop_pngs(master)
    regenerate_icon_ico(master)
    regenerate_icon_icns(master)
    run_platform_scripts()

    print("[icon-gen] Official icon assets regenerated.")


if __name__ == "__main__":
    main()
