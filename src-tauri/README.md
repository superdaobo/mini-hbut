# Mini-HBUT Rust Backend (Tauri)

`src-tauri` 是 Mini-HBUT 的后端与打包入口，负责登录会话、教务/电费请求、缓存数据库、本地 HTTP Bridge 和多平台构建。

## 目录说明

```text
src-tauri/
  src/
    lib.rs                 # Tauri commands 与应用启动逻辑
    http_client/           # 教务、电费、交易、全校课表等网络模块
    http_server.rs         # 本地 HTTP Bridge（默认 127.0.0.1:4399）
    db.rs                  # SQLite 缓存与会话
  icons/
    ios/                   # iOS AppIcon 资源
  tauri.conf.json          # Tauri 配置
  Cargo.toml               # Rust 依赖与特性
```

## 本地开发

```bash
npm install
npm run tauri dev
```

## 构建产物

- Windows: `Mini-HBUT_<version>_x64-setup.exe` / `Mini-HBUT_<version>_x64_en-US.msi`
- macOS: `Mini-HBUT_<version>_universal.dmg`
- Android: `Mini-HBUT_<version>_arm64.apk`
- iOS: `Mini-HBUT_<version>_iOS.ipa`（未签名）
- Linux: `Mini-HBUT_<version>_amd64.AppImage` / `Mini-HBUT_<version>_amd64.deb`

统一下载地址：`https://github.com/superdaobo/mini-hbut/releases`

## iOS 侧载安装（iLoader + LiveContainer + SideStore）

以下流程用于把 CI 产出的未签名 `IPA` 安装到 iPhone。

### 1. 前置条件

- 一台 iPhone（已登录 Apple ID）
- 一台电脑（Windows 或 macOS）
- 数据线或同一局域网（用于首次配对）
- 已下载 `Mini-HBUT_<version>_iOS.ipa`

### 2. 安装 SideStore

1. 在电脑端安装并运行 SideStore 配套的配对工具（SideServer/Jitter 相关组件按官方文档配置）。
2. 在 iPhone 安装 SideStore（通过官方推荐安装方式完成首次签名）。
3. 打开 iPhone 设置：`设置 > 通用 > VPN 与设备管理`，信任对应开发者证书。
4. 首次打开 SideStore，确认可正常刷新应用签名。

### 3. 在 SideStore 安装 LiveContainer 与 iLoader

1. 打开 SideStore 的应用源/商店，安装 `LiveContainer`。
2. 在 SideStore 中安装 `iLoader`（若商店无该项，可通过 IPA 手动导入方式安装）。
3. 启动一次 `LiveContainer` 与 `iLoader`，确认没有证书报错。

### 4. 导入并签名 Mini-HBUT IPA

1. 将 `Mini-HBUT_<version>_iOS.ipa` 分享到 iPhone（AirDrop/网盘/文件 App）。
2. 在 `iLoader` 中选择该 IPA，执行导入与签名。
3. 导入后，按 iLoader 提示把应用安装到 `LiveContainer` 或直接安装到系统桌面。
4. 回到 SideStore，执行一次刷新，确保签名有效期正常。

### 5. 首次启动校验

1. 打开 Mini-HBUT，确认首页可加载（不应出现 `localhost:1420` 或 `tauri://localhost` 错误）。
2. 登录后测试：
   - 电费查询
   - 交易记录
   - 课表导出（会写入应用缓存目录）

### 6. 常见问题

- 提示“无法验证应用完整性”：
  - 重新信任证书并在 SideStore 刷新签名。
- 提示 “AFC was unable to manage files / invalid pairing”：
  - 重新完成手机与电脑配对，再重试 SideStore 刷新。
- 提示打开即请求 `localhost:1420`：
  - 使用最新 Release 的 IPA，旧包可能是开发模式构建。

## 说明：缓存与导出目录

- SQLite 数据库默认写入应用可写目录（`AppData`）。
- 课表导出 `.ics` 默认写入应用缓存目录（`AppCache/exports`）。
- 移动端不再使用进程当前目录，避免只读文件系统错误。
