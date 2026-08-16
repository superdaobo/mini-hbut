#!/usr/bin/env bash
# 使用仓库 Secrets 对齐并签名 Android APK，并校验证书指纹以确保可覆盖安装。
set -euo pipefail

OUTPUT_APK="${OUTPUT_APK:?OUTPUT_APK is required}"
APK_SEARCH_ROOT="${APK_SEARCH_ROOT:-src-tauri/gen/android/app/build/outputs/apk}"
REQUIRE_KEYSTORE="${REQUIRE_KEYSTORE:-true}"

KS_ALIAS="${ANDROID_KEY_ALIAS:-mini-hbut}"
KS_STORE_PASS="${ANDROID_KEYSTORE_PASSWORD:-android}"
KS_KEY_PASS="${ANDROID_KEY_PASSWORD:-android}"

# release-key.jks / mini-hbut 证书的 SHA-256（与 docs/android-signing.md 一致）
EXPECTED_CERT_SHA256="${EXPECTED_CERT_SHA256:-8EE99FA4931C5135A94D266AC9C3FFF56C1997EBB7BA41826F6D519DFC2018E8}"

if [ "$REQUIRE_KEYSTORE" = "true" ] && [ -z "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  echo "ERROR: ANDROID_KEYSTORE_BASE64 secret is required."
  exit 1
fi

if [ -z "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  echo "ERROR: ANDROID_KEYSTORE_BASE64 is empty; refusing to sign with a generated keystore."
  exit 1
fi

echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > release-key.jks
chmod 600 release-key.jks

if ! keytool -list -keystore release-key.jks -storepass "$KS_STORE_PASS" -alias "$KS_ALIAS" >/dev/null 2>&1; then
  echo "ERROR: Cannot read keystore with alias '$KS_ALIAS'. Check ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS secrets."
  exit 1
fi

ACTUAL_FP="$(
  keytool -list -v -keystore release-key.jks -storepass "$KS_STORE_PASS" -alias "$KS_ALIAS" 2>/dev/null \
    | awk -F': ' '/SHA256:/{print $2; exit}' \
    | tr -d ':' \
    | tr '[:lower:]' '[:upper:]'
)"

if [ -z "$ACTUAL_FP" ]; then
  echo "ERROR: Failed to read certificate SHA-256 fingerprint."
  exit 1
fi

if [ "$ACTUAL_FP" != "$EXPECTED_CERT_SHA256" ]; then
  echo "ERROR: Keystore certificate fingerprint mismatch — APK would NOT be upgradable over existing installs."
  echo "Expected: $EXPECTED_CERT_SHA256"
  echo "Actual:   $ACTUAL_FP"
  exit 1
fi

echo "Keystore verified (SHA-256: $ACTUAL_FP)"

UNSIGNED_APK="$(find "$APK_SEARCH_ROOT" -name '*.apk' | head -n 1 || true)"
if [ -z "$UNSIGNED_APK" ]; then
  echo "No unsigned APK found under $APK_SEARCH_ROOT"
  find "$APK_SEARCH_ROOT" -maxdepth 6 -type f -print 2>/dev/null || true
  exit 1
fi

BUILD_TOOLS="${ANDROID_SDK_ROOT}/build-tools/35.0.0"
if [ ! -x "$BUILD_TOOLS/zipalign" ] || [ ! -x "$BUILD_TOOLS/apksigner" ]; then
  echo "ERROR: Android build-tools 35.0.0 not found under ANDROID_SDK_ROOT."
  exit 1
fi

echo "Signing: $UNSIGNED_APK -> $OUTPUT_APK"
"$BUILD_TOOLS/zipalign" -v -p 4 "$UNSIGNED_APK" app-aligned.apk
"$BUILD_TOOLS/apksigner" sign \
  --ks release-key.jks \
  --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_STORE_PASS" \
  --key-pass "pass:$KS_KEY_PASS" \
  --out "$OUTPUT_APK" \
  app-aligned.apk
"$BUILD_TOOLS/apksigner" verify -v "$OUTPUT_APK"
ls -lh "$OUTPUT_APK"

rm -f release-key.jks app-aligned.apk
