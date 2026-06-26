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

在 `.github/workflows/release.yml` 和 `.github/workflows/dev-build.yml` 中，统一调用 `scripts/ci/sign_android_apk.sh`：

1. 从 Secret `ANDROID_KEYSTORE_BASE64` 解码 keystore（须与本地 `release-key.jks` 一致）
2. 使用以下 Secret；**未设置时回退为文档默认值**，与历史硬编码行为一致：
   - `ANDROID_KEYSTORE_PASSWORD` → 默认 `android`
   - `ANDROID_KEY_ALIAS` → 默认 `mini-hbut`
   - `ANDROID_KEY_PASSWORD` → 默认 `android`
3. 校验证书 **SHA-256 指纹** 必须为 `8E:E9:9F:A4:93:1C:51:35:A9:4D:26:6A:C9:C3:FF:F5:6C:19:97:EB:B7:BA:41:82:6F:6D:51:9D:FC:20:18:E8`，不匹配则构建失败（避免错误密钥导致无法覆盖安装）
4. zipalign + apksigner 签名
5. **不再**在 CI 中生成临时 keystore

## 设置 GitHub Secret

将 `keystore-base64.txt` 的内容设置为仓库 Secret：

1. 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 新建 secret，名称为 `ANDROID_KEYSTORE_BASE64`
3. 粘贴 `keystore-base64.txt` 的内容

建议同时配置（若与下表相同可省略，脚本会自动使用默认值）：

| Secret | 推荐值 |
|--------|--------|
| `ANDROID_KEYSTORE_PASSWORD` | `android` |
| `ANDROID_KEY_ALIAS` | `mini-hbut` |
| `ANDROID_KEY_PASSWORD` | `android` |

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
