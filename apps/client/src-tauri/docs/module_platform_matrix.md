# 模块运行时平台降级矩阵（T07 / #1168）

> 2026-11-05。**未实测一律 `unverified`**，不得据此宣称支持。

## 一、按平台

| 平台 | Bridge（本机内容） | 模块入口 | 数据获取 | 状态 |
|---|---|---|---|---|
| Windows | 可用（debug 构建；`HBUT_HTTP_BRIDGE_PORT` 默认 4399，内容端口 4398） | 本机已签名包 → 独立 origin iframe（sandbox） | Rust `session_fetch`（能力登记表） | 代码通、**真机未验** |
| macOS | 代码同 Windows 路径 | 同上 | 同上 | `unverified` |
| Android | 关闭（`is_http_bridge_enabled()` 为假 → 不启内容服务） | 远端白名单地址（`hbut.6661111.xyz`），Capacitor 打包路径正式产物 fail closed | 无本机会话 → 只能远端接口 / 无 | `unverified` |
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
| Windows 上模块在 4398 加载、iframe 带 sandbox | 代码与契约测试通过；**GUI 未跑** |
| Windows 上四条负向（fetch 桥 / invoke 令牌命令 / 读 parent / remount 旧上下文） | **未执行**（`goal-8/evidence/s8-negative-test-recipe.md` 有可照抄步骤） |
| 11 个游戏握手/票据/尺寸上报 | **未执行**（`goal-8/evidence/s7-games-regression.md` 25 条 checkbox） |
| Android 上远端模块 + 无 Bridge 行为 | **未执行**（需真机 adb 连接） |
| macOS / iOS | **无环境，`unverified`** |
