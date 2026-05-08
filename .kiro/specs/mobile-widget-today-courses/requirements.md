# Requirements Document

## Introduction

本规范描述 **Mini-HBUT 移动端桌面小组件：今日课程** 功能。目标是在 Android 与 iOS 系统桌面（Home Screen）上，通过原生小组件实时展示**当天**的课程列表，使学生无需打开 App 即可查看今日的节次、时间、课程名、教室等关键信息。

本项目移动端基于 **Capacitor 6.x**（见 `capacitor.config.ts`，appId `com.hbut.mini`），桌面端基于 **Tauri 2.x**（`src-tauri/`）。用户最初建议的 `s00d/tauri-plugin-widgets` 是面向 **Tauri Mobile** 的插件，与本项目当前 Capacitor 技术栈**不直接兼容**。在需求层面需要先就"技术路线"做出选择，再落到功能细节。为了保证需求文档的可测试性，本文档采用 **Capacitor 原生桥接 + 原生小组件（Android AppWidgetProvider / Glance、iOS WidgetKit）** 作为默认假设路线，同时显式列出"待用户确认"的范围与路线决策。

关键范围说明：

- **仅覆盖移动端桌面小组件**（Android Home Screen、iOS Home Screen）。桌面端（Windows/macOS/Linux、Tauri）在本 Spec 范围之外。
- **以"今日课程列表"为单一核心场景**，不包含全周/全学期课表展示、不包含 Live Activity、不包含锁屏互动型组件（见 Out of Scope）。
- **数据来源为主 App 已有的课表缓存**，小组件不独立登录、不直连教务后端。

## Glossary

- **Mini_HBUT_App**：Mini-HBUT 主应用（Capacitor Webview 宿主），承担登录、数据拉取、缓存写入职责。
- **Today_Widget**：本次新增的"今日课程"桌面小组件，在 Android 与 iOS 系统桌面呈现。
- **Android_Widget_Provider**：Android 端小组件的原生实现，基于 `AppWidgetProvider`（以及可选的 Jetpack Glance），承担渲染与点击事件分发。
- **iOS_Widget_Extension**：iOS 端小组件的原生实现，基于 `WidgetKit` + `SwiftUI`，承担 `TimelineProvider` 与视图渲染。
- **Widget_Bridge_Plugin**：新增的 Capacitor 插件（名称暂定 `mini-hbut-widget`），提供 Web 层 ↔ 原生小组件的共享数据与刷新信号能力。
- **Shared_Store**：小组件与主 App 共享的本地存储：Android 使用 `SharedPreferences`（或 `DataStore`），iOS 使用 **App Group** + `UserDefaults`（或共享容器中的 JSON 文件）。
- **Today_Course_Snapshot**：写入 `Shared_Store` 的当日课程快照 JSON，字段见《Requirement 3》。
- **Schedule_Cache**：主 App 中已有的课表缓存（由 `ScheduleView`、`utils/schedule_prefetch` 管理），是 `Today_Course_Snapshot` 的唯一上游数据源。
- **Silent_Refresh**：主 App 在前台或后台触发的静默课表刷新流程（已集成 `@transistorsoft/capacitor-background-fetch` 与自定义 Android 周期任务）。
- **Widget_Refresh_Tick**：操作系统触发小组件刷新的时机（Android `AppWidgetManager#updateAppWidget`、iOS `WidgetCenter.shared.reloadTimelines`）。
- **Current_Account**：主 App 当前已登录的账号（学号）。

## 待用户确认（Open Decisions）

以下决策点影响后续"功能需求"的取舍。在 Requirements 阶段必须与用户对齐后，再进入 Design 阶段：

1. **技术路线选择**（最关键）：
   - (A) **迁移移动端至 Tauri Mobile**，使用 `s00d/tauri-plugin-widgets`。代价：需要重建 Android / iOS 工程、调整签名与发布流程，影响现有移动端全部功能。
   - (B) **保留 Capacitor，新增原生小组件 + 自研 Capacitor 插件**（默认假设路线）：Android 用 `AppWidgetProvider`（可选 Glance），iOS 用 WidgetKit，通过 App Group / SharedPreferences 与主 App 共享数据。代价：需要写一次原生插件，但不破坏现有工程。
   - (C) **仅在桌面端（Tauri）实现"今日课程"样式小组件**，不做手机桌面小组件。本 Spec 的名称与范围需要随之修改。
2. **支持的 Widget 尺寸**：
   - Android：2×2（仅标题+下一节）/ 4×1（单行滚动）/ 4×2（默认：2–3 节）。
   - iOS：`systemSmall` / `systemMedium`（默认）/ `systemLarge`。是否包含 `accessoryRectangular`（锁屏）？
3. **刷新策略上限**：
   - Android：WorkManager 最短周期为 15 分钟；是否接受"最多每 15 分钟刷新一次"？
   - iOS：`TimelineProvider` 由系统调度，不保证 N 分钟内刷新；是否接受"节次切换前 5 分钟预排时间线"作为目标？
4. **无课 / 未登录 / 缓存失效 的占位文案**：采用"今日无课，好好休息"等默认文案，还是由用户自定义？
5. **点击 Widget 的落地页**：默认跳转到主 App 的课表页面（`/schedule`）定位到当天，是否需要额外跳转到"今日详情页"？
6. **最低系统版本**：
   - Android minSdk（当前工程 Capacitor 默认 22+），Glance 对 Android 12+ 体验更佳；是否接受 Glance 路线？
   - iOS minimum deployment target（WidgetKit 需 iOS 14+；若需要锁屏小组件则需 iOS 16+）。
7. **账号策略**：当前工程是否存在多账号并存？若是，widget 显示哪个账号的课表（主账号 / 最近登录）？

本文档中所有"SHALL"条款基于**路线 (B) 且全部默认项**假设成立。若用户在评审阶段选择 (A) 或 (C)，需要整体改写。

## Requirements

### Requirement 1：技术路线与平台范围

**User Story:** 作为项目维护者，我希望本功能的技术路线与平台范围被明确界定，以便评估工程代价与排期。

#### Acceptance Criteria

1. THE Today_Widget SHALL 仅覆盖 Android 与 iOS 两个平台的系统桌面小组件。
2. THE Today_Widget SHALL 基于 Capacitor 架构实现，不引入 `s00d/tauri-plugin-widgets`，不改变现有 Tauri/Capacitor 工程拓扑（路线 B）。
3. THE Today_Widget SHALL 通过新增的 Widget_Bridge_Plugin 与主 App 通信，不直接访问教务后端或绕过主 App 登录态。
4. WHERE 用户后续选择路线 A 或 C，THE 本规范 SHALL 被整体重写而非在本文内扩展。

### Requirement 2：在 Android 桌面显示今日课程

**User Story:** 作为 Android 用户，我希望把"今日课程"小组件放到手机桌面，以便不打开 App 就能看到今天所有课程的时间、课程名、教室。

#### Acceptance Criteria

1. THE Android_Widget_Provider SHALL 在系统小组件选择器中以应用名 "Mini-HBUT" 与"今日课程"标题注册，并提供可识别的图标与预览图。
2. WHEN 用户将 Today_Widget 添加到 Android 桌面，THE Android_Widget_Provider SHALL 在 3 秒内完成首次渲染。
3. THE Today_Widget SHALL 在 Android 桌面至少支持 **4×2** 尺寸布局（默认尺寸）。
4. WHEN Today_Course_Snapshot 包含至少一门当日课程，THE Today_Widget SHALL 在 4×2 尺寸下按时间升序显示当日前 3 门课程的 `节次 / 开始-结束时间 / 课程名 / 教室`。
5. WHEN 当日课程总数超过当前尺寸可容纳条数，THE Today_Widget SHALL 在右下角显示"+N 节"的省略标识（N 为未显示的课程数）。
6. WHEN Today_Course_Snapshot 中当日课程数为 0，THE Today_Widget SHALL 显示占位文案 "今日无课"。
7. IF 未登录或 Shared_Store 中无 Today_Course_Snapshot，THEN THE Today_Widget SHALL 显示占位文案 "请先在 Mini-HBUT 登录" 以及"打开 Mini-HBUT"按钮区域。
8. WHEN 用户点击 Today_Widget 的任意可点击区域，THE Android_Widget_Provider SHALL 以 `PendingIntent` 唤起 Mini_HBUT_App 并进入课表页（路由 `/schedule`）。
9. WHERE Android 版本 ≥ 12（API 31），THE Today_Widget SHALL 使用系统动态主题色（Material You）作为背景与前景配色来源。
10. WHERE Android 版本 < 12，THE Today_Widget SHALL 使用 App 内置的浅色/深色主题两套静态配色，并跟随系统深色模式切换。

### Requirement 3：在 iOS 桌面显示今日课程

**User Story:** 作为 iOS 用户，我希望把"今日课程"小组件放到 iOS 主屏幕，以便不打开 App 就能查看今天的课程。

#### Acceptance Criteria

1. THE iOS_Widget_Extension SHALL 作为独立的 App Extension Target 打包进 Mini-HBUT 的 iOS 工程，并在 iOS 小组件库中以 "Mini-HBUT · 今日课程" 名称注册。
2. THE iOS_Widget_Extension SHALL 至少支持 `systemMedium` 尺寸（默认），并同时支持 `systemSmall` 与 `systemLarge` 尺寸。
3. WHEN Today_Course_Snapshot 包含当日课程，THE iOS_Widget_Extension SHALL 在 `systemMedium` 下显示当日前 3 门课程的 `节次 / 开始-结束时间 / 课程名 / 教室`。
4. WHEN Today_Course_Snapshot 中当日课程数为 0，THE iOS_Widget_Extension SHALL 显示占位文案 "今日无课"。
5. IF App Group `UserDefaults` 中无 Today_Course_Snapshot 或用户未登录，THEN THE iOS_Widget_Extension SHALL 显示占位文案 "请先在 Mini-HBUT 登录"。
6. WHEN 用户点击 Today_Widget，THE iOS_Widget_Extension SHALL 通过 Universal Link 或自定义 URL scheme 唤起 Mini_HBUT_App 并进入课表页。
7. THE iOS_Widget_Extension SHALL 跟随系统深色模式切换配色。
8. THE iOS_Widget_Extension SHALL 的最低部署版本为 iOS 14。

### Requirement 4：当日课程快照数据模型

**User Story:** 作为开发者，我希望有一份清晰、可序列化的"当日课程快照"数据结构，以便主 App 与小组件在同一语言下对齐字段。

#### Acceptance Criteria

1. THE Mini_HBUT_App SHALL 定义 Today_Course_Snapshot 为 JSON 对象，包含以下字段：
   - `version`（number，快照结构版本号）
   - `generated_at`（ISO 8601 字符串，主 App 生成该快照的本地时间）
   - `date`（`YYYY-MM-DD`，快照对应的日期）
   - `student_id`（string，`Current_Account` 学号，脱敏展示时使用）
   - `week_index`（number，学期周次，1 开始）
   - `weekday`（number，1=周一 ... 7=周日）
   - `courses`（数组，每项包含 `period_start` number、`period_end` number、`time_start` `HH:mm`、`time_end` `HH:mm`、`name` string、`location` string、`teacher` string，可选 `color` string）
2. THE Today_Course_Snapshot SHALL 对 `courses` 按 `time_start` 升序排序。
3. THE Today_Course_Snapshot 的序列化结果 SHALL 小于 32 KB，以避免 Android `RemoteViews` 与 iOS `UserDefaults` 的容量风险。
4. WHEN Schedule_Cache 中存在跨周的重复课程，THE Mini_HBUT_App SHALL 在生成快照时仅保留本周本日的有效实例。
5. IF Schedule_Cache 缺少当日数据（如尚未拉取），THEN THE Mini_HBUT_App SHALL 生成 `courses` 为空数组的快照，而非省略快照本身。

### Requirement 5：主 App 向 Widget 写入快照

**User Story:** 作为用户，我希望在主 App 课表被刷新后，桌面小组件能自动反映最新数据，无需我手动操作。

#### Acceptance Criteria

1. WHEN Mini_HBUT_App 完成一次成功的 Silent_Refresh 并得到新的 Schedule_Cache，THE Widget_Bridge_Plugin SHALL 在 2 秒内将最新 Today_Course_Snapshot 写入 Shared_Store。
2. WHEN Mini_HBUT_App 前台启动并恢复出已有课表缓存，THE Widget_Bridge_Plugin SHALL 在启动后 5 秒内写入一次 Today_Course_Snapshot。
3. WHEN 用户手动在课表页触发"刷新"成功，THE Widget_Bridge_Plugin SHALL 同步写入最新 Today_Course_Snapshot。
4. WHEN 本地日期跨到下一天（零点），THE Mini_HBUT_App SHALL 在下次活跃（前台或后台任务）时重新生成并写入次日的 Today_Course_Snapshot。
5. IF Widget_Bridge_Plugin 写入 Shared_Store 失败，THEN THE Mini_HBUT_App SHALL 记录一次本地错误日志，并在下一次刷新时重试。
6. THE Widget_Bridge_Plugin SHALL 在每次写入成功后调用 `Widget_Refresh_Tick`（Android：`AppWidgetManager#updateAppWidget`；iOS：`WidgetCenter.shared.reloadTimelines`）。

### Requirement 6：Widget 自身的周期性刷新

**User Story:** 作为用户，即使我没有打开主 App，我也希望小组件能在合理的时间粒度自动切换到"当前/下一节"的展示。

#### Acceptance Criteria

1. THE Android_Widget_Provider SHALL 通过 `appwidget-provider.xml` 配置 `updatePeriodMillis` 不小于系统允许的最小值（30 分钟）。
2. WHERE 需要更高精度，THE Android_Widget_Provider SHALL 额外使用 WorkManager 以 15 分钟为最小周期触发刷新。
3. THE iOS_Widget_Extension SHALL 在 `TimelineProvider` 中为"下一节开课前 5 分钟"与"当前节结束时"各生成一个 `TimelineEntry`。
4. WHEN 小组件执行刷新但 Shared_Store 中无新数据，THE Today_Widget SHALL 保留上一次渲染结果，不清空也不显示加载失败。
5. IF 小组件所在设备处于低电量模式，THEN THE Today_Widget SHALL 接受系统对刷新频率的降级，不主动保活。

### Requirement 7：无课 / 未登录 / 缓存失效占位行为

**User Story:** 作为用户，当今天没课、或我还没登录、或缓存坏了时，我希望小组件给出明确且友好的提示，而不是空白或崩溃。

#### Acceptance Criteria

1. WHEN `courses` 为空且日期为工作日，THE Today_Widget SHALL 显示文案 "今日无课"。
2. WHEN `courses` 为空且日期为周六或周日（`weekday` ∈ {6,7}），THE Today_Widget SHALL 显示文案 "周末愉快"。
3. IF Shared_Store 中无 Today_Course_Snapshot 或 `student_id` 为空，THEN THE Today_Widget SHALL 显示文案 "请先在 Mini-HBUT 登录"。
4. IF Today_Course_Snapshot 的 `generated_at` 与设备当前时间相差超过 24 小时，THEN THE Today_Widget SHALL 在课程列表下方追加次要文案 "数据可能已过期，打开 App 刷新"。
5. IF 快照 JSON 反序列化失败，THEN THE Today_Widget SHALL 显示文案 "小组件数据异常，请打开 App" 且不抛出进程崩溃。

### Requirement 8：跳转行为

**User Story:** 作为用户，我希望点击小组件能把我带到有用的页面，而不是仅仅打开 App 首页。

#### Acceptance Criteria

1. WHEN 用户点击 Today_Widget 的空白区域或 "打开 Mini-HBUT" 按钮，THE Today_Widget SHALL 唤起 Mini_HBUT_App 并把前端路由定位到 `/schedule`，并且 `selectedWeek` 为 `week_index`，视图定位到今天。
2. WHEN 用户点击 Today_Widget 中某一条具体课程行（若尺寸支持行级点击），THE Today_Widget SHALL 唤起 Mini_HBUT_App 并将前端路由定位到该节课的详情浮层（若无独立详情页则定位到当日课表并高亮该节）。
3. IF Mini_HBUT_App 未启动，THEN 点击行为 SHALL 启动 App 冷启动流程并在 Web 层加载完成后再执行路由跳转，不直接闪屏后停在首页。
4. THE 跳转参数 SHALL 通过 `Intent` extras（Android）或 URL scheme 查询参数（iOS）传递 `date=YYYY-MM-DD`、`source=widget`。

### Requirement 9：非功能性要求——性能

**User Story:** 作为用户，我不希望小组件拖慢手机或大量耗电。

#### Acceptance Criteria

1. THE Today_Widget 单次刷新时，Android 进程常驻内存增量 SHALL 不超过 5 MB。
2. THE Today_Widget 单次刷新时，iOS Widget Extension 的执行时间 SHALL 不超过 1 秒（iOS 系统上限外的额外约束）。
3. THE Widget_Bridge_Plugin 写入 Shared_Store 的 I/O 耗时在主 App 线程 SHALL 不超过 50ms（P95）。
4. THE Today_Widget SHALL 不在刷新路径上发起任何网络请求。
5. THE Today_Widget 每日额外触发的 WorkManager 任务数 SHALL 不超过 100 次。

### Requirement 10：非功能性要求——隐私与安全

**User Story:** 作为用户，我希望小组件不会把我的学号、课程信息泄露到 App 之外。

#### Acceptance Criteria

1. THE Widget_Bridge_Plugin SHALL 仅将 Today_Course_Snapshot 写入与 Mini_HBUT_App 同一签名、同一 App Group 的 Shared_Store，不提供任何 `content://` provider 或公开 `UserDefaults` suite。
2. THE Today_Widget SHALL 在渲染时对 `student_id` 做脱敏（保留前 2 位与后 2 位），不在桌面显示完整学号。
3. IF 用户在主 App 内执行"退出登录"或"清空数据"，THEN THE Widget_Bridge_Plugin SHALL 在 2 秒内清空 Shared_Store 中的 Today_Course_Snapshot 并触发一次 `Widget_Refresh_Tick`。
4. THE Today_Widget SHALL 不接入任何第三方分析、广告 SDK。
5. THE Today_Widget SHALL 不记录任何用户行为日志到外部存储。

### Requirement 11：非功能性要求——无障碍与本地化

**User Story:** 作为使用大字号或无障碍功能的用户，我希望小组件同样可读、可操作。

#### Acceptance Criteria

1. THE Today_Widget SHALL 在 Android 上尊重系统字号缩放到 `Large`（1.3×）时仍保持课程行不截断。
2. THE Today_Widget SHALL 在 iOS 上尊重 Dynamic Type（至少到 `xLarge`）。
3. THE Today_Widget SHALL 为每一条课程行提供 Android `contentDescription` / iOS `accessibilityLabel`，读屏器可朗读 `节次 时间 课程名 教室`。
4. THE Today_Widget 的文案 SHALL 全部为简体中文，不进行英文兜底。
5. WHERE 系统处于深色模式，THE Today_Widget SHALL 切换为深色主题配色。

### Requirement 12：发布与构建集成

**User Story:** 作为发布者，我希望加入小组件后不会破坏现有 Capacitor 构建、签名与发布流程。

#### Acceptance Criteria

1. WHEN 执行 `npm run build:web && npx cap sync`，THE Android 工程 SHALL 自动同步包含 `Android_Widget_Provider` 的 receiver、xml、drawable 资源，构建不报错。
2. WHEN 执行 `npx cap open ios`，THE iOS 工程 SHALL 包含独立的 `iOS_Widget_Extension` Target，且可在 Xcode 中直接 Archive。
3. THE iOS_Widget_Extension SHALL 与主 App 共享同一 App Group（命名建议 `group.com.hbut.mini`），需要开发者账号配置。
4. THE Android_Widget_Provider SHALL 以 `com.hbut.mini.widget.TodayCoursesProvider` 为完整类名注册到 `AndroidManifest.xml`。
5. IF 发布构建在无 App Group / Provisioning Profile 的环境中进行，THEN 构建 SHALL 以明确错误信息失败，而不是静默跳过 Widget。

### Requirement 13：范围外（Out of Scope）

本次规范不包含以下项目，将作为后续独立 Spec 处理：

1. THE 本 Spec SHALL NOT 覆盖桌面端（Tauri / Windows / macOS / Linux）小组件或浮窗。
2. THE 本 Spec SHALL NOT 覆盖 iOS 锁屏 `accessoryRectangular`、Live Activity 与 Dynamic Island。
3. THE 本 Spec SHALL NOT 覆盖 Android 锁屏小组件。
4. THE 本 Spec SHALL NOT 覆盖全周 / 学期课表的小组件视图。
5. THE 本 Spec SHALL NOT 覆盖成绩、考试、电费等其他模块的小组件（可作为后续独立 Spec）。
6. THE 本 Spec SHALL NOT 覆盖小组件内的交互编辑（如勾选已上完的课），小组件为只读展示。
7. THE 本 Spec SHALL NOT 迁移现有移动端至 Tauri Mobile。
