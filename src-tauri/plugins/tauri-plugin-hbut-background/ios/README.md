# ios/ —— Swift 骨架（#611）

Swift 插件骨架 + SPM 包。**不含真实 BGAppRefresh 成绩逻辑（#613 范围）**。
Windows 无法本地构建 Swift；本目录为 compile-level contract 载体：macOS 上 `swift test` 验证
DTO 与 Rust/Kotlin 契约一致（同一份 contract-fixtures）。

## 文件

```text
ios/
├── Package.swift                                   # SPM 包（iOS 13+）
├── Sources/HbutBackgroundPlugin/
│   ├── BackgroundModels.swift      # DTO Codable（与 Rust dto.rs 同构；枚举 snake_case rawValue）
│   ├── BackgroundStore.swift       # 持久化（Data.write .atomic / 容量 / scope 清理 / 损坏降级）
│   └── HbutBackgroundPlugin.swift  # 插件入口：runNow/getStateJson/clearContext（真实 ios 平台状态）
└── Tests/HbutBackgroundPluginTests/
    └── ContractTests.swift         # 契约测试（读 ../contract-fixtures）
```

## 运行契约测试（需 macOS + Swift 5.9+）

```bash
cd src-tauri/plugins/tauri-plugin-hbut-background/ios
swift test
```

## 平台语义

- `BackgroundCheckState` 的 platform/source 为真实 `.ios`（不伪造 ready）。
- `runNow` 返回平台真实 synthetic 摘要；`Rust mobile.rs` ios 分支在 #613 接入 FFI/BGTask 前
  同样返回 synthetic（source=ios）。
- 事件/状态存储与 Android/Rust 同语义：`{App容器}/background/{config,context,state,events}.json`。

## #613 集成要点

1. 在 `HbutBackgroundPlugin.swift` 挂接 `BGAppRefreshTaskRequest` 生命周期与 GradeSignatureV1 检查。
2. Rust `mobile.rs` ios 分支由 synthetic 改为 FFI 调用（或经 Tauri iOS plugin 机制）。
3. 与 #612 共用同一份 `contract-fixtures/` 与 DTO 语义，禁止各自发明 schema。
