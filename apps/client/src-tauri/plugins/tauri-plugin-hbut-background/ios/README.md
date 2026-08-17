# ios/ —— Swift 实现（#611 骨架 + #613 BGAppRefresh 成绩检查 MVP）

SPM 包，含 **BGAppRefresh 完整实现**：#613 的注册/调度/检查/通知/存储全部在
`Sources/HbutBackgroundPlugin/`。**Windows 无法本地构建 Swift**；本目录为
compile-level 载体：macOS 上 `swift test` 验证 DTO 契约 + 成绩 diff 状态机 +
存储/调度决策（`BackgroundTasks` 需要 macOS 13+）。

## 文件

```text
ios/
├── Package.swift                                   # SPM 包（iOS 13+ / macOS 13+）
├── INTEGRATION.md                                  # iOS 工程接入文档（Xcode/Info.plist/AppDelegate，需 macOS/CI）
├── Sources/HbutBackgroundPlugin/
│   ├── BackgroundModels.swift      # DTO Codable（与 Rust dto.rs 同构；枚举 snake_case rawValue）
│   ├── BackgroundStore.swift       # 持久化（原子写/容量/scope 清理/损坏降级 + grades baseline）
│   ├── GradeSignatureV1.swift      # 成绩 signature 业务规则（normalize/sort/hash，与 Android 同语义）
│   ├── SecureStore.swift           # Keychain 安全存储（SecureEnvelope，按 scope 隔离）
│   ├── GradesFetcher.swift         # 最小 HTTP 检查（URLSession + 错误分类 + 弹性 parser）
│   ├── GradesCheckCoordinator.swift# 检查编排状态机（baseline/diff/事件/通知/互斥/source 区分）
│   ├── BackgroundTaskScheduler.swift # BGAppRefresh 注册/调度/启停/expiration（幂等）
│   ├── NotificationPoster.swift    # 本地通知真机实现（权限只读、不后台弹窗）
│   └── HbutBackgroundPlugin.swift  # 插件入口（register/configure/disable/syncContext/runNow/…）
└── Tests/HbutBackgroundPluginTests/
    ├── ContractTests.swift          # DTO 契约测试（插件根 contract-fixtures）
    ├── GradeSignatureV1Tests.swift  # fixture 驱动（共享 #612 冻结版优先，本地 Fixtures 回退）
    ├── GradesCheckCoordinatorTests.swift # 状态机全覆盖（mock 不触网）
    ├── BackgroundStoreTests.swift   # baseline/容量/损坏降级
    ├── BackgroundTaskSchedulerTests.swift # 调度决策纯逻辑
    └── Fixtures/grades-signature-v1.json # 本地回退 fixture（与 #612 冻结版一致，三端复验）
```

## 运行测试（需 macOS + Swift 5.9+）

```bash
cd src-tauri/plugins/tauri-plugin-hbut-background/ios
swift test
```

## 平台语义

- `BackgroundCheckState` 的 platform/source 为真实 `.ios`（不伪造 ready）。
- `runNow(forceSynthetic:)` 返回开发态 synthetic 摘要；真实 `runNow` 与系统
  BGTask 复用同一 `GradesCheckCoordinator`（同目录互斥），事件 payload 记录
  `runSource: system|manual` 区分来源。
- 事件/状态存储：`{Application Support}/background/{config,context,state,events,grades-baseline}.json`；
  敏感材料只进 Keychain（`SecureStore`），不落普通文件。
- 首次成功检查只建 baseline 不通知；相同 signature 幂等不重复；变化一次
  `grades_changed` event + 一次本地通知；通知权限关闭不算业务失败。

## BGAppRefresh 生命周期（摘要，详见 INTEGRATION.md）

```text
App 初始化 → HbutBackgroundPlugin.registerBackgroundTask()（启动早期，不依赖 Vue mounted）
→ configure/syncContext（enabled && context ready → 提交 BGAppRefreshTaskRequest）
→ 系统执行 → handler：expiration handler 就位 → 尽早重调度 → enabled 检查（历史 pending no-op）
  → 最小成绩检查 → setTaskCompleted（每个 task 只完成一次）
→ disable：取消 pending request + 阻止业务
```

## #612 / 主 Agent 待办

1. Rust `mobile.rs` ios 分支由 synthetic 改为 FFI 调用本插件入口（src/** 边界，主 Agent 收口）。
2. GradeSignatureV1 fixture 已与 #612 冻结版（`contract-fixtures/grades-signature-v1.json`）对齐
   （三端签名一致）；若后续需补充跨端字段由主 Agent 协调并三端复验。
3. 真机验证按 INTEGRATION.md 第 7 节执行（不作为 CI 失败项）。
