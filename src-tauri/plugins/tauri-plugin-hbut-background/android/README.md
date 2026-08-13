# android/ —— Kotlin 骨架（#611）

Kotlin 插件骨架 + 纯 JVM 单测工程。**不含真实 WorkManager 成绩逻辑（#612 范围）**。

## 文件

```text
android/
├── build.gradle.kts                                # 纯 JVM 库工程（kotlin jvm + org.json + JUnit4）
└── src/
    ├── main/kotlin/com/hbut/mini/background/
    │   ├── BackgroundModels.kt      # DTO（与 Rust dto.rs 同构；org.json 手写编解码）
    │   ├── BackgroundStore.kt       # 持久化（原子写/容量/scope 清理/损坏降级；目录构造可测）
    │   └── HbutBackgroundPlugin.kt  # JNI 入口 object（依赖 android.content.Context，JVM 工程排除）
    └── test/kotlin/com/hbut/mini/background/
        ├── ModelsContractTest.kt    # 契约测试（读 ../contract-fixtures）
        └── BackgroundStoreTest.kt   # 持久化单测（临时目录，不依赖 Android SDK）
```

## 运行单测（本机 Windows 无 gradle/Android SDK，已提供源码与配置）

```bash
cd src-tauri/plugins/tauri-plugin-hbut-background/android
gradle test        # 需 gradle 8.5+ / JDK 17；首次会下载 kotlin-gradle-plugin 与 org.json:json
```

单测覆盖：#611 验收的「至少一个 Android native smoke/单测」——DTO 契约（12 例）+ 存储语义（10 例），
与 Rust contract tests 共用同一份 `contract-fixtures/`。

## JNI 签名契约（与 Rust mobile.rs android 分支对齐）

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

## #612 集成要点

1. 将 `src/main/kotlin/com/hbut/mini/background/` 三文件并入 `src-tauri/gen/android/` app 工程
   （`com.hbut.mini.background` 包），**不得触碰 widget/*（#616 红线）**。
2. 在 `runNow` 中挂接 WorkManager unique periodic work 与 GradeSignatureV1 baseline/diff。
3. `getStateJson`/`consumeEvents` 接入真实 native 事件源后，native 事件经 Rust `consumeEvents` 统一回流前端。
