# Implementation Plan — Mobile Widget: Today Courses

> 对应产物：
> - Requirements：`.kiro/specs/mobile-widget-today-courses/requirements.md`
> - Design：`.kiro/specs/mobile-widget-today-courses/design.md`
>
> 执行提示：
> Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Overview

本计划按「路线 B（Capacitor + 原生小组件 + 自研 Capacitor 插件 `mini-hbut-widget`）」落地。拆解顺序严格遵循依赖：

1. 脚手架与依赖（workspace / devDeps / 插件目录）
2. 纯函数数据层（Web 层，离线可测 + PBT P1/P2/P3/P4/P5/P7/P8/P10/P11）
3. Capacitor 插件骨架（TS 接口 + web 兜底 + 门面）
4. Android 原生（AppWidgetProvider + RemoteViewsService + WorkManager + Deep Link）
5. iOS 原生（Widget Extension + TimelineProvider + App Group + widgetURL）
6. 主 App 集成（`schedule_prefetch` 钩子 / 启动 / 手刷 / 跨天 / 登出）
7. Deep Link 端到端（Android intent-filter / iOS `application(_:open:)` / Web 事件路由）
8. 集成 / 性能 / 回归
9. 文档与发布
10. 可选后续（标注 `*`）

凡带 `*` 的子任务为可选（测试与增强），核心实现任务不带 `*`。每条叶子任务末尾给出 `_Requirements / Design / Property_` 引用，末尾附「任务 → 需求 / 设计 / 属性 交叉索引矩阵」便于 audit。

## Tasks

### 1. 项目脚手架与依赖

- [x] 1. 项目脚手架与依赖
  - [x] 1.1 在根 `package.json` 新增 devDependencies：`fast-check ^3`、`ajv ^8`、`@vitest/coverage-v8`、`vitest ^1`
    - 仅改 `devDependencies` 与 `scripts`，新增 `"test": "vitest run"`、`"test:pbt": "vitest run -t \"Property\""`
    - 不改动任何 `dependencies`
    - _Requirements: R12.1 / Design: §12.1, §12.2_
  - [x] 1.2 创建 workspace 入口 `packages/capacitor-plugin-mini-hbut-widget/`（`package.json`、`tsconfig.json`、`README.md` 占位）
    - `package.json.name = "@mini-hbut/capacitor-plugin-mini-hbut-widget"`、`peerDependencies: { "@capacitor/core": "^6.0.0" }`
    - 根 `package.json` 追加 `"workspaces": ["packages/*"]`
    - _Requirements: R1.3, R12.1 / Design: §6.1_
  - [x] 1.3 在根 `tsconfig.json` 增补 `paths`：`"@mini-hbut/capacitor-plugin-mini-hbut-widget": ["packages/capacitor-plugin-mini-hbut-widget/src"]`
    - 同步在 `packages/capacitor-plugin-mini-hbut-widget/tsconfig.json` 继承根配置
    - _Requirements: R1.3 / Design: §6.1_
  - [x] 1.4 在 `vitest.config.ts`（若不存在则新建）配置：`include: ["src/**/*.spec.ts", "packages/**/src/**/*.spec.ts"]`、`environment: "node"`、`testTimeout: 5000`
    - 将 `alias` 与 `tsconfig.paths` 对齐
    - _Requirements: R12.1 / Design: §12.1_

### 2. 数据模型与纯函数层（Web）

- [x] 2. 数据模型与纯函数层（Web）
  - [x] 2.1 定义 `TodayCourseSnapshot` / `WidgetCourse` TS 类型与 Ajv JSON Schema
    - 新文件：`packages/capacitor-plugin-mini-hbut-widget/src/definitions.ts`（按 design §6.2 逐字段）
    - 新文件：`src/utils/widget_snapshot_schema.ts` 导出 Ajv 预编译 validator（对齐 design §4.1 schema）
    - _Requirements: R4.1, R4.2 / Design: §4.1, §6.2_
  - [x] 2.2 实现 `buildTodayCourseSnapshot`（纯函数，不碰 I/O）
    - 新文件：`src/utils/widget_snapshot.ts`
    - 实现 `formatLocalDate` / `getIsoWeekday`（`Intl.DateTimeFormat` 固定 `Asia/Shanghai`）
    - 实现 `extractCoursesOfDay`：按 `week_index` + `weekday` 过滤，跨周重复实例去重
    - 排序：`time_start` 升序，平局按 `period_start` 升序
    - _Requirements: R4.1, R4.2, R4.4, R4.5 / Design: §9.1_
  - [x] 2.3 实现 `pickRows(snapshot, capacity)` + 溢出角标计算
    - 返回 `{ rows, overflowBadge }`；`capacity == Infinity` 时 `overflowBadge == 0`
    - _Requirements: R2.4, R2.5, R3.3 / Design: §7.3, §8.3_
  - [x] 2.4 实现 `resolveRenderKind(snapshot, now)` 决策表
    - 分支：`login` / `dataError` / `weekend` / `noCourse` / `normal{ staleHint? }`
    - `now - generated_at > 24h` 追加 `staleHint`
    - _Requirements: R2.6, R2.7, R3.4, R3.5, R6.4, R7.1, R7.2, R7.3, R7.4, R7.5 / Design: §4.4, §5.3_
  - [x] 2.5 实现 `maskStudentId(s)` 与 `a11yLabel(course)`
    - 放在 `src/utils/widget_snapshot.ts` 内部 export
    - _Requirements: R10.2, R11.3 / Design: §10 (脱敏策略), §7.6, §8.6_
  - [x] 2.6 实现 `buildDeepLink(snapshot, row?)` 构造 `minihbut://schedule?date=&source=widget[&period=]`
    - 仅拼字符串，不做 URL 编码错误时 fallback
    - _Requirements: R2.8, R3.6, R8.1, R8.2, R8.4 / Design: §10.1_
  - [x] 2.7 实现 `renderFromBytes(raw, now)`：容错反序列化 + 复用 §2.4 决策
    - 捕获一切异常返回 `{ kind: 'dataError' }`
    - _Requirements: R7.5 / Design: §4.4, §11 P11_
  - [ ]* 2.8 Vitest 单元测试：`buildTodayCourseSnapshot` / `pickRows` / `resolveRenderKind` / `maskStudentId` / `buildDeepLink` / `renderFromBytes` 的 example 级分支覆盖
    - 覆盖空快照、空 courses、超容量、跨周过滤、非法 JSON
    - _Requirements: R4.1, R4.2, R4.4, R4.5, R7.1-7.5, R10.2, R11.3, R8.1, R8.4 / Design: §12.1_
  - [ ]* 2.9 PBT — **Property 1：Snapshot 生成 schema-合法、按本周本日筛选、按时间升序**
    - `fast-check` 500 iterations，用 `fc.record` 造 cache；Ajv 校验
    - 断言：本周本日筛选正确 + `time_start/period_start` 单调
    - _Requirements: R4.1, R4.2, R4.4, R4.5 / Design: §11 P1 / Property: P1_
  - [ ]* 2.10 PBT — **Property 3：`pickRows` 截断 / 溢出角标幂等且正确**
    - `capacity ∈ {1,2,3,6,Infinity}`；连续调用 k 次结果相等
    - _Requirements: R2.4, R2.5, R3.3 / Design: §11 P3 / Property: P3_
  - [ ]* 2.11 PBT — **Property 4：`resolveRenderKind` 分支唯一且符合决策表**
    - 500 iterations；另加 2 条 example 验证 `staleHint`
    - _Requirements: R2.6, R2.7, R3.4, R3.5, R6.4, R7.1, R7.2, R7.3, R7.4, R7.5 / Design: §11 P4 / Property: P4_
  - [ ]* 2.12 PBT — **Property 5：`buildDeepLink` 幂等 + 参数正确**
    - 500 iterations；row 有无分支各占一半
    - _Requirements: R2.8, R3.6, R8.1, R8.2, R8.4 / Design: §11 P5 / Property: P5_
  - [ ]* 2.13 PBT — **Property 10：`maskStudentId` + `a11yLabel` 契约**
    - 100 iterations；学号长度覆盖 0, 1, 4, 5, 12, 32
    - _Requirements: R10.2, R11.3 / Design: §11 P10 / Property: P10_
  - [ ]* 2.14 PBT — **Property 11：`renderFromBytes` 对任意字节串永不抛异常**
    - 100 iterations；`fc.string()` + 恶意样本（截断 JSON / 深嵌套）
    - _Requirements: R7.5 / Design: §11 P11 / Property: P11_

- [x] 3. Checkpoint — 数据层通过
  - Ensure all tests pass, ask the user if questions arise.

### 3. Capacitor 插件骨架（TS 层）

- [x] 4. Capacitor 插件骨架（TS 层）
  - [x] 4.1 插件入口导出
    - 新文件：`packages/capacitor-plugin-mini-hbut-widget/src/index.ts` → `registerPlugin<MiniHbutWidgetPlugin>('MiniHbutWidget', { web: () => new MiniHbutWidgetWeb() })`
    - 导出 `definitions.ts` 的类型
    - _Requirements: R1.3 / Design: §6.1, §6.2_
  - [x] 4.2 Web 兜底实现
    - 新文件：`packages/capacitor-plugin-mini-hbut-widget/src/web.ts`
    - 四个方法全部 `reject({ code: 'UNAVAILABLE' })`；`getCapabilities` 返回 `{ platform: 'unavailable', pinned: false }`
    - _Requirements: R1.3 / Design: §6.2_
  - [x] 4.3 门面 `src/platform/capacitor/widget.ts`
    - 封装 `getWidgetBridge()` 单例；执行字节数校验（≤ 32 KB）+ Ajv schema 校验
    - 非 Capacitor 环境 `console.debug` 一次并 no-op
    - _Requirements: R1.3, R4.3 / Design: §6.2, §9.2_
  - [x] 4.4 `writeSnapshotWithRetry` 实现（指数退避 250/1000/4000ms）
    - 不可重试错误 `SNAPSHOT_TOO_LARGE` / `INVALID_SNAPSHOT` 立即 reject
    - 可重试错误 `WRITE_FAILED` / `UNAVAILABLE` 最多 3 次
    - 日志仅 `console.warn` + 现有 `debug_logger`
    - _Requirements: R5.5 / Design: §9.3_
  - [ ]* 4.5 Vitest 单元测试：`web.ts` 四方法 reject `UNAVAILABLE`；门面的 32KB 校验；`writeSnapshotWithRetry` 分支
    - mock `Capacitor.Plugins.MiniHbutWidget`
    - _Requirements: R5.5, R4.3 / Design: §12.1_
  - [ ]* 4.6 PBT — **Property 2：`writeSnapshot` 要么 ≤ 32KB 要么 reject `SNAPSHOT_TOO_LARGE`**
    - 500 iterations；通过 fake plugin spy 观察底层 payload 字节数
    - _Requirements: R4.3 / Design: §11 P2 / Property: P2_
  - [ ]* 4.7 PBT — **Property 8：`writeSnapshotWithRetry` 调用次数 ≤ 4 且行为正确**
    - `fails ∈ {0..4}`；覆盖可重试 / 不可重试两类错误
    - _Requirements: R5.5 / Design: §11 P8 / Property: P8_

### 4. Android 原生实现

- [x] 5. Android 原生实现
  - [x] 5.1 插件 Kotlin 实现：`MiniHbutWidgetPlugin.kt`
    - 路径：`packages/capacitor-plugin-mini-hbut-widget/android/src/main/java/com/hbut/mini/widget/plugin/MiniHbutWidgetPlugin.kt`
    - 方法：`writeSnapshot` / `clearSnapshot` / `requestRefresh` / `getCapabilities`
    - 字节数校验 + `SharedPreferences.edit().commit()` 同步写
    - _Requirements: R5.1, R5.6, R10.3, R10.1 / Design: §6.3_
  - [x] 5.2 `WidgetDataStore.kt`
    - 封装 `SharedPreferences("mini_hbut_widget", MODE_PRIVATE)`
    - API：`writeSnapshot(json): Boolean` / `readSnapshot(): String?` / `clear()` / `lastWriteTs(): Long`
    - _Requirements: R10.1, R10.5 / Design: §5.1_
  - [x] 5.3 `TodayCoursesProvider.kt` 实现
    - 路径：`android/app/src/main/java/com/hbut/mini/widget/TodayCoursesProvider.kt`
    - `onUpdate` / `onEnabled` / `onDisabled` / `onReceive(ACTION_REFRESH)`
    - 全限定名严格为 `com.hbut.mini.widget.TodayCoursesProvider`
    - _Requirements: R2.1, R2.2, R12.4 / Design: §7.1_
  - [x] 5.4 `appwidget-provider.xml` + 三套布局（4×2 必做，2×2 / 4×1 附加）
    - 路径：`android/app/src/main/res/xml/appwidget_today_courses.xml`
    - `updatePeriodMillis = 1800000`（≥ 30min，满足 R6.1）
    - 布局：`widget_today_courses_4x2.xml` / `_2x2.xml` / `_4x1.xml` / `widget_item_course_row.xml`
    - _Requirements: R2.3, R6.1 / Design: §7.2, §7.3, §7.7_
  - [x] 5.5 `RemoteViewsService` + `RemoteViewsFactory`（列表行渲染 + 脱敏）
    - 路径：`android/app/src/main/java/com/hbut/mini/widget/TodayCoursesRemoteViewsService.kt`
    - `onDataSetChanged` 读 `WidgetDataStore` + 调用 `pickRows` 镜像逻辑
    - 学号脱敏同 §2.5；`contentDescription` 对齐 `a11yLabel`
    - _Requirements: R2.4, R2.5, R10.2, R11.3 / Design: §7.3, §10_
  - [x] 5.6 `WidgetRefreshScheduler.kt` + `WidgetRefreshWorker.kt`
    - `ensurePeriodic`：`PeriodicWorkRequest(15, MINUTES)` + `ExistingPeriodicWorkPolicy.KEEP`
    - `triggerImmediate` / `cancelPeriodic` / `hasPinnedInstance`
    - Worker 仅 `notifyAppWidgetViewDataChanged`，无任何网络
    - _Requirements: R6.1, R6.2, R9.4, R9.5 / Design: §7.4_
  - [x] 5.7 `PendingIntent` + Deep Link intent-filter 写入 `AndroidManifest.xml`
    - `MainActivity` 增加 `<intent-filter>`（scheme=minihbut, host=schedule）
    - `<receiver>` 注册 `TodayCoursesProvider`（exported=false，`APPWIDGET_UPDATE` + custom `ACTION_REFRESH`）
    - _Requirements: R2.8, R8.1, R8.3, R8.4, R12.4 / Design: §7.5, §10.2_
  - [x] 5.8 Material You / 深浅色 / 大字号资源
    - `res/values/colors.xml` + `res/values-night/colors.xml`
    - API 31+ 使用 `@android:color/system_accent1_*` / `system_neutral1_*`；< 31 使用内置两套
    - 所有 `TextView` 14sp + `layout_height=wrap_content`
    - _Requirements: R2.9, R2.10, R11.1, R11.5 / Design: §7.6_
  - [x] 5.9 资源 & 文案（含预览图 placeholder）
    - `drawable-xxhdpi/widget_preview_today_courses.png` 占位；`strings_widget.xml`（"今日课程"、"今日无课"、"周末愉快"、"请先在 Mini-HBUT 登录"、"数据可能已过期，打开 App 刷新"、"小组件数据异常，请打开 App"）
    - _Requirements: R2.1, R7.1, R7.2, R7.3, R7.4, R7.5, R11.4 / Design: §7.7, §12.7_
  - [ ]* 5.10 Instrumented Test：Provider / RemoteViews / 并发
    - 路径：`android/app/src/androidTest/java/com/hbut/mini/widget/`
    - 验证 `AppWidgetProviderInfo.label == "今日课程"`、receiver 全限定名、`updatePeriodMillis >= 1800000`
    - 并发：200 轮 read/write 最终值一致
    - _Requirements: R2.1, R6.1, R12.4 / Design: §12.4_
  - [ ]* 5.11 Macrobenchmark：`onUpdate` 首帧 ≤ 3 s、内存增量 ≤ 5 MB
    - 路径：`android/app/src/androidTest/java/com/hbut/mini/widget/benchmark/`
    - _Requirements: R2.2, R9.1 / Design: §12.4, §12.8_
  - [ ]* 5.12 PBT（镜像）— **Property 3 / P4 / P10 / P11** 在 Kotlin 侧复用 `net.jqwik`
    - 覆盖 `pickRows` / `resolveRenderKind` / `maskStudentId` / `renderFromBytes` 的 Kotlin 镜像
    - _Requirements: R2.4, R2.5, R2.6, R2.7, R6.4, R7.x, R10.2, R11.3 / Design: §11 P3, P4, P10, P11_

- [x] 6. Checkpoint — Android 端通过
  - Ensure all tests pass, ask the user if questions arise.

### 5. iOS 原生实现

- [x] 7. iOS 原生实现
  - [x] 7.1 新增 App Extension Target `MiniHbutTodayWidget`
    - Bundle id：`com.hbut.mini.widget`；Deployment Target：iOS 14.0
    - 在 `ios/App/App.xcodeproj` 中添加新 Target；`Info.plist` 设 `NSExtensionPointIdentifier=com.apple.widgetkit-extension`、`CFBundleDisplayName="Mini-HBUT · 今日课程"`
    - _Requirements: R3.1, R3.8, R12.2 / Design: §8.1_
  - [x] 7.2 App Group `group.com.hbut.mini` 两端 entitlements
    - `ios/App/App/App.entitlements` + `ios/App/MiniHbutTodayWidget/MiniHbutTodayWidget.entitlements` 均写入 `com.apple.security.application-groups`
    - _Requirements: R10.1, R12.3 / Design: §8.4_
  - [x] 7.3 插件 Swift 实现：`MiniHbutWidgetPlugin.swift` / `.m`
    - 路径：`packages/capacitor-plugin-mini-hbut-widget/ios/Plugin/`
    - 方法：`writeSnapshot` / `clearSnapshot` / `requestRefresh` / `getCapabilities`
    - 调用 `WidgetCenter.shared.reloadTimelines(ofKind: "TodayCoursesWidget")`
    - _Requirements: R5.1, R5.6, R10.3, R12.3 / Design: §6.4_
  - [x] 7.4 `WidgetDataStore.swift`（App Group UserDefaults 封装）
    - API：`write(_: String) -> Bool` / `readSnapshot() -> String?` / `clear()` / `lastWriteTs() -> Date?`
    - 仅通过 `UserDefaults(suiteName: "group.com.hbut.mini")`
    - _Requirements: R10.1 / Design: §5.2_
  - [x] 7.5 `TodayCoursesProvider.swift`（TimelineProvider 实现 P9）
    - `placeholder` / `getSnapshot` / `getTimeline`
    - `buildEntries(snapshot, now)` 严格遵循 design §8.2 规则，限制 `entries.count ≤ 4`
    - `.atEnd` vs `.after(now + 15m)` 两分支
    - _Requirements: R6.3, R6.4 / Design: §8.2 / Property: P9_
  - [x] 7.6 `TodayCoursesEntryView.swift`（small / medium / large）
    - `SmallView` / `MediumView` / `LargeView` 三视图；脱敏学号 + `+N 节`
    - `widgetURL` 指向 `minihbut://schedule?date=...&source=widget`
    - 适配 Dynamic Type 至 `xLarge`、深色模式（`Assets.xcassets/WidgetBg`）
    - _Requirements: R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R11.2, R11.5 / Design: §8.3, §8.6_
  - [x] 7.7 `MiniHbutTodayWidgetBundle.swift` + `TodayCoursesWidget.swift`
    - `WidgetBundle` 入口；`StaticConfiguration` 注册三尺寸
    - `.supportedFamilies([.systemSmall, .systemMedium, .systemLarge])`
    - _Requirements: R3.1, R3.2 / Design: §8.1_
  - [x] 7.8 主 App `Info.plist` 注册 `CFBundleURLTypes`（scheme `minihbut`）
    - `ios/App/App/Info.plist`
    - _Requirements: R8.1, R8.3, R8.4 / Design: §8.5, §10.3_
  - [ ]* 7.9 XCTest：`WidgetDataStore` 读写 round-trip / 非法串返回 nil / 超 32KB 写入拒绝
    - 路径：`ios/App/MiniHbutTodayWidgetTests/WidgetDataStoreTests.swift`
    - _Requirements: R4.3, R10.1 / Design: §12.5_
  - [ ]* 7.10 PBT — **Property 9：`buildEntries` 单调 / ≤4 / 覆盖每门课 / staleOrLogin**
    - SwiftCheck 100+ iterations
    - _Requirements: R6.3 / Design: §11 P9 / Property: P9_
  - [ ]* 7.11 SnapshotTesting：12 组（small/medium/large × light/dark × Dynamic Type `xLarge`）
    - 使用 `pointfreeco/swift-snapshot-testing`
    - _Requirements: R3.7, R11.2, R11.5 / Design: §12.5_
  - [ ]* 7.12 Archive Smoke：`xcodebuild archive -scheme App`
    - CI script 入口；失败时退出码非 0
    - _Requirements: R12.2, R12.5 / Design: §12.5, §13 (风险缓解)_
  - [ ]* 7.13 PBT（镜像）— **Property 3 / P4 / P10 / P11** 在 Swift 侧（SwiftCheck）
    - 覆盖 `pickRows` / `resolveRenderKind` / `maskStudentId` / `renderFromBytes`
    - _Requirements: R2.4, R2.5, R3.3, R3.4, R3.5, R6.4, R7.x, R10.2, R11.3 / Design: §11 P3, P4, P10, P11_

- [x] 8. Checkpoint — iOS 端通过
  - Ensure all tests pass, ask the user if questions arise.

### 6. 主 App 集成

- [x] 9. 主 App 集成
  - [x] 9.1 `src/utils/widget_bridge.ts` 门面汇总
    - 导出 `afterScheduleRefresh(sid, payload, { selectedWeek })` / `tryWriteSnapshotFromCache(sid)` / `clearWidgetForLogout()`
    - 内部调用 `buildTodayCourseSnapshot` + `writeSnapshotWithRetry`
    - _Requirements: R5.1, R5.2, R5.3, R5.5, R10.3 / Design: §9.2, §9.3_
  - [x] 9.2 接入 `schedule_prefetch.warmupScheduleForStudent` 成功分支
    - 修改 `src/utils/schedule_prefetch.js`：成功 `return` 前调用 `afterScheduleRefresh(sid, payload, { selectedWeek })`
    - 不改动既有缓存 key / TTL
    - _Requirements: R5.1, R5.6 / Design: §9.2, §9.4_
  - [x] 9.3 `App.vue` 启动尾部调用 `tryWriteSnapshotFromCache(sid)`（≤ 5s 内完成）
    - 仅在登录态下执行
    - _Requirements: R5.2 / Design: §9.2_
  - [x] 9.4 `ScheduleView.vue` 手动刷新成功回调注入 `afterScheduleRefresh`
    - 接入下拉刷新完成分支
    - _Requirements: R5.3 / Design: §9.2_
  - [x] 9.5 跨天调度：`App.vue` 注册 `setTimeout` 对齐到下一个 `00:00 + 60s` → `tryWriteSnapshotFromCache`
    - 卸载组件时 `clearTimeout`；在 App 回前台时重算剩余时间
    - _Requirements: R5.4 / Design: §9.2, §13 (跨天临界点)_
  - [x] 9.6 登出 / 清空数据流程接入 `clearWidgetForLogout()`
    - 在现有登出函数的 `finally` 块调用，确保无论失败都执行
    - _Requirements: R10.3 / Design: §9.2_
  - [x] 9.7 失败日志接入 `debug_logger`
    - `writeSnapshot` 失败后 `console.warn` + `debug_logger.record('widget_write_failed', { code })`
    - _Requirements: R5.5, R10.5 / Design: §9.3_
  - [ ]* 9.8 Vitest：mock `widget_bridge` 验证 "刷新 → write → refreshTick" 序列 & "logout → clear → refreshTick" 序列
    - _Requirements: R5.1, R5.3, R5.6, R10.3 / Design: §12.1_
  - [ ]* 9.9 PBT — **Property 6：副作用序列恰好一次**
    - 使用 `fast-check` + fake bridge spy
    - _Requirements: R5.1, R5.3, R5.6, R10.3 / Design: §11 P6 / Property: P6_
  - [ ]* 9.10 PBT — **Property 7：跨天必然触发新 snapshot**
    - 使用 `vi.useFakeTimers()`；断言 `newSnapshot.date == localDate(now, 'Asia/Shanghai')`
    - _Requirements: R5.4 / Design: §11 P7 / Property: P7_

- [x] 10. Checkpoint — 主 App 集成通过
  - Ensure all tests pass, ask the user if questions arise.

### 7. Deep Link 端到端

- [x] 11. Deep Link 端到端
  - [x] 11.1 Android `MainActivity` `onNewIntent` 解析 `minihbut://schedule`
    - `getData()?.getQueryParameter("date" / "source" / "period")`
    - `bridge.triggerJSEvent("widgetDeeplink", "window", payloadJson)`
    - _Requirements: R8.1, R8.3, R8.4 / Design: §10.2_
  - [x] 11.2 iOS `AppDelegate.application(_:open:options:)` 解析并 `CAPBridge.notifyListenersGlobal("widgetDeeplink", ...)`
    - 仅 scheme == `minihbut` 且 host == `schedule` 时处理
    - _Requirements: R8.1, R8.3, R8.4 / Design: §10.3_
  - [x] 11.3 `App.vue` 注册 `appUrlOpen` + `widgetDeeplink` 监听，分发到 `ScheduleView`
    - 注入 `selectedWeek = weekFromDate(date)` + 滚动定位至该日
    - 冷启动路径：Web 层初始化完成后再执行路由切换
    - _Requirements: R8.1, R8.2, R8.3, R8.4 / Design: §10.4_
  - [x] 11.4 `ScheduleView.vue` 接受 `prop date + period`，实现定位 / 高亮
    - 无独立详情页时，`period` 仅用于滚动到该行并高亮
    - _Requirements: R8.2 / Design: §10.4_
  - [ ]* 11.5 Vitest：`handleWidgetPayload` 对四种 payload（完整 / 无 period / 冷启动 / 非法）的行为
    - _Requirements: R8.1, R8.2, R8.3, R8.4 / Design: §12.1_

### 8. 集成 / 性能 / 回归

- [x] 12. 集成 / 性能 / 回归
  - [x] 12.1 `npm run build:web && npx cap sync` 通过，Android/iOS 工程未报错
    - 在 CI（若存在）增加该步；失败即退出
    - _Requirements: R12.1, R12.2 / Design: §12.6_
  - [x] 12.2 写入 `packages/capacitor-plugin-mini-hbut-widget/README.md` 的 App Group / receiver 安装步骤
    - 明确「未配置 App Group 即 fail-fast」
    - _Requirements: R12.3, R12.5 / Design: §13 (风险缓解)_
  - [x] 12.3 性能基线测试脚本（Vitest bench）
    - `writeSnapshot` I/O P95 ≤ 50ms（fake bridge 模拟）
    - 断言快照序列化后字节数 ≤ 32 KB
    - _Requirements: R9.3, R4.3 / Design: §12.8_
  - [x] 12.4 输出 `manual-checklist.md`（12 条手工回归，对齐 design §12.7）
    - 路径：`.kiro/specs/mobile-widget-today-courses/manual-checklist.md`
    - _Requirements: R2.6, R2.7, R5.x, R7.x, R10.3, R11.x / Design: §12.7_
  - [ ]* 12.5 集成矩阵测试（Android 10/12/14 × iOS 14/16/17）
    - 记录版本差异到 `manual-checklist.md` 附录
    - _Requirements: R2.9, R2.10, R3.7, R6.5, R9.x / Design: §12.6_
  - [ ]* 12.6 Android Macrobenchmark 报告生成
    - 输出 `onUpdate` 首帧 / 内存增量 / 日 WorkManager 次数
    - _Requirements: R2.2, R9.1, R9.5 / Design: §12.8_
  - [ ]* 12.7 iOS XCTest measure：`buildEntries` ≤ 100ms
    - _Requirements: R9.2 / Design: §12.8_

### 9. 文档与发布

- [x] 13. 文档与发布
  - [x] 13.1 更新主仓 `README.md` / `CAPACITOR_MIGRATION.md` 追加「今日课程 Widget」章节
    - 包含：技术路线（B）、安装步骤、App Group 步骤、FAQ（"未使用 `s00d/tauri-plugin-widgets`"）
    - _Requirements: R1.2, R1.4, R12.1, R12.2, R12.3 / Design: §13_
  - [x] 13.2 `packages/capacitor-plugin-mini-hbut-widget/README.md` 完整写作
    - 安装、配置、API、错误码表、平台差异
    - _Requirements: R12.1, R12.2, R12.3 / Design: §6_
  - [x] 13.3 CI / `release.py` 增加构建前检查
    - 存在 `App.entitlements` 且包含 `group.com.hbut.mini`；Android receiver 全限定名注册
    - 未通过时 fail-fast（对齐 R12.5）
    - _Requirements: R12.5 / Design: §13 (风险缓解)_
  - [x] 13.4 CHANGELOG 追加条目 + 用户沟通 FAQ
    - 在 `CHANGELOG.md` 增加 "新增：移动端今日课程桌面小组件"
    - 在公告 / FAQ 说明不迁移 Tauri Mobile
    - _Requirements: R1.2, R1.4 / Design: §13_

- [x] 14. Final Checkpoint — 发布前全部测试与构建通过
  - Ensure all tests pass, ask the user if questions arise.

### 10. 可选后续（标 `*`）

- [ ] 15. 可选后续增强
  - [ ]* 15.1 Jetpack Glance 升级路径（Android 12+）
    - `TodayCoursesGlanceWidget : GlanceAppWidget`；仅 `Build.VERSION.SDK_INT >= 31` 生效
    - RemoteViews 保留为 < 31 兜底
    - _Requirements: R2.9 / Design: §7.3, §13_
  - [ ]* 15.2 Universal Link / App Link 上线
    - Android `assetlinks.json`、iOS `apple-app-site-association`
    - _Requirements: R8.4 / Design: §10.1, §14 (Open Q3)_
  - [ ]* 15.3 多账号扩展：`snapshot_version = 2`，新增 `account_id`
    - Widget 侧同时保留 v1 / v2 读路径
    - _Requirements: R4.1 / Design: §4.4, §13, §14 (Open Q)_
  - [ ]* 15.4 iOS 锁屏 `accessoryRectangular` / Live Activity
    - 本 spec Out of Scope，留档给后续 spec
    - _Requirements: R13.2 / Design: §2.3_

## Notes

- 标 `*` 的子任务为可选（测试 / 性能 / 可观测 / 后续增强），执行 agent 不得自动实现。
- 每条叶子任务均回链到 `requirements.md` 的 EARS 条款与 `design.md` 章节；PBT 任务显式引用 P1–P11。
- Checkpoint 任务位于关键阶段末尾（数据层 / Android / iOS / 主 App 集成 / 发布前），用于集中验证 + 汇报阻塞。
- 字节数 32 KB、WorkManager 周期 15 分钟、iOS entry ≤ 4 等硬约束在实现与测试双侧同时体现，避免漂移。

## 任务 → 需求 / 设计 / 属性 交叉索引矩阵

| 任务 | Requirements | Design 章节 | Property |
| --- | --- | --- | --- |
| 1.1 | R12.1 | §12.1, §12.2 | — |
| 1.2 | R1.3, R12.1 | §6.1 | — |
| 1.3 | R1.3 | §6.1 | — |
| 1.4 | R12.1 | §12.1 | — |
| 2.1 | R4.1, R4.2 | §4.1, §6.2 | — |
| 2.2 | R4.1, R4.2, R4.4, R4.5 | §9.1 | — |
| 2.3 | R2.4, R2.5, R3.3 | §7.3, §8.3 | — |
| 2.4 | R2.6, R2.7, R3.4, R3.5, R6.4, R7.1-7.5 | §4.4, §5.3 | — |
| 2.5 | R10.2, R11.3 | §7.6, §8.6 | — |
| 2.6 | R2.8, R3.6, R8.1, R8.2, R8.4 | §10.1 | — |
| 2.7 | R7.5 | §4.4 | — |
| 2.8* | R4.1, R4.2, R4.4, R4.5, R7.1-7.5, R10.2, R11.3, R8.1, R8.4 | §12.1 | — |
| 2.9* | R4.1, R4.2, R4.4, R4.5 | §11 | P1 |
| 2.10* | R2.4, R2.5, R3.3 | §11 | P3 |
| 2.11* | R2.6, R2.7, R3.4, R3.5, R6.4, R7.1-7.5 | §11 | P4 |
| 2.12* | R2.8, R3.6, R8.1, R8.2, R8.4 | §11 | P5 |
| 2.13* | R10.2, R11.3 | §11 | P10 |
| 2.14* | R7.5 | §11 | P11 |
| 4.1 | R1.3 | §6.1, §6.2 | — |
| 4.2 | R1.3 | §6.2 | — |
| 4.3 | R1.3, R4.3 | §6.2, §9.2 | — |
| 4.4 | R5.5 | §9.3 | — |
| 4.5* | R5.5, R4.3 | §12.1 | — |
| 4.6* | R4.3 | §11 | P2 |
| 4.7* | R5.5 | §11 | P8 |
| 5.1 | R5.1, R5.6, R10.3, R10.1 | §6.3 | — |
| 5.2 | R10.1, R10.5 | §5.1 | — |
| 5.3 | R2.1, R2.2, R12.4 | §7.1 | — |
| 5.4 | R2.3, R6.1 | §7.2, §7.3, §7.7 | — |
| 5.5 | R2.4, R2.5, R10.2, R11.3 | §7.3, §10 | — |
| 5.6 | R6.1, R6.2, R9.4, R9.5 | §7.4 | — |
| 5.7 | R2.8, R8.1, R8.3, R8.4, R12.4 | §7.5, §10.2 | — |
| 5.8 | R2.9, R2.10, R11.1, R11.5 | §7.6 | — |
| 5.9 | R2.1, R7.1-7.5, R11.4 | §7.7, §12.7 | — |
| 5.10* | R2.1, R6.1, R12.4 | §12.4 | — |
| 5.11* | R2.2, R9.1 | §12.4, §12.8 | — |
| 5.12* | R2.4-2.7, R6.4, R7.x, R10.2, R11.3 | §11 | P3, P4, P10, P11 |
| 7.1 | R3.1, R3.8, R12.2 | §8.1 | — |
| 7.2 | R10.1, R12.3 | §8.4 | — |
| 7.3 | R5.1, R5.6, R10.3, R12.3 | §6.4 | — |
| 7.4 | R10.1 | §5.2 | — |
| 7.5 | R6.3, R6.4 | §8.2 | P9 |
| 7.6 | R3.2-3.7, R11.2, R11.5 | §8.3, §8.6 | — |
| 7.7 | R3.1, R3.2 | §8.1 | — |
| 7.8 | R8.1, R8.3, R8.4 | §8.5, §10.3 | — |
| 7.9* | R4.3, R10.1 | §12.5 | — |
| 7.10* | R6.3 | §11 | P9 |
| 7.11* | R3.7, R11.2, R11.5 | §12.5 | — |
| 7.12* | R12.2, R12.5 | §12.5, §13 | — |
| 7.13* | R2.4-2.5, R3.3-3.5, R6.4, R7.x, R10.2, R11.3 | §11 | P3, P4, P10, P11 |
| 9.1 | R5.1, R5.2, R5.3, R5.5, R10.3 | §9.2, §9.3 | — |
| 9.2 | R5.1, R5.6 | §9.2, §9.4 | — |
| 9.3 | R5.2 | §9.2 | — |
| 9.4 | R5.3 | §9.2 | — |
| 9.5 | R5.4 | §9.2, §13 | — |
| 9.6 | R10.3 | §9.2 | — |
| 9.7 | R5.5, R10.5 | §9.3 | — |
| 9.8* | R5.1, R5.3, R5.6, R10.3 | §12.1 | — |
| 9.9* | R5.1, R5.3, R5.6, R10.3 | §11 | P6 |
| 9.10* | R5.4 | §11 | P7 |
| 11.1 | R8.1, R8.3, R8.4 | §10.2 | — |
| 11.2 | R8.1, R8.3, R8.4 | §10.3 | — |
| 11.3 | R8.1-8.4 | §10.4 | — |
| 11.4 | R8.2 | §10.4 | — |
| 11.5* | R8.1-8.4 | §12.1 | — |
| 12.1 | R12.1, R12.2 | §12.6 | — |
| 12.2 | R12.3, R12.5 | §13 | — |
| 12.3 | R9.3, R4.3 | §12.8 | — |
| 12.4 | R2.6, R2.7, R5.x, R7.x, R10.3, R11.x | §12.7 | — |
| 12.5* | R2.9, R2.10, R3.7, R6.5, R9.x | §12.6 | — |
| 12.6* | R2.2, R9.1, R9.5 | §12.8 | — |
| 12.7* | R9.2 | §12.8 | — |
| 13.1 | R1.2, R1.4, R12.1-3 | §13 | — |
| 13.2 | R12.1-3 | §6 | — |
| 13.3 | R12.5 | §13 | — |
| 13.4 | R1.2, R1.4 | §13 | — |
| 15.1* | R2.9 | §7.3, §13 | — |
| 15.2* | R8.4 | §10.1, §14 | — |
| 15.3* | R4.1 | §4.4, §13, §14 | — |
| 15.4* | R13.2 | §2.3 | — |

---

**Workflow Complete**：本 spec 的三份产物（requirements / design / tasks）已完整产出。本工作流仅负责产出规划文档，不自动执行实现。你可以打开 `.kiro/specs/mobile-widget-today-courses/tasks.md`，对任一 `- [ ]` 任务点击 "Start task" 开始实现；推荐从 Task 1 开始按顺序执行。
