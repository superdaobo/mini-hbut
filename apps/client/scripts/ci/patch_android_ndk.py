#!/usr/bin/env python3
"""在 tauri android init 后锁定 Gradle ndkVersion。"""
from __future__ import annotations

import os
import re
from pathlib import Path

NDK_VERSION = os.environ.get("ANDROID_NDK_VERSION", "27.0.11718014")


def patch_gradle(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text

    if "ndkVersion" not in text:
        android_match = re.search(r"android\s*\{", text)
        if android_match:
            insert = f'\n    ndkVersion = "{NDK_VERSION}"\n'
            text = text[: android_match.end()] + insert + text[android_match.end() :]

    text = re.sub(
        r'ndkVersion\s*=\s*"[^"]*"',
        f'ndkVersion = "{NDK_VERSION}"',
        text,
        count=1,
    )

    if text != original:
        path.write_text(text, encoding="utf-8")
        print(f"Patched ndkVersion in {path}")
        return True

    print(f"No ndkVersion patch needed for {path}")
    return False


def main() -> None:
    candidates = [
        Path("src-tauri/gen/android/app/build.gradle.kts"),
        Path("src-tauri/gen/android/app/build.gradle"),
    ]
    patched = False
    for candidate in candidates:
        if candidate.exists():
            patched = patch_gradle(candidate) or patched
    if not patched:
        raise SystemExit("Android Gradle file not found for NDK patch")


if __name__ == "__main__":
    main()
