# @mini-hbut/capacitor-plugin-mini-hbut-widget

Capacitor 插件：Mini-HBUT 今日课程桌面小组件桥接层。

提供 Web 层与原生小组件（Android AppWidgetProvider / iOS WidgetKit）之间的数据写入与刷新信号能力。

## 状态

🚧 Monorepo 内联插件 — 不发布到 npm，仅作为 workspace 依赖使用。

---

## 安装

### 1. Workspace 依赖

本插件已通过根 `package.json` 的 `workspaces: ["packages/*"]` 自动纳管，无需额外 `npm install`。

```jsonc
// 根 package.json
{
  "workspaces": ["packages/*"],
  "devDependencies": {
    // ...
  }
}
```

### 2. Capacitor 同步

```bash
npm run build:web
npx cap sync
```

`cap sync` 会自动发现 `packages/capacitor-plugin-mini-hbut-widget/android/` 与 `ios/Plugin/` 并注册到原生工程。

---

## 平台配置

### Android

#### AndroidManifest.xml

确保 `android/app/src/main/AndroidManifest.xml` 中注册了 Widget receiver：

```xml
<receiver
    android:name="com.hbut.mini.widget.TodayCoursesProvider"
    android:exported="false">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <intent-filter>
        <action android:name="com.hbut.mini.widget.ACTION_REFRESH" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/appwidget_today_courses" />
</receiver>
```

> ⚠️ **Fail-fast**：若 receiver 全限定名 `com.hbut.mini.widget.TodayCoursesProvider` 未在 AndroidManifest 中注册，`release.py` 构建前检查将直接失败并阻止发布。

#### RemoteViewsService

```xml
<service
    android:name="com.hbut.mini.widget.TodayCoursesRemoteViewsService"
    android:permission="android.permission.BIND_REMOTEVIEWS"
    android:exported="false" />
```

### iOS

#### App Group 配置（必须）

> ⚠️ **Fail-fast**：未配置 App Group 将导致 Widget Extension 无法读取主 App 写入的快照数据，Widget 始终显示"请先登录"。构建脚本会在发布前检查 entitlements 文件，**未配置即直接报错退出**。

**步骤：**

1. 在 Xcode 中打开 `ios/App/App.xcodeproj`
2. 选择主 App Target → Signing & Capabilities → + Capability → App Groups
3. 添加 Group：`group.com.hbut.mini`
4. 选择 Widget Extension Target (`MiniHbutTodayWidget`) → 同样添加 `group.com.hbut.mini`
5. 确认两个 `.entitlements` 文件都包含：

```xml
<key>com.apple.security.application-groups</key>
<array>
    <string>group.com.hbut.mini</string>
</array>
```

**涉及文件：**
- `ios/App/App/App.entitlements`
- `ios/App/MiniHbutTodayWidget/MiniHbutTodayWidget.entitlements`

#### Provisioning Profile

确保 Apple Developer Portal 中对应的 App ID 和 Widget Extension App ID 都启用了 App Groups capability，并重新生成 Provisioning Profile。

---

## API

### `writeSnapshot(options: { snapshot: TodayCourseSnapshot }): Promise<void>`

将今日课程快照写入原生共享存储，并触发 Widget 刷新。

- Android：写入 `SharedPreferences("mini_hbut_widget")` + `AppWidgetManager.notifyAppWidgetViewDataChanged`
- iOS：写入 `UserDefaults(suiteName: "group.com.hbut.mini")` + `WidgetCenter.shared.reloadTimelines`

**约束：**
- 序列化后 UTF-8 字节数必须 ≤ 32 KB
- 必须通过 JSON Schema 校验

### `clearSnapshot(): Promise<void>`

清空共享存储中的快照数据，Widget 将渲染"请先登录"状态。

### `requestRefresh(): Promise<void>`

请求原生 Widget 立即刷新渲染（不写入新数据）。

### `getCapabilities(): Promise<WidgetCapabilities>`

查询当前平台的 Widget 能力。

```ts
interface WidgetCapabilities {
  platform: 'android-appwidget' | 'ios-widgetkit' | 'unavailable'
  pinned: boolean  // 是否存在至少一个已添加的 Widget 实例
}
```

---

## 错误码表

| 错误码 | 含义 | 可重试 | 处理建议 |
|--------|------|--------|----------|
| `SNAPSHOT_TOO_LARGE` | 快照序列化后超过 32 KB | ❌ | 裁剪 courses 数组后重试 |
| `INVALID_SNAPSHOT` | 快照未通过 JSON Schema 校验 | ❌ | 检查数据源，修复后重试 |
| `WRITE_FAILED` | 底层 I/O 写入失败（SP commit / UD set） | ✅ | 自动重试（指数退避 250/1000/4000ms） |
| `UNAVAILABLE` | 非移动端运行时（Web / Tauri） | ✅ | 降级为 no-op，不影响主流程 |

---

## 数据模型

### TodayCourseSnapshot

```ts
interface TodayCourseSnapshot {
  version: 1
  generated_at: string   // ISO 8601
  date: string           // "YYYY-MM-DD"
  student_id: string     // 原值，脱敏由渲染层负责
  week_index: number     // 1..60
  weekday: number        // 1..7（1=周一）
  courses: WidgetCourse[]
}
```

### WidgetCourse

```ts
interface WidgetCourse {
  period_start: number   // 1..14
  period_end: number     // 1..14，>= period_start
  time_start: string     // "HH:mm"
  time_end: string       // "HH:mm"
  name: string           // 1..80 字符
  location: string       // 0..80 字符
  teacher: string        // 0..80 字符
  color?: string         // "#RRGGBB"
}
```

---

## 平台差异

| 特性 | Android | iOS |
|------|---------|-----|
| 存储介质 | `SharedPreferences` (MODE_PRIVATE) | App Group `UserDefaults` |
| 刷新机制 | `AppWidgetManager` + WorkManager (15min) | `WidgetCenter.reloadTimelines` |
| 最小刷新间隔 | 30min (`updatePeriodMillis`) + 15min (WorkManager) | 系统决定（通常 15-60min） |
| Widget 尺寸 | 4×2（默认）、2×2、4×1 | systemMedium（默认）、systemSmall、systemLarge |
| 深色模式 | Material You (API 31+) / 内置色板 (< 31) | Assets.xcassets 颜色资源 |
| 点击跳转 | PendingIntent → `minihbut://schedule` | `widgetURL` → `minihbut://schedule` |
| 检测已添加 | `AppWidgetManager.getAppWidgetIds().isNotEmpty()` | `WidgetCenter.getCurrentConfigurations` |

---

## 重试策略

`writeSnapshotWithRetry` 实现指数退避：

```
首次尝试 → 失败 → 等待 250ms → 重试 1
         → 失败 → 等待 1000ms → 重试 2
         → 失败 → 等待 4000ms → 重试 3
         → 失败 → 抛出 WRITE_FAILED
```

不可重试错误（`SNAPSHOT_TOO_LARGE` / `INVALID_SNAPSHOT`）首次即抛出，不进入退避循环。

---

## 开发调试

### Web 环境

在非 Capacitor 环境（`npm run dev`）下，插件自动降级为 no-op proxy：
- 所有写入方法静默 resolve
- `getCapabilities` 返回 `{ platform: 'unavailable', pinned: false }`
- 首次调用时 `console.debug` 一次提示

### 日志

失败时通过 `console.warn` + `debug_logger.record('widget_write_failed', { code })` 记录，不向用户弹出 Toast。

---

## FAQ

**Q: 为什么不使用 `s00d/tauri-plugin-widgets`？**

A: 本项目移动端使用 Capacitor 而非 Tauri Mobile。`tauri-plugin-widgets` 仅适用于 Tauri Mobile 运行时，与当前架构不兼容。详见 design §2.1 路线 B 决策。

**Q: Widget 不显示数据怎么办？**

A: 检查以下项目：
1. iOS：确认 App Group `group.com.hbut.mini` 已在主 App 和 Widget Extension 两个 Target 中配置
2. Android：确认 `TodayCoursesProvider` 已在 AndroidManifest.xml 中注册
3. 确认已登录并至少打开过一次课表页（触发快照写入）
4. 查看 debug 日志中是否有 `widget_write_failed` 记录

**Q: 快照超过 32 KB 怎么办？**

A: 正常课表不会超限（14 门课约 3-5 KB）。若确实超限，`buildTodayCourseSnapshot` 会按 `time_start` 倒序裁剪尾部课程，优先保留早课，并通过 `+N 节` 角标提示用户。
