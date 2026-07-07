#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""兼容入口：仅生成 App Store 不透明图标。

完整 iOS 图标再生请使用 scripts/fix_ios_app_icons.py。
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def main() -> int:
    script_path = Path(__file__).with_name("fix_ios_app_icons.py")
    spec = importlib.util.spec_from_file_location("fix_ios_app_icons", script_path)
    if spec is None or spec.loader is None:
        print(f"[ERROR] 无法加载脚本: {script_path}")
        return 1

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    changed = module.generate_app_store_icons()

    if changed == 0:
        print("[icon-fix] App Store 图标已同步。")
    else:
        print(f"[icon-fix] 共更新 {changed} 个 App Store 图标。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
