#!/usr/bin/env bash
set -euo pipefail

# App Store Connect 自 2026 年起要求使用 iOS 26 SDK（Xcode 26+）构建。
XCODE_CANDIDATES=(
  /Applications/Xcode_26.6.app
  /Applications/Xcode_26.6_Release_Candidate_2.app
  /Applications/Xcode_26.6.0.app
  /Applications/Xcode_26.5.app
  /Applications/Xcode_26.4.1.app
  /Applications/Xcode_26.4.app
)

for xcode_app in "${XCODE_CANDIDATES[@]}"; do
  if [ -d "$xcode_app" ]; then
    sudo xcode-select -s "$xcode_app"
    echo "Switched to $(xcodebuild -version)"
    xcodebuild -showsdks | grep -i iphoneos || true
    exit 0
  fi
done

echo "::error::No Xcode 26+ installation found. App Store Connect requires iOS 26 SDK."
echo "Available Xcode installations:"
ls -d /Applications/Xcode*.app 2>/dev/null || true
exit 1
