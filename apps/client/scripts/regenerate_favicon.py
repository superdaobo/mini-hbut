#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从官方图标重新生成 favicon.svg（#631）。

旧 favicon.svg 仍是 5bbf4e80 品牌换新前的浅蓝白旧 logo，被打进 dist/ 与
ios/App/App/public/（WebView 资源）。本脚本从 src-tauri/icons/icon.png
（官方图标源生成的 1024 透明版）缩小为 128px 内嵌 PNG，写入 favicon.svg
并同步 public/、dist/、ios/App/App/public/ 三处副本。

契约：public/favicon.svg < 80KB（src/utils/p0_multi_module_contract.spec.ts）。
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[ERROR] Pillow 未安装，请执行: python -m pip install Pillow")
    sys.exit(1)


PROJECT_DIR = Path(__file__).resolve().parent.parent

FAVICON_SOURCE = PROJECT_DIR / "src-tauri" / "icons" / "icon.png"
FAVICON_TARGETS = [
    PROJECT_DIR / "public" / "favicon.svg",
    PROJECT_DIR / "dist" / "favicon.svg",
    PROJECT_DIR / "ios" / "App" / "App" / "public" / "favicon.svg",
]

# 浏览器标签栏 favicon 实际显示 16~32px，128px 内嵌 PNG 足够清晰且体积小
FAVICON_PNG_SIZE = 128
SVG_VIEWBOX = 256  # 与旧 favicon 的 viewBox 保持一致，显示缩放友好


def regenerate_favicon() -> int:
    if not FAVICON_SOURCE.exists():
        print(f"[ERROR] 图标源不存在: {FAVICON_SOURCE}")
        return 1

    with Image.open(FAVICON_SOURCE) as master:
        resized = master.resize((FAVICON_PNG_SIZE, FAVICON_PNG_SIZE), Image.Resampling.LANCZOS)

    import io

    buffer = io.BytesIO()
    resized.save(buffer, "PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

    svg_content = "\n".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {0} {0}">'.format(SVG_VIEWBOX),
            f'  <image width="{SVG_VIEWBOX}" height="{SVG_VIEWBOX}" href="data:image/png;base64,{encoded}" />',
            "</svg>",
            "",
        ]
    )

    written = 0
    for target in FAVICON_TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(svg_content, encoding="utf-8")
        size_kb = target.stat().st_size / 1024
        print(f"[favicon] 已生成 {target.relative_to(PROJECT_DIR)} ({size_kb:.1f} KB)")
        if size_kb >= 80:
            print("[ERROR] favicon 超过 80KB 契约上限，请减小 FAVICON_PNG_SIZE")
            return 1
        written += 1

    print(f"[favicon] 共同步 {written} 个副本。")
    return 0


if __name__ == "__main__":
    sys.exit(regenerate_favicon())
