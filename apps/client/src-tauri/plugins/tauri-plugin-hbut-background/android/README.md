# android/ —— Kotlin 插件实现（#611 骨架 + #612 WorkManager 成绩检测 MVP）

Kotlin 插件实现：`com.hbut.mini.background` 包。
纯 JVM 单测工程（kotlin jvm + org.json + JUnit4），Android-only 文件由 gradle 排除。

## 文件

```text
android/
├── build.gradle.kts                                # 纯 JVM 库工程（排除 Android-only 文件）
└── src/
    ├── main/kotlin/com/hbut/mini/background/
    │   ├── BackgroundModels.kt      # DTO（#611，与 Rust dto.rs 同构；org.json 手写编解码）
    │   ├── BackgroundStore.kt       # 持久化（#611：原子写/容量/scope 清理/损坏降级）
    │   ├── BackgroundRuntimeStore.kt# Worker 运行时状态（#612：baseline/lastResult/去重 ledger）
    │   ├── GradeSignatureV1.kt      # 成绩 signature（#612 冻结契约，与 #613 Swift 逐位一致）
    │   ├── GradesParser.kt          # 教务 JSON -> 标准化记录 + 响应分类（auth/parse 区分）
    │   ├── GradesCheckCore.kt       # 核心编排（#612：baseline/diff/event/通知去重/错误映射）
    │   ├── GradesCheckPolicy.kt     # 调度策略纯函数（#612：唯一 work 名/interval/action）
    │   ├── GradesHttpFetcher.kt     # 成绩最小请求（本机直连学校；cookie 快照只读）
    │   ├── GradesCheckScheduler.kt  # WorkManager 调度封装（#612：unique periodic work）
    │   ├── GradesCheckWorker.kt     # CoroutineWorker（#612：生命周期/result/retry 决策）
    │   ├── GradesNotificationSender.kt # 成绩变化系统通知（#612：权限容错/channel）
    │   ├── BusinessChecksPolicy.kt     # #615 考试/学校消息调度策略纯函数
    │   ├── BusinessChecksScheduler.kt  # #615 唯一周期 work 调度
    │   ├── BusinessChecksWorker.kt     # #615 业务检查 Worker（考试变化/学校消息）
    │   ├── BusinessNotificationSender.kt # #615 考试/学校消息通知（品牌小图标 ic_stat_mini_hbut）
    │   ├── BusinessRuntimeStore.kt     # #615 业务基线/去重 ledger
    │   ├── ExamsCheckCore.kt / ExamsHttpFetcher.kt / ExamsParser.kt / ExamSignatureV1.kt
    │   ├── SchoolInboxCheckCore.kt / SchoolInboxHttpFetcher.kt
    │   └── HbutBackgroundPlugin.kt  # JNI 入口 object（#611 契约 + #612 真实链路接入）
    └── test/kotlin/com/hbut/mini/background/
        ├── ModelsContractTest.kt            # #611 契约测试
        ├── BackgroundStoreTest.kt           # #611 存储测试
        ├── GradeSignatureV1FixtureTest.kt   # #612 fixture 冻结交叉验证（共享 contract-fixtures）
        ├── GradeSignatureV1ExtraTest.kt     # #612 signature 边界
        ├── GradesParserTest.kt              # #612 解析/错误分类
        ├── BackgroundRuntimeStoreTest.kt    # #612 runtime 存储/scope 隔离
        ├── GradesCheckCoreTest.kt           # #612 baseline/diff/去重/错误映射/权限容错
        └── GradesCheckPolicyTest.kt         # #612 唯一 work/interval/action 决策
```

## 运行单测（需 gradle 8.5+ / JDK 17；Windows 本机无 gradle 命令时可用
`~/.gradle/wrapper/dists/gradle-8.5-bin/*/gradle-8.5/bin/gradle.bat test`）

```bash
cd src-tauri/plugins/tauri-plugin-hbut-background/android
gradle test        # 首次会下载 kotlin-gradle-plugin / org.json / junit
```

单测覆盖：#612 验收的 signature/baseline/dedupe/unique work/错误映射，
与 #613 iOS 共用同一份 `contract-fixtures/grades-signature-v1.json`（冻结方：#612）。

## JNI 签名契约（与 Rust mobile.rs android 分支对齐，#611 不变）

| 方法 | JNI 签名 |
|---|---|
| runNow | `(Landroid/content/Context;Ljava/lang/String;Z)Ljava/lang/String;` |
| configure | `(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;` |
| disable | `(Landroid/content/Context;Z)Ljava/lang/String;` |
| syncContext | `(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;` |
| getStateJson | `(Landroid/content/Context;)Ljava/lang/String;` |
| consumeEvents | `(Landroid/content/Context;Ljava/lang/Integer;)Ljava/lang/String;` |
| clearContext | `(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;` |

全部返回统一 JSON（Rust dto 可直接解析）；失败返回 `RunSummary.failed` 摘要（不伪造成功）。

## #612 调度与凭据设计要点

- **唯一周期 work**：`com.hbut.mini.background-notify`（GradesCheckPolicy.UNIQUE_WORK_NAME）。
  enable/interval 变更一律 `enqueueUniquePeriodicWork(UPDATE)`（幂等，不累积）；disable 走
  `cancelUniqueWork`；网络约束 + 指数退避；不默认 ForegroundService；设备重启由 WorkManager
  持久化恢复。
- **凭据**：Worker 只读 Rust 会话层写入的 `filesDir/hbut_cookie_snapshot.json`（应用私有目录，
  secure boundary 内流转；Worker 不保存/不写回密码）。无会话 -> auth-expired 安全停止，
  等待 App 恢复登录后 Rust 重写快照。
- **调度同步入口**：Worker 每次执行自愈同步 + `runNow` 同步 + `MainActivity.onCreate` 同步
  （gen/android 最小追加）。Rust `bg_configure` 只落盘（#611 语义），不直接调 JNI configure。
- **runNow**（JNI，Rust `bg_run_now` 调用）：forceSynthetic=true 返回 synthetic 摘要；
  否则同步执行 `GradesCheckCore`（真实核心），事件写盘 + RunSummary 非敏感诊断。
  已知限制：Rust `perform_run_now` 成功后以内存 events 覆写 events.json，runNow 场景下
  Kotlin 写入的 grades_changed 事件在 App 重启前可能被覆盖（周期场景无此问题）；
  由 #614 Event Inbox 统一收口。

## gen/android 集成（最小追加，#612 已完成）

1. `gen/android/app/build.gradle.kts`：`sourceSets.main.kotlin.srcDir` 指向本目录
   `src/main/kotlin`（插件源码直接并入 app 工程编译，无需复制文件）。
2. `gen/android/app/src/main/AndroidManifest.xml`：追加 `POST_NOTIFICATIONS` 权限声明。
3. `gen/android/app/src/main/java/com/hbut/mini/MainActivity.kt`：onCreate 同步调度。
4. WorkManager 依赖（work-runtime-ktx:2.9.0）与自动初始化已存在，无需追加。
   注意：`src-tauri/gen/android` 为生成工程（gitignore），删除重建后需重新执行上述追加。

**红线**：不得触碰 `gen/android` 中 widget/* 与 KeepAlive（#616 处理）；不得引入
hbut.6661111.xyz fallback；不得在 Worker 内做交互式登录。
