# tauri-plugin-hbut-background（#611）

Mini-HBUT 自研 Tauri 2 移动后台插件骨架：Android WorkManager 与 iOS BGTask 的统一原生承载层。
**本 Issue 只建管道（7 个固定跨端 API + 三端 DTO/存储/状态边界 + runNow 开发闭环），不实现真实成绩业务。**

## 目录结构

```text
src-tauri/plugins/tauri-plugin-hbut-background/
├── Cargo.toml            # workspace 成员（src-tauri workspace）；release profile 继承根配置
├── build.rs              # tauri_plugin::Builder 生成权限 schema（插件无 tauri.conf.json）
├── permissions/          # 7 个 command 的权限定义（hbut-background:default）
├── contract-fixtures/    # 三端共享契约 fixture（Rust/Kotlin/Swift 测试共同读取，单一事实源）
├── src/
│   ├── lib.rs            # 插件 Builder + init() + manage PluginState
│   ├── dto.rs            # 统一 DTO（全部带 schema/version）+ serde contract tests
│   ├── store.rs          # 持久化：原子写/容量上限/scope 清理/损坏与版本降级
│   ├── state.rs          # 内存状态 + runNow 闭环核心（NativeRunner trait 注入）
│   ├── mobile.rs         # 平台分派：Android JNI / iOS / desktop|web no-op
│   └── commands.rs       # 7 个 tauri command（R 泛型必须显式标注，见文件头注释）
├── tests/contract.rs     # Rust 端契约测试（读 contract-fixtures）
├── android/              # Kotlin 骨架 + 纯 JVM 单测工程（见 android/README.md）
├── ios/                  # Swift 骨架 + SPM 包（见 ios/README.md）
└── js/                   # guest-js TS 封装（前端 invoke 入口，独立于 src/platform）
```

## 7 个固定跨端 API

| Issue 语义 | command（IPC: `plugin:hbut-background|<name>`） | 三端状态 |
|---|---|---|
| configure | `bg_configure` | Rust 落盘配置；Kotlin/Swift 同构方法；真实调度由 #612/#613 |
| disable | `bg_disable` | Rust/Kotlin/Swift 关闭调度并保留诊断状态 |
| syncContext | `bg_sync_context` | 只接收非敏感控制信息（敏感材料禁止入 DTO，#608 红线 2） |
| getState | `bg_get_state` | 返回真实 platform/source，不统一伪造 ready |
| runNow | `bg_run_now` | JS→Rust→native→state/event→JS 闭环（骨架 synthetic） |
| peekEvents | `bg_peek_events` | 只读 inbox 不删除（#614：同步成功后再 ack 的 at-least-once 前提） |
| consumeEvents | `bg_consume_events` | ack 语义：显式 ids 精确 ack / 缺省 limit FIFO 消费并清理 |
| clearContext | `bg_clear_context` | 按 scope 清理 context/state/events（账号切换） |

## 平台语义（不伪造 ready）

- **Android**：Rust JNI 调用 `com.hbut.mini.background.HbutBackgroundPlugin` 静态方法，成败如实返回（失败进入 state.error，不产生事件）。
- **iOS**：Swift 骨架同构（`ios/Sources`）；#613 接入 BGAppRefresh 前 Rust 侧返回平台真实 synthetic。
- **desktop/web**：明确 unsupported/no-op（`run_native` 返回 None → synthetic 摘要，应用不崩溃）。

## 持久化（`{app_data}/background/`）

| 文件 | 内容 | 约束 |
|---|---|---|
| config.json | 用户配置 | 原子写、schema 校验 |
| context.json | 后台上下文 | 原子写、schema 校验、scope 必填 |
| state.json | runtime 状态 | 原子写、schema 校验、平台/source 运行时覆盖 |
| events.json | event inbox | 容量上限 50（超出丢最旧）、原子写 |

损坏/版本不兼容：备份为 `*.corrupt-<ts>` 后降级默认值，不 crash。

## 测试

```bash
# Rust（Windows 可跑）
cargo test -p tauri-plugin-hbut-background          # 40 个测试（lib 30 + contract 10）
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Kotlin（需 gradle 8.5+，纯 JVM，无需 Android SDK）
cd android && gradle test

# Swift（需 macOS）
cd ios && swift test
```

## 安全边界

- DTO/状态/日志永不包含认证材料（有测试守卫敏感字段名）。
- JS `syncContext` 只能提交开关/scope/业务选择；后台认证材料由 Rust 会话层（credential_store/secret_envelope）在 #612/#613 直接交给 native secure boundary。
- `runNow` 输出仅为状态/结果摘要。

## 后续接入

- #612 Android：WorkManager unique periodic work + GradeSignatureV1 baseline/diff（把 android/ 源码并入 gen/android app 工程，勿动 widget/*）。
- #613 iOS：BGAppRefresh 生命周期（在 `mobile.rs` ios 分支改 FFI 或直接由 Swift 骨架实现）。
- #609 契约：`src/platform/types.ts` 由 #609 独占；本插件 DTO 为 Rust 侧事实源，最终在 Integrator 处对齐。
