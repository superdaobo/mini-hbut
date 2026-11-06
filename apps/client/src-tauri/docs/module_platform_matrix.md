# 模块运行时平台降级矩阵（T07 / #1168）

> 2026-11-05。**未实测一律 `unverified`**，不得据此宣称支持。

## 一、按平台

| 平台 | Bridge（本机内容） | 模块入口 | 数据获取 | 状态 |
|---|---|---|---|---|
| Windows | **真机已验**（debug 构建；`HBUT_HTTP_BRIDGE_PORT` 默认 4399，内容端口 **4398** 单独监听） | 本机已签名包 → 独立 origin iframe（sandbox=`allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads`） | Rust `session_fetch`（能力登记表）→ 实测 200 + 真实 JSON | ✅ 已验证（2026-11-06，见 `goal-8/evidence/realmachine-verification.md`） |
| macOS | 代码同 Windows 路径 | 同上 | 同上 | `unverified` |
| Android | 关闭（`is_http_bridge_enabled()` 为假 → 不启内容服务） | 远端白名单地址（`hbut.6661111.xyz`），Capacitor 打包路径正式产物 fail closed | 无本机会话 → 只能远端接口 / 无 | `unverified`（2026-11-06 复检：本机 `adb devices` **无设备连接**，无法实测；连接需 `ADB_LIBUSB=1`） |
| iOS | 同 Android | 同上 | 同上 | `unverified` |

## 二、降级规则（代码强制）

1. **没有 Bridge 就没有本机内容**：`canUseLocalModuleBridgePreview()` 在 Tauri 且非 Android UA 时为真；
   Android/iOS 走 Capacitor 分支，而该分支的「安装模块包」在正式产物已被 fail closed
   （`MODULE_INSTALL_UNSUPPORTED_PLATFORM`）——因此**不存在「没验签却能装」的降级路径**。
2. **远端嵌入必须过白名单**：`isTrustedRemoteModuleUrl()`（https + 白名单 host + 无 userinfo）；
   不满足 → `sourceKind='invalid'`，不给嵌入。
3. **数据能力随 Bridge 一起消失**：`session_fetch` 只在宿主主窗口存在，无 Bridge 平台没有这条链路。
4. **验签结果决定能力**：`trusted=false` 的模块即使被打开，受控请求也在本地被
   `MODULE_NOT_TRUSTED` 拦下（T9 接线）。

## 三、真实验证状态

| 项 | 状态 |
|---|---|
| Windows 上模块在 4398 加载、iframe 带 sandbox | ✅ 已验（真机 + CDP OOPIF 进模块上下文核对 origin/sandbox/CSP） |
| Windows 上四条负向（fetch 桥 / invoke 令牌命令 / 读 parent / remount 旧上下文） | ✅ 三条已验（`fetch` 桥被内容 CSP 拦 → `TypeError`；`invoke('bridge_session_token')` **永不 settle** 且主机未执行（哨兵日志对照）；`parent.document/location` → `SecurityError`）；remount 旧上下文见契约测试 |
| 11 个游戏握手/票据/尺寸上报 | **部分已验**：游戏中心可进入，但报「面板清单未发布」→ **11 个游戏入口本身取不到**（远端 `more_panel` 未发布，数据态问题非代码缺陷）。**握手机制已在真机验证**：以 `launch_surface='game_center'` 打开探针模块并让它发 `mini-hbut:game-sdk:hello(protocol_version=1)`，宿主回 `welcome{protocol_version:1, game_id}` → 协议版本闸门与回包字段在真机成立。票据/尺寸上报仍未执行（需真实面板） |
| Android 上远端模块 + 无 Bridge 行为 | **未执行**（2026-11-06：无设备连接） |
| macOS / iOS | **无环境，`unverified`** |

## 四、应用命令 ACL 收窄（2026-11-06 补齐）

Tauri v2 默认把 `invoke_handler` 注册的**应用命令**开放给所有 webview（含承载远程内容的模块窗口）。
本仓库现已收窄为「声明 + 逐命令授权」：

- `src-tauri/build.rs` 用 `AppManifest::new().commands(&[...])` 声明全部 259 个命令；
- `src-tauri/capabilities/main.json` 只对 **`main` 窗口**逐条授权 `allow-<kebab-command>`
  （Tauri 生成权限时把命令名 snake_case → kebab-case）；
- 三份清单的一致性由 `apps/client/scripts/check_tauri_command_grants.mjs` 守门，
  重新生成用 `sync_tauri_command_grants.mjs`；两者已接进 `npm run check:module-platform`（CI 的模块平台门禁）。

**注意**：这只收窄了「应用命令」。插件命令一直由 capability 管着；而模块窗口若被赋予
`initialization_script` 之外的注入能力仍需单独评审（当前三个内嵌/模块窗口均未注入本应用脚本）。
