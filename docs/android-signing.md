# Android APK 签名说明

## Keystore 信息

| 属性 | 值 |
|------|-----|
| 文件名 | `release-key.jks` |
| 别名 (alias) | `mini-hbut` |
| Store 密码 | `android` |
| Key 密码 | `android` |
| 算法 | RSA 2048 |
| 有效期 | 10000 天 |
| DN | `CN=Mini-HBUT, OU=HBUT, O=HBUT, L=Wuhan, ST=Hubei, C=CN` |

## 文件说明

- **`release-key.jks`** — 二进制 keystore 文件，直接用于本地签名
- **`keystore-base64.txt`** — keystore 的 Base64 编码，用于 CI/CD（GitHub Actions secret `ANDROID_KEYSTORE_BASE64`）

## 本地签名流程

### 方式一：使用构建脚本（Capacitor 项目）

```bash
python build_android_apk.py --release
```

此脚本会自动完成 Web 构建 → Capacitor 同步 → Gradle assembleRelease，但不会自动签名。
构建产物在 `android/app/build/outputs/apk/release/` 下。

### 方式二：使用 Tauri Android 构建

```bash
npm run tauri android build -- --target aarch64 --apk true
```

产物在 `src-tauri/gen/android/app/build/outputs/apk/` 下。

### 手动签名步骤

1. **对齐 APK**（zipalign）

```bash
zipalign -v -p 4 app-unsigned.apk app-aligned.apk
```

2. **签名**（apksigner）

```bash
apksigner sign \
  --ks release-key.jks \
  --ks-key-alias mini-hbut \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out Mini-HBUT_signed.apk \
  app-aligned.apk
```

3. **验证签名**

```bash
apksigner verify -v Mini-HBUT_signed.apk
```

## CI/CD 签名（GitHub Actions）

在 `.github/workflows/release.yml` 和 `.github/workflows/dev-build.yml` 中，签名流程为：

1. 从 secret `ANDROID_KEYSTORE_BASE64` 解码 keystore：
   ```bash
   echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > release-key.jks
   ```
2. 如果 secret 为空，则生成临时 keystore（开发用途）
3. 使用 `$ANDROID_SDK_ROOT/build-tools/35.0.0/zipalign` 对齐
4. 使用 `$ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner` 签名

## 设置 GitHub Secret

将 `keystore-base64.txt` 的内容设置为仓库 Secret：

1. 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 新建 secret，名称为 `ANDROID_KEYSTORE_BASE64`
3. 粘贴 `keystore-base64.txt` 的内容

## 重新生成 Base64 编码

如果需要从 `.jks` 文件重新生成 base64：

```bash
base64 -w 0 release-key.jks > keystore-base64.txt
```

Windows (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release-key.jks")) | Set-Content keystore-base64.txt -NoNewline
```

## 注意事项

- **不要将 `release-key.jks` 提交到公开仓库**（已在 `.gitignore` 中排除）
- 更换 keystore 后需要用户卸载旧版 APK 重新安装（签名不一致无法覆盖安装）
- 本项目的签名密码均为 `android`，仅供开发和自签名分发使用
- 如需上架 Google Play，应使用更安全的密码并妥善保管 keystore
