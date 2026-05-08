# Design Document — Mobile Widget: Today Courses

> 对应需求：`.kiro/specs/mobile-widget-today-courses/requirements.md`
>
> 本文档仅产出设计，不包含实施任务；tasks 将在下一阶段基于本设计生成。

---

## 1. Overview

### 1.1 目标

在 Mini-HBUT **移动端桌面**（Android Home Screen / iOS Home Screen）提供一个只读的「今日课程」原生小组件，使用户不打开 App 也能看到当天的节次、时间、课程名、教室。

### 1.2 范围

覆盖：

- Android `AppWidgetProvider` 实现（4×2 默认，兼顾 2×2 / 4×1）。
- iOS WidgetKit Widget Extension 实现（`systemMedium` 默认，兼顾 `systemSmall` / `systemLarge`）。
- 新增 Capacitor 插件 `mini-hbut-widget` 作为 Web ↔ 原生桥。
- 共享数据介质（Android `SharedPreferences`、iOS App Group `UserDefaults`）。
- 主 App 到 Widget 的快照写入、刷新、清空流程。
- 点击 Widget 的 deep link 唤起。

不覆盖（见 requirements R13）：桌面端 Tauri 小组件、iOS 锁屏小组件 / Live Activity / Dynamic Island、Android 锁屏、全周课表、其他模块（成绩、考试、电费）、可交互编辑、Tauri Mobile 迁移。

### 1.3 路线 B 结论

本设计采用 **路线 B：保留 Capacitor 6.x，新增原生小组件 + 自研 Capacitor 插件**。不引入 `s00d/tauri-plugin-widgets`，不改变现有 Tauri / Capacitor 工程拓扑。详见 §2。

### 1.4 与现有系统的关系

- 前端 Vue 3 代码保持不变，仅在 `src/platform/` 下新增 `capacitor/widget.ts` 门面，以及在 `src/utils/schedule_prefetch.js`、登录/登出流程中调用门面。
- 新增 `src/utils/widget_snapshot.ts`，从现有 `Schedule_Cache` 派生 `Today_Course_Snapshot`；不改动 `schedule_prefetch.js` 的核心缓存逻辑。
- Android 工程（`android/app/`）新增 `com.hbut.mini.widget.*` 包与若干资源，通过 Capacitor `cap sync` 自动纳管。
- iOS 工程（`ios/App/`）新增一个 Widget Extension Target，主 App Target 启用 App Group。
- 不新增网络接口、不修改后端契约。

---

## 2. Design Decisions

### 2.1 技术路线（A / B / C）

**最终决定：采用路线 B。** 本设计的全部章节都基于该前提。若用户在 Open Decisions 评审阶段翻转为 A 或 C，需整体重写设计文档。

| 路线 | 核心动作 | 代价 | 收益 | 决定 |
| --- | --- | --- | --- | --- |
| A | 迁移移动端至 Tauri Mobile，使用 `s00d/tauri-plugin-widgets` | 重建 Android / iOS 工程、重建签名发布、已有 Capacitor 能力需全部重做 | 与桌面 Tauri Core 栈统一 | ❌ 放弃：成本远大于单一小组件功能 |
| B | 保留 Capacitor，新增原生 Widget + 自研 Capacitor 插件 | 写一次原生插件 + 两端 Widget UI | 不破坏现有工程、直接复用已有 `@capacitor/preferences` / 后台任务 | ✅ 采纳 |
| C | 仅做桌面端（Tauri）小组件，不做手机 Widget | 需要重写 spec 名称与范围 | 避开移动端原生工作 | ❌ 放弃：偏离需求 |

### 2.2 Android：Glance vs RemoteViews

| 方案 | 适用版本 | 优点 | 缺点 | 决定 |
| --- | --- | --- | --- | --- |
| RemoteViews（`AppWidgetProvider` + `RemoteViewsService`） | API 22+ | 与工程现有 minSdk 一致、生态成熟 | XML 布局表达力有限、列表项需 Service | ✅ 主路径 |
| Jetpack Glance | API 21+ 语法允许，但 Material You 动态色 API 31+ 才成熟 | 声明式、Compose 风格 | 要引入 `androidx.glance:glance-appwidget` 及其 Kotlin 编译链，尺寸适配仍需适配 | ⚪ 可选后续升级（Android 12+），当前 spec 不依赖 |

决定：**主路径 RemoteViews**。`WidgetRenderStrategy` 留抽象接口，Glance 作为后续增强不阻塞本 spec。

### 2.3 iOS：支持尺寸与锁屏

- 默认 `systemMedium`，同时提供 `systemSmall` / `systemLarge`（需求 R3.2）。
- **不** 支持 `accessoryRectangular`（锁屏）、Live Activity、Dynamic Island（需求 R13.2）。
- iOS 部署目标 **14.0**（需求 R3.8），覆盖绝大多数在用设备。

### 2.4 刷新：WorkManager vs 仅 `updatePeriodMillis`

| 策略 | 精度 | 电量影响 | 决定 |
| --- | --- | --- | --- |
| 仅 `updatePeriodMillis` | 系统保底 30 分钟 | 低 | ✅ 作为保底（需求 R6.1） |
| + WorkManager `PeriodicWorkRequest(15m)` | 15 分钟 | 低（`NetworkType.NOT_REQUIRED`、`requiresBatteryNotLow=false`） | ✅ 叠加使用（需求 R6.2） |
| AlarmManager / ExactAlarm | 秒级 | 高，Android 12+ 受限 | ❌ 不采用 |

决定：**两者叠加**。`updatePeriodMillis=1800000` 作为兜底，WorkManager 周期 15 分钟作为准时节拍。每日合计触发 ≤ 96 次 WorkManager + 48 次 updatePeriod ≈ 144 次，超过需求 R9.5 的「每日额外 WorkManager 任务不超过 100 次」限制。为此我们把 WorkManager 周期设为 **15 分钟** 且 `ExistingPeriodicWorkPolicy.KEEP`，同一时刻系统只会存在一个实例（24h × 60 ÷ 15 = 96 次，仍在上限内）。

### 2.5 数据共享介质（App Group UserDefaults vs JSON 文件）

| 介质 | Android | iOS | 优点 | 缺点 | 决定 |
| --- | --- | --- | --- | --- | --- |
| SharedPreferences（MODE_PRIVATE） | ✅ | — | 同包同签名隔离、线程安全 | 单 value 建议 ≤ 256 KB，本 snapshot ≤ 32 KB 完全够用 | ✅ Android 采用 |
| DataStore | ✅ | — | 协程友好 | 需要 Kotlin 协程依赖、在 RemoteViewsFactory 中读取较繁琐 | ❌ 本 spec 不采用，避免额外依赖 |
| App Group UserDefaults | — | ✅ | 读写便捷、系统原生跨 Target 共享 | 单 key 建议 ≤ 32 KB | ✅ iOS 采用 |
| App Group 共享容器 JSON 文件 | — | 可选 | 体积无硬限 | 解码开销、并发控制需手写 | ❌ 本 spec 不采用 |

决定：

- Android → `SharedPreferences("mini_hbut_widget", MODE_PRIVATE)`。
- iOS → `UserDefaults(suiteName: "group.com.hbut.mini")`。
- **硬约束**：snapshot 序列化结果 ≤ 32 KB，两端一致（详见 §4.4）。

### 2.6 深链接形式

- 统一自定义 scheme：`minihbut://schedule?date=YYYY-MM-DD&source=widget`。
- Universal Link（`https://hbut.6661111.xyz/schedule?...`）作为 iOS 退路（可选，不阻塞本 spec）。
- Android 端同时在 `MainActivity` 注册 intent-filter 以兜底 App Link。

### 2.7 清空策略

- 退出登录 / 清空数据：主 App 调用 `clearSnapshot()` → Shared_Store 写入 `snapshot_json=""`、`snapshot_version=1` → 渲染进入 `login` 分支。
- 跨天（本地日期变更）：主 App 在下次活跃时重算 snapshot 并覆盖写入，渲染自动切换当日。
- 快照失效（反序列化失败）：Widget 渲染降级到 `dataError` 分支，不删除 snapshot 原值，便于主 App 下次修复。

---

## 3. Architecture

### 3.1 端到端架构图

```text
┌──────────────── Mini-HBUT App（Capacitor Webview 宿主） ─────────────────┐
│  Vue 3 Web 层                                                            │
│   ScheduleView / Dashboard / 登录登出流程                                │
│             │ 成功刷新 / 启动恢复 / 跨天 / 登出                          │
│             ▼                                                            │
│   utils/widget_snapshot.ts   ─── 生成 TodayCourseSnapshot                │
│             │                                                            │
│             ▼                                                            │
│   platform/capacitor/widget.ts  (TS 门面)                                │
│             │ Capacitor.Plugins.MiniHbutWidget.*                         │
└─────────────┼────────────────────────────────────────────────────────────┘
              │
              │ bridge over JSON-RPC
              ▼
┌──────────────── Capacitor Plugin: MiniHbutWidget ────────────────────────┐
│ Android (Kotlin)                 │ iOS (Swift)                           │
│ MiniHbutWidgetPlugin.kt          │ MiniHbutWidgetPlugin.swift            │
│   ├─ WidgetDataStore (SP)        │   ├─ WidgetDataStore (AppGroup UD)    │
│   ├─ WidgetRefreshScheduler      │   └─ WidgetCenter.reloadTimelines()   │
│   └─ AppWidgetManager.update()   │                                       │
└──────────────┬────────────────────────┬──────────────────────────────────┘
               │ 写 snapshot / 触发刷新  │ 写 snapshot / reloadTimelines
               ▼                        ▼
┌──────────────── Shared_Store ────────────────────────────────────────────┐
│ Android: SharedPreferences("mini_hbut_widget")                           │
│ iOS   : UserDefaults(suiteName: "group.com.hbut.mini")                   │
└──────────────┬────────────────────────┬──────────────────────────────────┘
               │ 读 snapshot            │ 读 snapshot
               ▼                        ▼
┌───── Android Widget ─────┐  ┌───── iOS Widget Extension ─────┐
│ TodayCoursesProvider     │  │ MiniHbutTodayWidgetBundle      │
│   ├─ RemoteViewsService  │  │   ├─ TodayCoursesProvider      │
│   ├─ RemoteViewsFactory  │  │   ├─ TodayCoursesEntryView     │
│   └─ WidgetRefreshWorker │  │   └─ WidgetDataStore           │
└──────────────┬───────────┘  └──────────────┬─────────────────┘
               │ PendingIntent                │ widgetURL
               ▼                              ▼
           Android Home                    iOS Home
               │ click                        │ click
               ▼                              ▼
        minihbut://schedule?date=YYYY-MM-DD&source=widget
               │
               ▼
        MainActivity / AppDelegate → Capacitor notifyListeners
               │
               ▼
        Vue App.vue 监听 → 切换课表视图并高亮
```

### 3.2 组件清单

| 层 | 组件 | 语言 | 职责 |
| --- | --- | --- | --- |
| Web | `src/utils/widget_snapshot.ts` | TS | 从 `Schedule_Cache` 派生 `TodayCourseSnapshot` |
| Web | `src/platform/capacitor/widget.ts` | TS | 门面：校验 + 序列化 + 调用 Plugin |
| Web | `src/App.vue` | Vue | 监听 `widgetDeeplink` 事件，切换到课表视图并定位当日 |
| 插件 | `MiniHbutWidgetPlugin.kt` | Kotlin | Android 插件：参数校验、写 SP、触发 AppWidgetManager |
| 插件 | `MiniHbutWidgetPlugin.swift` | Swift | iOS 插件：参数校验、写 App Group UD、调用 WidgetCenter |
| Android Widget | `TodayCoursesProvider.kt` | Kotlin | `AppWidgetProvider` 生命周期，构建 RemoteViews |
| Android Widget | `TodayCoursesRemoteViewsService.kt` | Kotlin | `RemoteViewsService` 入口 |
| Android Widget | `TodayCoursesRemoteViewsFactory.kt` | Kotlin | 列表行 Factory，读 SP、渲染每行 |
| Android Widget | `WidgetRefreshWorker.kt` | Kotlin | WorkManager 周期任务 |
| Android Widget | `WidgetDataStore.kt` | Kotlin | `SharedPreferences` 同步封装 |
| iOS Widget | `MiniHbutTodayWidgetBundle.swift` | Swift | WidgetBundle 入口 |
| iOS Widget | `TodayCoursesWidget.swift` | Swift | `StaticConfiguration` + 三尺寸注册 |
| iOS Widget | `TodayCoursesProvider.swift` | Swift | `TimelineProvider` 实现 |
| iOS Widget | `TodayCoursesEntryView.swift` | Swift | SwiftUI View（三尺寸） |
| iOS Widget | `WidgetDataStore.swift` | Swift | 读 App Group UD |

### 3.3 数据流时序

#### 3.3.1 生成快照（Silent_Refresh 成功 / 前台启动 / 跨天 / 手动刷新）

```text
ScheduleView / schedule_prefetch.js
     │ (课表刷新成功、cache 已落盘)
     ▼
widget_snapshot.ts :: buildTodayCourseSnapshot(cache, now)
     │ (按本周本日过滤 + 排序 + 截断)
     ▼
widget.ts :: writeSnapshot(snapshot)
     │ JSON.stringify + 字节数校验（≤ 32 KB）
     ▼
Capacitor.Plugins.MiniHbutWidget.writeSnapshot({ snapshot })
     │
     ├─ Android: SP.putString("snapshot_json", json)
     │    └─ AppWidgetManager.updateAppWidget(ids, remoteViews)
     │
     └─ iOS: UD.set(json, forKey: "snapshot_json")
          └─ WidgetCenter.shared.reloadTimelines(ofKind: "TodayCoursesWidget")
```

#### 3.3.2 Widget 读取渲染

```text
Android:
  WorkManager(15m) ─► WidgetRefreshWorker
       └─► AppWidgetManager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
            └─► RemoteViewsFactory.onDataSetChanged
                 └─► WidgetDataStore.readSnapshot()
                      └─► 渲染每行 RemoteViews

iOS:
  System clock / reloadTimelines ─► TodayCoursesProvider.getTimeline
       └─► WidgetDataStore.readSnapshot()
            └─► buildEntries(snapshot, now) (见 §8.2)
                 └─► EntryView 渲染
```

#### 3.3.3 刷新触发

- 主 App 主动：`writeSnapshot` → 插件内部最后一步同步触发 `Widget_Refresh_Tick`。
- 被动：WorkManager / iOS 系统调度。
- 用户交互：Widget 本身不可编辑，不产生额外刷新触发。

---

## 4. Data Model（Today_Course_Snapshot）

### 4.1 JSON Schema（严格字段）

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TodayCourseSnapshot",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "generated_at", "date", "student_id", "week_index", "weekday", "courses"],
  "properties": {
    "version":      { "type": "integer", "const": 1 },
    "generated_at": { "type": "string", "format": "date-time" },
    "date":         { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "student_id":   { "type": "string", "maxLength": 32 },
    "week_index":   { "type": "integer", "minimum": 0, "maximum": 60 },
    "weekday":      { "type": "integer", "minimum": 1, "maximum": 7 },
    "courses": {
      "type": "array",
      "maxItems": 14,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["period_start", "period_end", "time_start", "time_end", "name", "location", "teacher"],
        "properties": {
          "period_start": { "type": "integer", "minimum": 1, "maximum": 14 },
          "period_end":   { "type": "integer", "minimum": 1, "maximum": 14 },
          "time_start":   { "type": "string", "pattern": "^\\d{2}:\\d{2}$" },
          "time_end":     { "type": "string", "pattern": "^\\d{2}:\\d{2}$" },
          "name":         { "type": "string", "minLength": 1, "maxLength": 80 },
          "location":     { "type": "string", "maxLength": 80 },
          "teacher":      { "type": "string", "maxLength": 80 },
          "color":        { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" }
        }
      }
    }
  }
}
```

### 4.2 额外契约（Schema 之外）

- `courses` 按 `time_start` 严格升序排列（同 `time_start` 下再按 `period_start` 升序）。
- 每项课程 `period_start ≤ period_end` 且 `time_start ≤ time_end`（字符串按字典序即等价于时间序）。
- `courses` 每项必须严格属于本周本日实例；跨周的多实例课程须去重。
- `student_id` 保存原值（非脱敏），脱敏仅在渲染层进行（见 §10 与 PBT Property P4）。
- `color` 可选；缺省时渲染使用主题色。

### 4.3 序列化方式与大小约束

- 编码：UTF-8 JSON（无 BOM，无缩进，使用 `JSON.stringify(x)` 默认格式）。
- 单 snapshot 序列化后 ≤ **32 KB**（32 × 1024 字节）。超限策略：
  1. 按 `time_start` 倒序裁剪尾部 `courses`（优先保留早课），直到 `≤ 32 KB − 256 字节` 安全阈值。
  2. 裁剪数量 N 通过渲染层的「+N 节」标签暴露给用户。
  3. 若裁剪到 `courses=[]` 仍超限（极端异常）则拒绝写入，返回错误码 `SNAPSHOT_TOO_LARGE`。

### 4.4 版本兼容策略

| 场景 | 行为 |
| --- | --- |
| Widget 读到 `snapshot_version == 1` | 正常反序列化 |
| Widget 读到 `snapshot_version > 1`（主 App 升级后尚未降级） | 尝试解析主字段，未知字段忽略；若关键字段缺失则降级为 `dataError` |
| Widget 读到 `snapshot_version < 1` | 视为非法，降级为 `dataError` |
| 反序列化抛异常（JSON 非法） | 捕获并降级为 `dataError`，不删原值，不让 Widget 进程崩溃 |
| Shared_Store 无 `snapshot_json` 键 | 渲染 `login` 分支 |

后续升级策略：`version` 只允许单调递增；破坏性修改需要引入 `version=2` 分支，Widget 侧同时保留 v1 / v2 读路径，过渡 2 个版本后再移除 v1。

---

## 5. Shared Store 设计

### 5.1 Android

- **介质**：`SharedPreferences`，名 = `mini_hbut_widget`，mode = `MODE_PRIVATE`。
- **文件路径**：系统默认 `/data/data/com.hbut.mini/shared_prefs/mini_hbut_widget.xml`（同包同签名隔离，不对外导出）。
- **Key 约定**：

| Key | 类型 | 含义 |
| --- | --- | --- |
| `snapshot_json` | `String` | UTF-8 JSON，内容等价于 §4.1 |
| `snapshot_version` | `Int` | 当前固定为 `1` |
| `last_write_ts` | `Long` | 最近一次写入的 `System.currentTimeMillis()` |
| `student_id_mask` | `String` | 缓存脱敏后的学号，避免渲染层重复计算（可选优化） |

- **DataStore**：本 spec **不采用** Jetpack DataStore，理由：

  1. `RemoteViewsFactory.onDataSetChanged` 在 Binder 线程同步执行，DataStore 的协程 API 不利于在此上下文消费。
  2. 单 value 体积 ≤ 32 KB，SharedPreferences 足够稳定。

- **并发策略**：

  - 主 App 的 `MiniHbutWidgetPlugin.writeSnapshot` 使用 `edit().putString(...).commit()`（同步写），保证返回到 Web 层时磁盘已落盘。
  - Widget 侧在 `onDataSetChanged` 中通过 `getString` 读取；`SharedPreferences` 本身对单次 get/put 线程安全。
  - 不再新增额外互斥锁；如未来出现并发测试失败，再引入 `synchronized(lock)` 包装 `WidgetDataStore` 的 read/write 入口。

### 5.2 iOS

- **介质**：`UserDefaults(suiteName: "group.com.hbut.mini")`。
- **App Group**：`group.com.hbut.mini`，主 App Target 与 Widget Extension Target 均需在 Capabilities 中开启该 group（见需求 R12.3）。
- **Key 约定**：与 Android 对齐，共用 `snapshot_json` / `snapshot_version` / `last_write_ts` 三键。
- **可选 JSON 文件回退**：若未来遇到 UserDefaults 32 KB 软限制问题，回退到 App Group 共享容器下的 `Library/Application Support/MiniHbut/widget_snapshot.json`。本 spec 暂不采用。
- **并发**：`UserDefaults` 线程安全；Widget 读、主 App 写互不阻塞。

### 5.3 清空 / 失效策略

| 触发 | 行为 |
| --- | --- |
| 用户点「退出登录」 | 主 App 在登出流程 finally 块调用 `widget.ts :: clearSnapshot()` → 插件将 `snapshot_json` 置空串 + 触发 refresh，渲染降级 `login` |
| 用户点「清空数据 / 缓存」 | 同上 |
| 跨天（本地日期从 D1 到 D2） | 主 App 下次活跃时用 D2 重新生成 snapshot 并覆盖写入 |
| 反序列化失败 | Widget 侧不清空原值，仅渲染 `dataError`；交由主 App 下次写入修复 |
| 卸载 App | Android 随 App 一起清理；iOS 随 App Group 容器清理 |

---

## 6. Widget Bridge Plugin（Capacitor 插件）

### 6.1 包结构与放置

`mini-hbut-widget` 为仓内插件（Monorepo 内联），不发布到 npm。推荐结构：

```text
packages/capacitor-plugin-mini-hbut-widget/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts                ← 导出 getWidgetBridge() 门面
    definitions.ts          ← 接口声明（与 §6.2 一致）
    web.ts                  ← Web/Tauri 运行时兜底，全部 reject UNAVAILABLE
  android/
    build.gradle
    src/main/
      AndroidManifest.xml
      java/com/hbut/mini/widget/plugin/
        MiniHbutWidgetPlugin.kt
  ios/
    Plugin/
      MiniHbutWidgetPlugin.swift
      MiniHbutWidgetPlugin.m
    MiniHbutWidgetPlugin.podspec
```

主仓 `package.json` 通过 workspace 指向 `packages/capacitor-plugin-mini-hbut-widget`；`capacitor.config.ts` 无需改动，Capacitor 会自动发现 `android/` 与 `ios/Plugin`。

> 备选：把插件 Kotlin / Swift 直接内联在 `android/app/` 与 `ios/App/` 中（`register` 于 `MainActivity.onCreate`）。本 spec 推荐独立包方式，便于未来剥离。

### 6.2 TypeScript 接口（`definitions.ts`）

```ts
// packages/capacitor-plugin-mini-hbut-widget/src/definitions.ts

/** 与主 App 共享的单门课程，对应 snapshot.courses[i] */
export interface WidgetCourse {
  period_start: number   // 1..14
  period_end: number     // 1..14，且 >= period_start
  time_start: string     // "HH:mm"
  time_end: string       // "HH:mm"
  name: string           // 1..80
  location: string       // 0..80
  teacher: string        // 0..80
  color?: string         // "#RRGGBB"
}

export interface TodayCourseSnapshot {
  version: 1
  generated_at: string   // ISO 8601
  date: string           // "YYYY-MM-DD"
  student_id: string     // 原值，脱敏由渲染层负责
  week_index: number     // 1..60
  weekday: number        // 1..7（1=周一）
  courses: WidgetCourse[]
}

export type WidgetCapability = 'android-appwidget' | 'ios-widgetkit' | 'unavailable'

export interface WidgetCapabilities {
  platform: WidgetCapability
  /** 系统是否当前安装了至少一个本 App 的 Widget 实例（尽力而为） */
  pinned: boolean
}

export type WidgetBridgeErrorCode =
  | 'SNAPSHOT_TOO_LARGE'     // 超过 32 KB
  | 'WRITE_FAILED'           // 底层 I/O 失败
  | 'INVALID_SNAPSHOT'       // schema 校验失败
  | 'UNAVAILABLE'            // 非移动端运行时

export interface MiniHbutWidgetPlugin {
  writeSnapshot(options: { snapshot: TodayCourseSnapshot }): Promise<void>
  clearSnapshot(): Promise<void>
  requestRefresh(): Promise<void>
  getCapabilities(): Promise<WidgetCapabilities>
}
```

门面 `src/platform/capacitor/widget.ts` 在主仓内对上述 Plugin 做封装，补充字节数与 schema 校验，并把非 Capacitor 环境下的调用降级为 no-op（`console.debug` 一次）。

### 6.3 Android 实现（Kotlin）

```kotlin
// packages/capacitor-plugin-mini-hbut-widget/android/src/main/java/...
package com.hbut.mini.widget.plugin

@CapacitorPlugin(name = "MiniHbutWidget")
class MiniHbutWidgetPlugin : Plugin() {

  private val dataStore by lazy { WidgetDataStore(context) }

  @PluginMethod
  fun writeSnapshot(call: PluginCall) {
    val json = call.getObject("snapshot")?.toString()
      ?: return call.reject("INVALID_SNAPSHOT", "snapshot is null")
    if (json.toByteArray(Charsets.UTF_8).size > MAX_SNAPSHOT_BYTES) {
      return call.reject("SNAPSHOT_TOO_LARGE", "snapshot > 32KB")
    }
    val ok = dataStore.writeSnapshot(json) // 同步 commit()
    if (!ok) return call.reject("WRITE_FAILED", "SharedPreferences commit failed")
    WidgetRefreshScheduler.triggerImmediate(context)
    call.resolve()
  }

  @PluginMethod
  fun clearSnapshot(call: PluginCall) {
    dataStore.clear()
    WidgetRefreshScheduler.triggerImmediate(context)
    call.resolve()
  }

  @PluginMethod
  fun requestRefresh(call: PluginCall) {
    WidgetRefreshScheduler.triggerImmediate(context)
    call.resolve()
  }

  @PluginMethod
  fun getCapabilities(call: PluginCall) {
    val ret = JSObject()
    ret.put("platform", "android-appwidget")
    ret.put("pinned", WidgetRefreshScheduler.hasPinnedInstance(context))
    call.resolve(ret)
  }

  companion object { const val MAX_SNAPSHOT_BYTES = 32 * 1024 }
}
```

- `WidgetDataStore`：见 §5.1，封装 `SharedPreferences` 的 `writeSnapshot(json: String): Boolean`、`readSnapshot(): String?`、`clear()`、`lastWriteTs(): Long`。
- `WidgetRefreshScheduler.triggerImmediate(context)`：拿 `AppWidgetManager.getAppWidgetIds(ComponentName(context, TodayCoursesProvider::class.java))` → 发送自定义 action `ACTION_REFRESH` 或直接 `AppWidgetManager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)`。
- `hasPinnedInstance`：等价于上面 `ids.isNotEmpty()`。

### 6.4 iOS 实现（Swift）

```swift
// packages/capacitor-plugin-mini-hbut-widget/ios/Plugin/MiniHbutWidgetPlugin.swift
import Capacitor
import WidgetKit

@objc(MiniHbutWidgetPlugin)
public class MiniHbutWidgetPlugin: CAPPlugin {

  private let kind = "TodayCoursesWidget"
  private let suite = "group.com.hbut.mini"
  private let maxBytes = 32 * 1024
  private lazy var store = WidgetDataStore(suiteName: suite)

  @objc func writeSnapshot(_ call: CAPPluginCall) {
    guard let obj = call.getObject("snapshot"),
          let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
          let json = String(data: data, encoding: .utf8) else {
      call.reject("INVALID_SNAPSHOT"); return
    }
    if data.count > maxBytes { call.reject("SNAPSHOT_TOO_LARGE"); return }
    if !store.write(json) { call.reject("WRITE_FAILED"); return }
    WidgetCenter.shared.reloadTimelines(ofKind: kind)
    call.resolve()
  }

  @objc func clearSnapshot(_ call: CAPPluginCall) {
    store.clear()
    WidgetCenter.shared.reloadTimelines(ofKind: kind)
    call.resolve()
  }

  @objc func requestRefresh(_ call: CAPPluginCall) {
    WidgetCenter.shared.reloadTimelines(ofKind: kind)
    call.resolve()
  }

  @objc func getCapabilities(_ call: CAPPluginCall) {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.getCurrentConfigurations { result in
        var pinned = false
        if case .success(let infos) = result { pinned = infos.contains { $0.kind == self.kind } }
        call.resolve(["platform": "ios-widgetkit", "pinned": pinned])
      }
    } else {
      call.resolve(["platform": "unavailable", "pinned": false])
    }
  }
}
```

`MiniHbutWidgetPlugin.m` 中使用 `CAP_PLUGIN` / `CAP_PLUGIN_METHOD` 标准宏将上述方法暴露给 Capacitor。

---

## 7. Android Widget 设计

### 7.1 AppWidgetProvider

```kotlin
// android/app/src/main/java/com/hbut/mini/widget/TodayCoursesProvider.kt
package com.hbut.mini.widget

class TodayCoursesProvider : AppWidgetProvider() {

  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> WidgetRenderer.updateWidget(ctx, mgr, id) }
  }

  override fun onEnabled(ctx: Context) {
    WidgetRefreshScheduler.ensurePeriodic(ctx) // 登记 WorkManager 周期任务
  }

  override fun onDisabled(ctx: Context) {
    WidgetRefreshScheduler.cancelPeriodic(ctx)
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    super.onReceive(ctx, intent)
    if (intent.action == ACTION_REFRESH) {
      val mgr = AppWidgetManager.getInstance(ctx)
      val ids = mgr.getAppWidgetIds(ComponentName(ctx, TodayCoursesProvider::class.java))
      onUpdate(ctx, mgr, ids)
    }
  }

  companion object {
    const val ACTION_REFRESH = "com.hbut.mini.widget.ACTION_REFRESH"
  }
}
```

全限定名：`com.hbut.mini.widget.TodayCoursesProvider`（满足需求 R12.4）。

### 7.2 `appwidget-provider.xml`

```xml
<!-- android/app/src/main/res/xml/appwidget_today_courses.xml -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:minResizeWidth="180dp"
    android:minResizeHeight="60dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_today_courses_4x2"
    android:previewImage="@drawable/widget_preview_today_courses"
    android:description="@string/widget_today_courses_desc"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:widgetFeatures="reconfigurable" />
```

### 7.3 渲染方式

- **主路径**：RemoteViews。`widget_today_courses_4x2.xml` 的结构：

  ```text
  RootFrame (widget_background)
    ├─ 顶部栏：LinearLayout
    │     ├─ TextView "今日课程 · 第 W 周 · YYYY-MM-DD"
    │     └─ TextView "学号 12**34"（脱敏）
    ├─ ListView @+id/widget_list (setRemoteAdapter)
    └─ TextView @+id/widget_overflow_tag（动态显示「+N 节」）
  ```

  `widget_item_course_row.xml` 包含节次徽标、`time_start - time_end`、课名、教室四行。

- **可选备选（Android 12+ / Glance）**：若未来引入 `androidx.glance:glance-appwidget`，新增 `TodayCoursesGlanceWidget : GlanceAppWidget`，仅在 `Build.VERSION.SDK_INT >= 31` 时生效；RemoteViews 仍保留作为 Android < 12 路径。本 spec 不要求立即实现 Glance 路径。

### 7.4 WorkManager 周期任务

```kotlin
// android/app/src/main/java/com/hbut/mini/widget/WidgetRefreshScheduler.kt
object WidgetRefreshScheduler {
  private const val WORK_NAME = "mini_hbut_widget_today_refresh"

  fun ensurePeriodic(ctx: Context) {
    val req = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(15, TimeUnit.MINUTES)
      .setConstraints(Constraints.Builder()
        .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
        .setRequiresBatteryNotLow(false)
        .build())
      .addTag("widget-today")
      .build()
    WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
      WORK_NAME,
      ExistingPeriodicWorkPolicy.KEEP,
      req
    )
  }

  fun cancelPeriodic(ctx: Context) {
    WorkManager.getInstance(ctx).cancelUniqueWork(WORK_NAME)
  }

  fun triggerImmediate(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    val ids = mgr.getAppWidgetIds(ComponentName(ctx, TodayCoursesProvider::class.java))
    if (ids.isNotEmpty()) {
      WidgetRenderer.updateWidgets(ctx, mgr, ids)
      mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
    }
  }

  fun hasPinnedInstance(ctx: Context): Boolean {
    val mgr = AppWidgetManager.getInstance(ctx)
    return mgr.getAppWidgetIds(ComponentName(ctx, TodayCoursesProvider::class.java)).isNotEmpty()
  }
}
```

- `ExistingPeriodicWorkPolicy.KEEP`：同名已存在则复用，避免每次启动重新排队导致 > 100 次/天（满足 R9.5）。
- `WidgetRefreshWorker.doWork`：仅调用 `notifyAppWidgetViewDataChanged`，不发起任何网络请求（满足 R9.4）。

### 7.5 PendingIntent 与 Deep Link

```kotlin
// WidgetRenderer 内部
val uri = Uri.parse("minihbut://schedule")
  .buildUpon()
  .appendQueryParameter("date", snapshot.date)
  .appendQueryParameter("source", "widget")
  .build()
val intent = Intent(Intent.ACTION_VIEW, uri).apply {
  setPackage(ctx.packageName) // 强制本应用处理
  addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
}
val pi = PendingIntent.getActivity(
  ctx, /*req*/ snapshot.date.hashCode(), intent,
  PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
)
remoteViews.setOnClickPendingIntent(R.id.widget_root, pi)
```

`MainActivity` 的 intent-filter 增量：

```xml
<intent-filter android:autoVerify="false">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="minihbut" android:host="schedule" />
</intent-filter>
```

### 7.6 Material You / 深色模式 / 大字号

- **API 31+**：背景 `@android:color/system_accent1_50`（light）/ `@android:color/system_accent1_900`（dark），文字使用 `@android:color/system_neutral1_900` / `@android:color/system_neutral1_50`。
- **API < 31**：内置 `res/values/colors.xml` + `res/values-night/colors.xml` 两套色板。
- **大字号**：`res/layout/widget_item_course_row.xml` 所有 `TextView` 设 `android:textSize="14sp"`、不设定固定高度；节次徽标使用 `layout_width="wrap_content"`，确保 `Large (1.3×)` 不截断（R11.1）。
- **无障碍**：行根 `android:contentDescription` 绑定 `节次 时间 课程名 教室`（R11.3）。

### 7.7 资源清单

| 路径 | 内容 |
| --- | --- |
| `res/xml/appwidget_today_courses.xml` | 见 §7.2 |
| `res/layout/widget_today_courses_4x2.xml` | 默认 4×2 布局 |
| `res/layout/widget_today_courses_2x2.xml` | 2×2 紧凑布局 |
| `res/layout/widget_today_courses_4x1.xml` | 4×1 单行布局 |
| `res/layout/widget_item_course_row.xml` | ListView 行 |
| `res/drawable/widget_background.xml` | 圆角 12dp + 主题色 |
| `res/drawable-xxhdpi/widget_preview_today_courses.png` | 预览图（Widget 选择器） |
| `res/values/colors.xml` + `values-night/colors.xml` | 浅/深色兜底 |
| `res/values/strings_widget.xml` | "今日课程"等全部中文文案 |

---

## 8. iOS Widget 设计

### 8.1 Extension Target

- **Target 名称**：`MiniHbutTodayWidget`
- **Bundle ID**：`com.hbut.mini.widget`（主 App `com.hbut.mini` 的子 bundle）
- **部署目标**：iOS 14.0（需求 R3.8）
- **必需 Capability**：`com.apple.security.application-groups = ["group.com.hbut.mini"]`
- **Info.plist**：
  - `NSExtensionPointIdentifier = com.apple.widgetkit-extension`
  - `CFBundleDisplayName = Mini-HBUT · 今日课程`

### 8.2 TimelineProvider 设计

```swift
// MiniHbutTodayWidget/TodayCoursesProvider.swift
struct TodayCoursesProvider: TimelineProvider {

  func placeholder(in context: Context) -> TodayCoursesEntry {
    .placeholder()
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayCoursesEntry) -> Void) {
    completion(loadEntry(now: Date(), isPreview: context.isPreview))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayCoursesEntry>) -> Void) {
    let snapshot = WidgetDataStore.shared.readSnapshot()
    let entries = buildEntries(snapshot: snapshot, now: Date())
    let policy: TimelineReloadPolicy = entries.isEmpty
      ? .after(Date().addingTimeInterval(15 * 60))    // 兜底 15 分钟
      : .atEnd
    completion(Timeline(entries: entries, policy: policy))
  }
}
```

`buildEntries(snapshot, now)` 规则（在 `Asia/Shanghai` 时区下执行）：

1. 若 `snapshot == nil` 或 `snapshot.date != today`：返回单个 `entry(now, .staleOrLogin)`。
2. 否则：
   - 加入 `entry(now, .overview(snapshot))`。
   - 对每门 `c ∈ snapshot.courses`：
     - 若 `c.time_start − 5m > now`：加入 `entry(c.time_start − 5m, .highlightNext(c))`。
     - 若 `c.time_end > now`：加入 `entry(c.time_end, .afterCourse(c))`。
   - 按 `date` 升序、去重，取前 **4 个** entry（iOS 推荐上限）。
3. policy：上述 2 的情况使用 `.atEnd`；情况 1 使用 `.after(now + 15m)`。

### 8.3 EntryView（SwiftUI）三尺寸布局

```swift
@ViewBuilder
var body: some View {
  switch family {
  case .systemSmall:  SmallView(entry: entry)
  case .systemMedium: MediumView(entry: entry)   // 默认
  case .systemLarge:  LargeView(entry: entry)
  default: MediumView(entry: entry)
  }
}
```

- `SmallView`：顶部「今日课程」标题 + 一行下一节摘要（节次 / time / name）。
- `MediumView`：标题 + 脱敏学号 + 最多 3 门课 + `+N 节` 角标。
- `LargeView`：标题 + 脱敏学号 + 最多 6 门课 + `+N 节` 角标。

公共适配：

- `.widgetBackground(WidgetBackgroundModifier())`：iOS 17 使用 `.containerBackground(for: .widget)`, iOS 14–16 使用 `.background(Color("WidgetBg"))`。
- 跟随系统深浅：`.preferredColorScheme(nil)` + 颜色资源 `Assets.xcassets/WidgetBg`（light/dark 两条目）。
- Dynamic Type：文本使用 `.font(.body / .headline)`，允许系统放大到 `xLarge`（R11.2）。
- `.accessibilityLabel("第 \(c.period_start) 节 \(c.time_start) 到 \(c.time_end) \(c.name) \(c.location)")`（R11.3）。

### 8.4 App Group 配置

- 主 App Target 与 Widget Extension Target 的 `.entitlements` 文件都需写入：
  ```xml
  <key>com.apple.security.application-groups</key>
  <array><string>group.com.hbut.mini</string></array>
  ```
- `WidgetDataStore.shared = WidgetDataStore(suiteName: "group.com.hbut.mini")` 为唯一读入口。

### 8.5 点击跳转

SwiftUI View 根部使用 `widgetURL(URL(string: "minihbut://schedule?date=\(entry.date)&source=widget"))`。若需要行级跳转（仅 large 可用）使用 `Link(destination:, label:)` 携带 `period` 参数。

`Info.plist`（主 App）追加：

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>minihbut</string></array>
  </dict>
</array>
```

Universal Link 退路（可选）：配合 `apple-app-site-association` 下发 `/schedule` 路径。

### 8.6 深色模式、Dynamic Type 适配

- 所有颜色走资源：`WidgetBg`、`WidgetFg`、`WidgetAccent`。
- 所有字号走语义 Token：`.caption2`（学号）、`.caption`（教室）、`.subheadline`（time）、`.headline`（课名）。
- 强制禁用 iPad 大布局下的手动拉伸导致 text truncation：`.minimumScaleFactor(0.85)` + `.lineLimit(1)`。

---

## 9. 主 App 集成点

### 9.1 Snapshot 生成函数

新增文件 **`src/utils/widget_snapshot.ts`**，单职责：从已有 `Schedule_Cache`（`schedule_prefetch.js` 输出的 payload）派生 `TodayCourseSnapshot`。

```ts
// src/utils/widget_snapshot.ts

import type { TodayCourseSnapshot, WidgetCourse } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'

/** 将任意 Schedule_Cache + 当天日期转为 snapshot；纯函数，便于 PBT */
export function buildTodayCourseSnapshot(input: {
  cache: ScheduleCachePayload
  now: Date
  studentId: string
  weekIndex: number
}): TodayCourseSnapshot {
  const date = formatLocalDate(input.now, 'Asia/Shanghai')          // YYYY-MM-DD
  const weekday = getIsoWeekday(input.now, 'Asia/Shanghai')          // 1..7
  const courses = extractCoursesOfDay(input.cache, input.weekIndex, weekday)
  const sorted = courses
    .slice()
    .sort((a, b) => a.time_start.localeCompare(b.time_start)
      || a.period_start - b.period_start)
  return {
    version: 1,
    generated_at: new Date(input.now).toISOString(),
    date,
    student_id: input.studentId,
    week_index: input.weekIndex,
    weekday,
    courses: sorted
  }
}
```

- `extractCoursesOfDay`：遍历 `cache.data`，过滤 `weeks` 包含 `weekIndex` 且 `weekday` 匹配的课程；同一课程的不同实例去重。
- `formatLocalDate` / `getIsoWeekday`：统一用 `Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai' })` 实现，避免设备时区差异。
- 函数全程无 I/O，不触碰 `localStorage`，便于 fast-check 直接喂随机 cache 做 property test。

### 9.2 触发点

| 触发时机 | 调用链 | 对应需求 |
| --- | --- | --- |
| Silent_Refresh 成功 | `schedule_prefetch.warmupScheduleForStudent` 成功分支 → `afterScheduleRefresh(sid, payload)` → `writeSnapshot` | R5.1、R5.6 |
| 前台启动恢复缓存 | `main.ts` 启动尾部 / `App.vue` 首次挂载 → `tryWriteSnapshotFromCache(sid)` | R5.2（≤5s） |
| 手动刷新（课表页下拉） | `ScheduleView.vue` 刷新成功回调 → `afterScheduleRefresh` | R5.3 |
| 跨天（本地日期翻页） | `App.vue` 注册 `setTimeout` 到下一个 00:00 + 60s，触发 `tryWriteSnapshotFromCache` | R5.4 |
| 退出登录 / 清空数据 | 登出流程 finally → `getWidgetBridge().clearSnapshot()` | R10.3（≤2s） |

建议实现 `src/utils/widget_bridge.ts`（与插件门面 `widget.ts` 同一文件也可）集中封装 `afterScheduleRefresh` / `tryWriteSnapshotFromCache` / `clearWidgetForLogout` 三个上层 API。

### 9.3 失败重试策略（对齐 R5-5）

```ts
async function writeSnapshotWithRetry(snapshot: TodayCourseSnapshot) {
  const delays = [250, 1000, 4000] // 最多 3 次重试，指数退避
  for (let i = 0; i <= delays.length; i++) {
    try {
      await getWidgetBridge().writeSnapshot(snapshot)
      return
    } catch (err: any) {
      logWidgetError(i, err)
      if (err?.code === 'SNAPSHOT_TOO_LARGE' || err?.code === 'INVALID_SNAPSHOT') throw err
      if (i === delays.length) throw err
      await sleep(delays[i])
    }
  }
}
```

- 不可重试错误（`SNAPSHOT_TOO_LARGE` / `INVALID_SNAPSHOT`）立即抛出，交给上层降级。
- 可重试错误（`WRITE_FAILED` / `UNAVAILABLE`）最多重试 3 次。
- 失败后仅 `console.warn` + `debug_logger`，不向用户弹出 Toast（Widget 是非阻塞增强）。

### 9.4 与 `schedule_prefetch` / 缓存层的集成

- `schedule_prefetch.js`：在 `warmupScheduleForStudent` 的成功 `return` 前，调用 `afterScheduleRefresh(sid, payload, { selectedWeek })`；不改动已有缓存 key、不改变缓存 TTL。
- `readScheduleRenderSnapshot` 是本功能**不使用**的函数，保持原状。
- 新增 `buildTodayCourseSnapshot` 只读取传入的 payload，不依赖 `localStorage`。
- Dashboard / Calendar 组件**不参与**本功能；它们的渲染路径独立于 widget_snapshot.ts。

---

## 10. 跳转（Deep Link）设计

### 10.1 Scheme 路由规则

唯一约定：

```
minihbut://schedule?date=YYYY-MM-DD&source=widget[&period=N]
```

- `date`：必填。
- `source`：必填，固定 `widget`，便于埋点区分。
- `period`：可选，点击单节课行时携带该节次（1..14）。
- Universal Link 退路（iOS 可选）：`https://hbut.6661111.xyz/schedule?...`，参数名与 scheme 一致。
- Android App Links 退路：同域 `https://hbut.6661111.xyz/schedule?...`，需要配合 `.well-known/assetlinks.json`；本 spec 不作为 MVP。

### 10.2 Android 配置

`android/app/src/main/AndroidManifest.xml` 主 Activity 追加 intent-filter：

```xml
<intent-filter android:autoVerify="false">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="minihbut" android:host="schedule" />
</intent-filter>
```

`MainActivity.onNewIntent` 解析 `getData()?.getQueryParameter("date")`，通过 Capacitor Bridge 向 Web 层派发：

```kotlin
bridge.triggerJSEvent("widgetDeeplink", "window",
  "{\"date\":\"$date\",\"source\":\"widget\",\"period\":$period}")
```

### 10.3 iOS 配置

`ios/App/App/Info.plist`：见 §8.5 的 `CFBundleURLTypes`。

`AppDelegate.swift` 的 `application(_:open:options:)`：

```swift
func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
  guard url.scheme == "minihbut", url.host == "schedule" else { return false }
  let params = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
  let payload: [String: Any] = Dictionary(uniqueKeysWithValues: params.map { ($0.name, $0.value ?? "") })
  CAPBridge.notifyListenersGlobal("widgetDeeplink", data: payload, retain: true)
  return true
}
```

`MiniHbutTodayWidget.entitlements` 不需要额外处理（widgetURL 跳转由系统自动派发给主 App）。

### 10.4 Web 层路由接入

当前仓库 **未使用 vue-router**（由 `App.vue` 中的状态驱动视图切换）。本 spec 因此不引入 vue-router，而是：

1. 在 `App.vue` 启动时注册 Capacitor `App` 插件的 `appUrlOpen` 事件与自定义事件 `widgetDeeplink`：

   ```ts
   import { App } from '@capacitor/app'
   App.addListener('appUrlOpen', (e) => handleWidgetUrl(e.url))
   Capacitor.Plugins.MiniHbutWidget?.addListener?.('widgetDeeplink', handleWidgetPayload)
   ```

2. `handleWidgetPayload({ date, source, period })`：
   - 切换主视图到 `ScheduleView`；
   - 设置 `selectedWeek = weekFromDate(date)`；
   - 把 `date` 注入给 `ScheduleView` 的 prop，让其滚动到该日；
   - 上报埋点 `{ source: 'widget' }`。

3. 冷启动路径（R8.3）：`App.vue` 启动前检测 `intent.getData` / `appUrlOpen` 已投递的事件 → 等 Web 层初始化完成再执行路由切换，确保不卡在首页闪屏。

---

## 11. Correctness Properties

> *A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

本节列出从 prework 归并后的 11 条属性。每条属性都是对某个纯函数 / 可 mock 层级行为的**全称量化**陈述，适合 property-based testing（Web 层 `fast-check`、Android 侧 `net.jqwik`、iOS 侧 `SwiftCheck`）。每条 PBT 最少 100 轮。

### Property 1：Snapshot 生成是 schema-合法、按本周本日筛选、按时间升序

*For any* 合法 `Schedule_Cache`、`week_index ∈ [1, 60]`、`weekday ∈ [1, 7]`、`now`、`student_id`，`buildTodayCourseSnapshot({cache, now, studentId, weekIndex})` 的输出必定满足：

1. 通过 §4.1 JSON Schema 校验；
2. 输出的 `courses` 中每一项都严格属于本周本日的课程实例（来源课程 `weeks` 包含 `week_index` 且 `weekday` 等于传入值）；
3. 输出的 `courses` 按 `time_start` 单调不降，同 `time_start` 下按 `period_start` 单调不降；
4. 若 cache 缺该日数据，输出 `courses == []` 但仍返回完整 snapshot 对象（非 `null`）。

**Validates: Requirements 4.1, 4.2, 4.4, 4.5**

### Property 2：Snapshot 序列化大小不超限

*For any* 合法 `TodayCourseSnapshot` 输入到 `writeSnapshot(snapshot)`：要么底层写入的 `snapshot_json` UTF-8 字节数 `≤ 32 × 1024`，要么 Promise 以错误码 `SNAPSHOT_TOO_LARGE` reject；绝不存在「静默写入 > 32KB」这一分支。

**Validates: Requirements 4.3**

### Property 3：行选择与溢出角标幂等且正确截断

*For any* `snapshot`、`capacity ∈ {1, 2, 3, 6, ∞}`，令 `out = pickRows(snapshot, capacity)`：

- `out.rows` 等于 `snapshot.courses`（已升序）的前 `capacity` 个；
- `out.overflowBadge` 等于 `max(0, snapshot.courses.length − capacity)`；
- 对同一输入连续调用 `k ≥ 2` 次，输出完全相等（幂等）。

**Validates: Requirements 2.4, 2.5, 3.3**

### Property 4：渲染分支决策表在所有输入下唯一且正确

*For any* `(snapshot, now)`，`resolveRenderKind(snapshot, now)` 结果落入唯一分支，符合下表：

| 条件 | renderKind |
| --- | --- |
| `snapshot == null` 或 `snapshot.student_id == ""` | `login` |
| 反序列化异常 / schema 不合法 | `dataError` |
| `courses == [] ∧ weekday ∈ {6, 7}` | `weekend` |
| `courses == [] ∧ weekday ∈ {1..5}` | `noCourse` |
| 其他 | `normal`，且若 `now − generated_at > 24h` 则附加 `staleHint` |

此外，若当前 tick 无新数据（Shared_Store 未变更），渲染 kind 不依赖 tick 次数，保证 R6.4 的"保留上一次渲染"。

**Validates: Requirements 2.6, 2.7, 3.4, 3.5, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5**

### Property 5：Deep Link 构造携带正确参数且幂等

*For any* 合法 `snapshot` 与可选 `row ∈ snapshot.courses ∪ {undefined}`，`buildDeepLink(snapshot, row)` 返回的字符串必须满足：

1. 以 `minihbut://schedule?` 起始；
2. query 中 `date == snapshot.date`、`source == "widget"`；
3. 当且仅当 `row != undefined` 时包含 `period == row.period_start`；
4. 对同一输入连续调用产生完全相同的字符串（幂等）。

**Validates: Requirements 2.8, 3.6, 8.1, 8.2, 8.4**

### Property 6：刷新 / 登出副作用序列

*For any* 成功的 `Silent_Refresh(cache, studentId)`：`afterScheduleRefresh(cache, studentId)` 引发的观察副作用**恰好**是序列 `[writeSnapshot(buildTodayCourseSnapshot(...)), refreshTick()]`，顺序严格，次数各一次。
*For any* `logout()` 流程：引发的副作用**恰好**是序列 `[clearSnapshot(), refreshTick()]`，次数各一次。

**Validates: Requirements 5.1, 5.3, 5.6, 10.3**

### Property 7：跨天必然触发新快照生成

*For any* 旧 `snapshot`（非 null）与任意 `now`：若 `localDate(now, "Asia/Shanghai") != snapshot.date`，则下一次 `activeTick(now)` 调用必然触发 `writeSnapshot(newSnapshot)`，其中 `newSnapshot.date == localDate(now, "Asia/Shanghai")` 且 `newSnapshot.weekday == isoWeekday(now, "Asia/Shanghai")`。

**Validates: Requirements 5.4**

### Property 8：写入失败重试有界

*For any* 失败序列 `fails ∈ {0, 1, 2, 3, 4}`，`writeSnapshotWithRetry(snapshot)` 的底层调用次数 `calls` 满足 `calls ≤ 4`（首次 + 最多 3 次重试）：

- 当 `fails ≤ 3` 时 Promise 最终 `resolve`，且至少调用了一次日志；
- 当 `fails ≥ 4` 时 Promise 以 `WRITE_FAILED` reject，且至少调用了一次日志；
- 对不可重试错误（`SNAPSHOT_TOO_LARGE` / `INVALID_SNAPSHOT`），`calls == 1` 且立即 reject。

**Validates: Requirements 5.5**

### Property 9：iOS TimelineProvider 生成的 entries 单调且覆盖每门课

*For any* 合法 `(snapshot, now)`，`TodayCoursesProvider.buildEntries(snapshot, now)` 的输出 `entries` 满足：

1. `entries.map(\.date)` 单调不降（允许相等）；
2. `entries.count ≤ 4`；
3. 对每门 `c ∈ snapshot.courses`：
   - 若 `c.time_start − 5m > now`，存在一个 entry 的 `renderKind == .highlightNext(c)`；
   - 若 `c.time_end > now`，存在一个 entry 的 `renderKind == .afterCourse(c)`；
4. 若 `snapshot == nil` 或 `snapshot.date != today`，`entries` 只含一个 `.staleOrLogin` entry。

**Validates: Requirements 6.3**

### Property 10：学号脱敏 + a11y 标签契约

*For any* 字符串 `s`，`maskStudentId(s)` 满足：

- 空串返回空串；
- 若 `s.length ≤ 4`，结果长度等于 `s.length` 且全部字符 == `'*'`；
- 若 `s.length > 4`，结果长度与 `s.length` 相等、首 2 字符 == `s.slice(0, 2)`、末 2 字符 == `s.slice(-2)`、中间均为 `'*'`。

*For any* `WidgetCourse c`，`a11yLabel(c)` 返回的字符串同时包含：`c.period_start` 字符串化、`c.time_start`、`c.time_end`、`c.name`、`c.location` 五个子串。

**Validates: Requirements 10.2, 11.3**

### Property 11：渲染函数对任意字节串永不崩溃（数据异常安全）

*For any* `raw: string`（包括非法 JSON、空串、被截断的 JSON、非常规 Unicode），`renderFromBytes(raw, now)` 必定返回一个合法 `renderKind`（若异常则为 `dataError`），**绝不抛异常、绝不让 Widget 进程崩溃**。

**Validates: Requirements 7.5**

### Property 汇总矩阵

| Property | 来源 Requirements | 预期实现层 |
| --- | --- | --- |
| P1 | 4.1, 4.2, 4.4, 4.5 | Web（`widget_snapshot.ts`） |
| P2 | 4.3 | Web（`widget.ts`） |
| P3 | 2.4, 2.5, 3.3 | Web + Android + iOS（三份镜像） |
| P4 | 2.6, 2.7, 3.4, 3.5, 6.4, 7.x | Web + Android + iOS |
| P5 | 2.8, 3.6, 8.1, 8.2, 8.4 | Web（共享逻辑） |
| P6 | 5.1, 5.3, 5.6, 10.3 | Web（调用序列） |
| P7 | 5.4 | Web（fake timer） |
| P8 | 5.5 | Web |
| P9 | 6.3 | iOS（Swift） |
| P10 | 10.2, 11.3 | Web + Android + iOS |
| P11 | 7.5 | Web + Android + iOS |

---

## 12. Testing Strategy

### 12.1 前端（TS / Vitest）单元测试

目标文件：`src/utils/widget_snapshot.ts`、`src/platform/capacitor/widget.ts`、`packages/capacitor-plugin-mini-hbut-widget/src/web.ts`。

覆盖点：

- `buildTodayCourseSnapshot` 的 schema 合法性（Ajv）、排序、跨周过滤、空日行为（Example + Property）。
- `resolveRenderKind` 决策表（每分支一个 example）。
- `pickRows` 对空数组、单课、超容量三种 example 的边界行为。
- `buildDeepLink` 对 row 缺省/非缺省两分支。
- `maskStudentId` 对空串、1 字符、4 字符、5 字符、长串 5 种 example。
- `writeSnapshotWithRetry` 对三种错误码的分支。

### 12.2 前端属性测试（fast-check）

- 库：`fast-check`（**目前 devDependencies 中尚未包含**，tasks 阶段需新增 `"fast-check": "^3.x"`）。
- 最少 iteration：100（每条 property）；对 P1、P4、P5 推荐 500。
- 测试命名必须携带 tag：
  ```
  // Feature: mobile-widget-today-courses, Property 1: Snapshot 生成是 schema-合法、按本周本日筛选、按时间升序
  ```
- Vitest 配置建议：`vitest run --coverage`，通过 `@vitest/coverage-v8` 收集覆盖率；PBT 不强制覆盖率阈值，但要求每条 property 至少一条断言。

### 12.3 前端反序列化容错

- 覆盖 P11：用 `fast-check.string()` 与预设恶意样本（截断 JSON、非 UTF-8 字节、超长字符串、深层嵌套）喂 `renderFromBytes`，断言永不抛异常。
- 同时对 `clearSnapshot()` 之后立即 `writeSnapshot(valid)` 做 round-trip 验证：写入后读回等价。

### 12.4 Android Instrumented Test

路径：`android/app/src/androidTest/java/com/hbut/mini/widget/`。

- **构建冒烟**：
  - 验证 `AppWidgetProviderInfo.label == "今日课程"`、`previewImage != 0`。
  - 验证 `AndroidManifest.xml` 中 `<receiver>` 全限定名 == `com.hbut.mini.widget.TodayCoursesProvider`（R12.4）。
  - 验证 `appwidget-provider.xml` 的 `updatePeriodMillis >= 1800000`（R6.1）。
- **RemoteViews 渲染**：
  - 构造各种 snapshot 写入 SP，触发 `onUpdate`，用 `ApplicationProvider.getApplicationContext` 打 RemoteViews，断言行数 / 文本内容。
- **Provider 时序**：
  - 发送 `ACTION_APPWIDGET_UPDATE`，验证 `notifyAppWidgetViewDataChanged` 被调用（spy `WidgetRefreshScheduler`）。
- **并发**：
  - 多线程 write + read 循环 200 次，断言最终值一致。
- **性能（可选）**：Macrobenchmark 记录 `onUpdate` 首次帧时间 & 内存增量（R2.2 / R9.1）。

### 12.5 iOS XCTest

路径：`ios/App/MiniHbutTodayWidgetTests/`。

- **TimelineProvider**（P9）：生成随机 snapshot，断言 `buildEntries` 的单调性、数量上限、覆盖性。
- **WidgetDataStore**：写入 JSON → 读取 → 等价；写入非法串 → 读取为 nil；写入超 32KB → reject。
- **ResolveRenderKind Swift 镜像**：与 Web 层 P4 共享决策表。
- **SnapshotTesting**：对 small/medium/large × light/dark × Dynamic Type (`xLarge`) 共 12 组 UI snapshot（R3.7、R11.2、R11.5）。
- **Archive Smoke**：CI 跑 `xcodebuild archive -scheme App`，成功即视为 R12.2 通过。

### 12.6 集成 / 系统测试矩阵

| 平台 | OS 版本 | 设备/模拟器 | 重点场景 |
| --- | --- | --- | --- |
| Android | 10 (API 29) | Pixel 3a emu | 默认 4×2、深色、WorkManager |
| Android | 12 (API 31) | Pixel 4 emu | Material You 动态色（R2.9） |
| Android | 14 (API 34) | Pixel 6 real | 前台限制、后台调度 |
| iOS | 14 | iPhone 11 emu | Dynamic Type xLarge |
| iOS | 16 | iPhone 13 real | WidgetKit 更新节奏 |
| iOS | 17 | iPhone 15 real | `.containerBackground(for: .widget)` |

### 12.7 手工回归清单

（建议随 tasks 阶段导出 `.kiro/specs/mobile-widget-today-courses/manual-checklist.md`）

1. 新装 App，未登录，添加 Widget → 显示 "请先在 Mini-HBUT 登录"。
2. 登录 → 打开 App 首页 → 5 秒内 Widget 更新为今日课表。
3. 打开课表页，手动下拉刷新 → Widget 立即同步。
4. 手动将系统时间改到次日 00:05 → 打开 App → Widget 切换为新一天课程。
5. 退出登录 → 2 秒内 Widget 切回 "请先在 Mini-HBUT 登录"。
6. 切换系统深色模式 → Widget 颜色反色。
7. 系统字号调到最大 → 行高不截断。
8. 点击 Widget 空白区 → App 定位课表页到今天。
9. 点击某行课程（large 尺寸） → App 定位课表页并高亮该节。
10. 关掉 App 进程再点击 Widget → 冷启动完成后仍正确落地。
11. 开飞行模式 → Widget 仍能正确渲染缓存（R9.4 无网络）。
12. 设备低电量模式 → Widget 可接受降频、不崩溃。

### 12.8 性能基线

| 指标 | 目标 | 测量 |
| --- | --- | --- |
| `writeSnapshot` I/O P95 | ≤ 50 ms | Vitest bench / XCTest measure |
| Android `onUpdate` 首帧 | ≤ 3 s（冷） | Macrobenchmark |
| iOS `buildEntries` | ≤ 100 ms | XCTest measure |
| 单次 snapshot 字节 | ≤ 32 KB | PBT P2 |
| 每日 WorkManager 任务 | ≤ 100 次 | 代码常量（15min × 96） |

---

## 13. Risks & Mitigations

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **App Group / Provisioning Profile 未配置**：iOS 构建失败或 Widget 读不到数据 | Widget 始终显示登录提示 | 构建脚本显式检查 entitlements；未配置时 `xcodebuild` 直接 fail-fast（R12.5）；文档中给出一次性配置手册 |
| **Capacitor `cap sync` 对第三方 receiver 的覆盖** | 增量 `AndroidManifest.xml` 被 `cap sync` 重写 | 将 receiver 放在 `android/app/src/main/AndroidManifest.xml`（属于主 App，不会被 cap sync 覆盖）；插件仅携带 service，避免与 cap sync 冲突 |
| **iOS UserDefaults 32 KB 软限制** | 大课表快照写入被截断 | 在 TS 门面做字节数校验 + 裁剪策略（§4.3），优先保留早课；Ajv schema 严格限制 courses ≤ 14 |
| **Material You 动态色在 API 31/32 行为差异** | 动态色提取失败导致配色错乱 | 同时提供内置浅/深色兜底（R2.10）；Provider 代码 `Build.VERSION.SDK_INT >= 31` 分支保护 |
| **Glance 依赖膨胀** | APK 体积增长 | 本 spec 不引入 Glance；若未来接入，只对 API 31+ 启用，保留 RemoteViews 作为 < 31 的路径 |
| **WorkManager 被厂商杀进程** | 刷新不及时 | updatePeriodMillis 30m 作为保底；用户教育：在设置页提示"允许 Mini-HBUT 自启动" |
| **`s00d/tauri-plugin-widgets` 用户期望落差** | 用户以为能复用该插件 | 在 requirements 的 Open Decisions、design 的 §2.1 显式说明路线 B 已决定；CHANGELOG / FAQ 同步沟通 |
| **跨天临界点的刷新延迟** | 00:00–00:05 内 Widget 显示昨日课程 | App 内 `setTimeout` 对齐到 00:00 + 60s 触发 `activeTick`；用户打开 App 时也会触发（R5.2） |
| **多账号（未来扩展）** | 账号切换后 Widget 不跟随 | 本 spec 假设单账号；若未来支持多账号，扩展 `snapshot_version → 2`，增加 `account_id` 字段，保留 v1 读路径过渡 |
| **插件包结构复杂** | 初期开发难度 | 允许先内联在 `android/app` + `ios/App`，跑通后再抽到 `packages/` 独立包；不阻塞首个 MVP |

---

## 14. Open Questions

tasks / 实施阶段需要持续决策的小问题：

1. **Widget 预览图设计稿**：需要设计团队出 3 张预览 PNG（4×2、2×2、4×1），含占位假数据。可否复用课表页截图？
2. **Dashboard 模块是否复用同一套脱敏 util**：当前 `src/utils/` 未提供通用 `maskStudentId`，是放到 `widget_snapshot.ts` 内部还是提升为公共 util？建议前者先实现、后者等第二个使用方出现再抽取。
3. **Universal Link 是否上线**：Universal Link 需要运维配合部署 `apple-app-site-association`，是否纳入 MVP？建议 MVP 只上 custom scheme，Universal Link 作为 P1。
4. **是否支持 widget 配置页**：`widgetFeatures="reconfigurable"` 声明了能力，但是否实现重新配置 UI？建议 MVP 不实现，保留字段。
5. **插件是否对 `@capacitor/preferences` 做适配层**：`@capacitor/preferences` 可能在未来用 App Group 模式，插件是否放弃自管 `UserDefaults`？当前方案倾向自管，避免 `@capacitor/preferences` 升级破坏 Widget。
6. **iOS Widget 是否提供加载态 placeholder 配图**：需要设计一个无数据态的透明占位视图。
7. **Android ListView 是否会被 Google 未来废弃以支持 LazyColumn**：Glance 已使用 `LazyColumn`；本 spec RemoteViews + ListView 的方案在 API 34 仍受支持，但需要持续关注 Google 动态。
8. **是否在 widget 中显示"下一节倒计时"**：功能上需求 R 未强制；若加入，会增加 iOS TimelineEntry 数量压力。建议纳入后续 spec。
9. **CI 是否跑真机 / 真机池**：本仓库 `.github/workflows/release.yml` 未见真机 lab；iOS XCUITest 的 snapshot 建议先跑 simulator。
10. **脱敏策略对短学号（≤ 4 位）的展示是否可接受**：当前策略是全 `*`；实际学号长度 10–12 位，边界场景极少触发，留作兼容。

---

以上即「移动端今日课程小组件」（路线 B）的完整设计。若 Open Decisions 评审阶段用户选定 A 或 C，本文档需整体重写。
