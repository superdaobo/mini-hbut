#!/usr/bin/env python3
"""断言 iOS 归档产物真的注册了 minihbut URL scheme（#1000）。

为什么必须查**归档产物**而不是源工程：
`gen/apple/**/Info.plist` 只是构建输入，Xcode 会把它拷进 `.app` 包；
scheme 注册生效与否取决于**包里的那份**（且它是二进制 plist，肉眼 grep 不可靠）。
源工程已由 `patch_ios_deep_link_scheme.mjs` 确定性写入，本脚本负责端到端的最后一环。

用法：
    python3 scripts/check_ios_archive_deep_link.py <path/to/Info.plist> [scheme]

退出码：0 = 已注册；1 = 未注册或文件不可解析。
"""

import os
import plistlib
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: check_ios_archive_deep_link.py <Info.plist> [scheme]", file=sys.stderr)
        return 1

    plist_path = sys.argv[1]
    expected = sys.argv[2] if len(sys.argv) > 2 else "minihbut"

    if not os.path.isfile(plist_path):
        print(f"[ios-deeplink] ✗ 找不到 {plist_path}", file=sys.stderr)
        return 1

    try:
        with open(plist_path, "rb") as handle:
            data = plistlib.load(handle)
    except Exception as exc:  # noqa: BLE001 - 任何解析失败都必须视为门禁失败
        print(f"[ios-deeplink] ✗ 无法解析 {plist_path}: {exc}", file=sys.stderr)
        return 1

    url_types = data.get("CFBundleURLTypes") or []
    schemes = []
    for entry in url_types:
        if isinstance(entry, dict):
            schemes.extend(entry.get("CFBundleURLSchemes") or [])

    print(f"[ios-deeplink] {plist_path} CFBundleURLSchemes = {schemes}")
    if expected not in schemes:
        print(
            f"[ios-deeplink] ✗ 归档 App 未注册 {expected} —— iOS 上 minihbut://identity 无法唤起 App",
            file=sys.stderr,
        )
        return 1

    print(f"[ios-deeplink] ✓ 归档 App 已注册 {expected}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
