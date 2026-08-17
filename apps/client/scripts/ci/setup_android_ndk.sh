#!/usr/bin/env bash
# 安装并导出固定 NDK 版本，避免 runner 预装 NDK 29 导致与 CI 不一致。
set -euo pipefail

NDK_VERSION="${ANDROID_NDK_VERSION:-27.0.11718014}"
NDK_HOME="$ANDROID_SDK_ROOT/ndk/$NDK_VERSION"

echo "Installing NDK $NDK_VERSION"
sdkmanager "ndk;$NDK_VERSION"

if [ ! -d "$NDK_HOME" ]; then
  echo "ERROR: NDK not found at $NDK_HOME"
  exit 1
fi

{
  echo "NDK_HOME=$NDK_HOME"
  echo "ANDROID_NDK_HOME=$NDK_HOME"
  echo "ANDROID_NDK_ROOT=$NDK_HOME"
} >> "$GITHUB_ENV"

echo "NDK ready: $NDK_HOME"
