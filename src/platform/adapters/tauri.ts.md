# Tauri原生适配层 (platform/adapters/tauri.ts)

## 1. 模块定位与职责

该模块作为 `PlatformBridge` 接口的 Tauri 实现，负责将所有的平台调用安全地转化为针对 Tauri 核心、Rust 插件 (`@tauri-apps/plugin-shell`, `@tauri-apps/plugin-notification`) 的系统级操作。

## 2. 核心能力深度适配

### 2.1 网址与深链接唤起 (`openUri`)
普通的外链跳转由 `await shell.open(target)` 完成。
但为了防止含有特殊字符（中文、空格）引发 Tauri 插件崩溃，做了**双重回退补救**：
```mermaid
graph TD
    A[传入 URL] --> B[shell.open()]
    B -- 失败 --> C[encodeURI 转码 URL]
    C --> D[重试 shell.open()]
    D -- 失败 --> E[调用自定义 Rust Invoke]
    E --> F[invoke('open_external_url', { url })]
```
这种极致防爆设计确保无论多诡异的网址，都能最终被用户的默认浏览器接管打开。

### 2.2 本地通知管理
依赖官方 `@tauri-apps/plugin-notification`：
1. `isPermissionGranted()` 与 `requestPermission()` 对齐权限状态（Granted / Denied / Prompt）。
2. 在 Windows 上强制触发右下角 Toast，并且为 Android 打底声明了 `importance: High` 与特制 Channel ("课程、考试与系统提醒")。

### 2.3 异常拦截与安全沙箱
所有 Tauri 异步调用均包裹于 `try { ... } catch { return false/default }`。因为在某些阉割版的操作系统里（例如极简版 Windows 10），系统通知组件可能失联并引发异常。兜底拦截可以防止因为“无法发通知”而导致整个前端 JS 引擎崩溃停转。