# iOS 工程接入文档（BGAppRefresh，需 macOS/CI 执行）

> 状态：#613 已完成 Swift 实现与测试源码（Windows 本机无法构建/验证 Swift）。
> 本文档所有「Xcode 生成 / Info.plist / AppDelegate 接线 / 真机验证」步骤
> **必须在 macOS + Xcode 环境（开发者本机或 CI）执行**。
> 已尝试 `npx tauri ios init`：Windows 上 Tauri CLI 无 `ios` 子命令，确认不可用。

---

## 1. 背景与结论

- `src-tauri/gen/` 当前只有 `android/` 与 `schemas/`，**无 `ios/`**；仓库根 `ios/` 是旧 Capacitor 工程（不可混淆、不修改）。
- 本插件 `ios/` 目录是 SPM 包（`HbutBackgroundPlugin`），已包含 #613 完整实现：
  BGAppRefresh 注册/调度、GradeSignatureV1、Keychain 安全存储、最小 HTTP 检查、
  baseline/diff、本地通知、事件 inbox、状态机与全部单测源码。
- 接入 = ① 生成 Tauri iOS 工程 → ② 配置 Info.plist → ③ AppDelegate 接线 →
  ④ 把插件源码/SPM 依赖并入 Xcode target → ⑤ 真机验证。

---

## 2. 生成 Tauri iOS 工程（macOS）

```bash
# 在 macOS 上执行（Windows 不可用）
cd <repo>/src-tauri
npx tauri ios init
```

预期产物：`src-tauri/gen/ios/`（Xcode 工程 + 由 `tauri.conf.json` identifier
`com.hbut.mini` 生成的 bundle id）。生成后：

- 确认 Xcode target 的 `Signing & Capabilities` 添加 **Background Modes** capability；
- 项目其余配置（图标/版本）由 tauri.conf.json 生成，如无特殊需求不改。

---

## 3. Info.plist 配置（BGAppRefresh 必需）

在生成的 Xcode target 的真实 Info.plist（`src-tauri/gen/ios/app/Sources/Info.plist`
或生成工程内 Info.plist）添加：

```xml
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
</array>
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.hbut.mini.background.grades-refresh</string>
</array>
```

说明：

- `BGTaskSchedulerPermittedIdentifiers` 必须与
  `BackgroundTaskScheduler.taskIdentifier` 完全一致（代码内唯一值，
  见 `Sources/HbutBackgroundPlugin/BackgroundTaskScheduler.swift`）。
- `UIBackgroundModes` 只加 `fetch`（BGAppRefresh 要求），**不加 `processing`**
  （BGProcessingTask 非本项目目标）；旧 Capacitor 配置（`com.transistorsoft.fetch`
  等）属于历史工程，不复制到新 target（#616 退场）。
- App Store 审核注意：`fetch` 模式必须有真实用途与合理触发频率——
  本项目用途即「成绩变化检查」，且按 Best Effort 设计，不得承诺固定周期。

---

## 4. AppDelegate 生命周期接线（关键：注册必须在启动早期）

BGAppRefresh 的 handler **必须在应用启动生命周期内注册**，不能等 Vue mounted。

在生成的 Tauri iOS target 的 `AppDelegate`（或等价入口，
`src-tauri/gen/ios/app/Sources/AppDelegate.swift`）中：

```swift
import HbutBackgroundPlugin

func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {
    // #613：注册 BGAppRefresh identifier/handler + launch 修复缺失调度（幂等）
    HbutBackgroundPlugin.registerBackgroundTask()
    return true
}
```

`registerBackgroundTask()` 内部完成：

1. `BGTaskScheduler.shared.register`（幂等，重复调用安全）；
2. `repairSchedule`：enabled 但系统无 pending request 时补提交。

生命周期语义（issue 验收）：

```text
App 初始化 → 注册 task identifier/handler（不依赖 Vue mounted）
→ 用户启用且 context ready → 提交 BGAppRefreshTaskRequest
→ 系统执行 → handler：expiration handler 就位 → 尽早重调度下一次
  → enabled 检查（历史 pending 快速 no-op）→ 最小成绩检查 → setTaskCompleted
```

---

## 5. 插件源码并入 Xcode target

两种方式（推荐 A）：

- **A（SPM 本地包）**：Xcode → File → Add Package Dependencies →
  Add Local → 选择 `src-tauri/plugins/tauri-plugin-hbut-background/ios`。
  App target 链接 `HbutBackgroundPlugin` product。
- **B（源码复制）**：把 `ios/Sources/HbutBackgroundPlugin/*.swift` 复制进
  App target（注意模块内 public 可见性仍可用，但失去 SPM 边界）。

无论哪种方式，**不要在 Xcode 中修改业务源码**；源码唯一事实源在
`src-tauri/plugins/tauri-plugin-hbut-background/ios/`（后续以 git 同步）。

---

## 6. Rust ↔ Swift 桥接入点（需主 Agent 收口，不在本 Agent 写边界内）

本 Agent 未改动 `src-tauri/plugins/tauri-plugin-hbut-background/src/**`（#613 写边界）。
Rust `mobile.rs` 的 ios 分支目前仍返回 synthetic（#611 状态）。接入 BGTask 真实业务时：

1. `mobile.rs` ios 分支改为 FFI/`swift-rs` 调用本插件入口（方法签名与 Kotlin 桥对齐）：
   `configure / disable / syncContext / setSecureEnvelope / runNow / getStateJson /
   consumeEvents / clearContext`（均返回 JSON 字符串）。
2. **安全材料写入**：Rust 会话层把「已完成认证的最小请求材料」
   （endpoint + 认证头等）经 `setSecureEnvelope` 写入 Keychain
   （`SecureStore`，按 scope 隔离；明文密码不得交给 Swift，#608 红线 2）。
3. `registerBackgroundTask()` 由 AppDelegate 直接调用（不依赖桥），
   其余入口由 Rust 经桥转发。

---

## 7. 真机验证清单（人工执行；不作为 CI 失败项）

iOS 后台行为系统决定，以下为人工验收项（BGTask 可用系统调试触发）：

```text
LLDB: e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.hbut.mini.background.grades-refresh"]
```

1. **后台触发**：App 进后台后系统调度 BGAppRefresh → 完成一次检查并 `setTaskCompleted`；
2. **锁屏**：锁屏后系统调度仍可完成检查；
3. **系统调试触发**：上述 LLDB 命令触发，验证 handler/expiration/重调度链路；
4. **断网**：检查结果 = 网络不可用状态，任务正确结束，不重试循环；
5. **通知权限关闭**：设置页关闭通知 → 变化检测业务成功、`notificationShown=false`；
6. **feature 关闭 + App resume**：disable 后历史 pending 不执行业务；
   resume 后 `repairSchedule` 修复调度；首次 baseline 不通知；同变化不重复通知。

---

## 8. 不作为失败的项（Best Effort 边界，#608 红线 6）

- 系统不按 15/30 分钟精确触发 BGAppRefresh；
- 长时间低使用频率时被 iOS 延后；
- 用户强制结束 App（force quit）后后台执行不发生。

真正验收点：**当系统给予 BGAppRefresh 执行机会时，能在有限预算内安全、幂等地
完成一次成绩变化检测并正确结束任务。**

---

## 9. 剩余风险

- `tauri ios init` 生成的 target 结构与上述路径可能随 Tauri 版本变化，以实际生成为准；
- GradeSignatureV1 fixture 已与 #612 冻结版（`contract-fixtures/grades-signature-v1.json`）对齐：
  三端签名一致（已独立复算 7 个 case）；本地 `Tests/.../Fixtures/` 仅作回退；
- 教务接口响应形状未知：`URLSessionGradesFetcher.parseGrades` 支持
  数组 / `data|grades|result|list` 包裹，真实接口联调时如需调整 parser 属预期变更；
- Keychain 访问组（App Groups）未启用，纯单 App 场景足够；如需 widget 共享另议。
