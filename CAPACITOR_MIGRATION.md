# Mini-HBUT 重构迁移方案（Tauri 桌面 + 移动）

> **现状（#608/#616）**：正式移动端已迁移到 Tauri v2（Android/iOS），Capacitor 壳
> 保留为历史工程，不再承担移动后台能力。本文档 6 节记录旧 Capacitor 后台架构的退役清单。

## 1. 目标

- **桌面端**：继续使用 Tauri，保持当前能力与发布链路稳定。  
- **移动端**：以 Tauri v2 为正式构建（Android `src-tauri/gen/android`、iOS `src-tauri/gen/apple`）；Capacitor 壳仅历史保留。  
- **业务层**：统一前端代码，避免双端重复开发。

## 2. 当前已落地（已完成 A~D）

1. 已新增 `capacitor.config.ts`，并对齐 `appId=com.hbut.mini`。  
2. 已补充 npm 脚本：`cap:sync`、`cap:run:android`、`cap:open:*`。  
3. 已新增 `src/platform` 桥接层（runtime + adapters + types + native helpers）。  
4. 已将外链、通知、版本获取、应用退出、文件路径转换、文件读取统一收口到桥接层。  
5. 页面与工具层已迁移核心调用点，不再散落硬编码 Tauri API。  
6. 已完成桌面与移动构建链路验证（`npm run build`、`npm run cap:sync`、`npm run tauri build -- --bundles nsis`）。

## 3. 分阶段迁移路线

### 阶段 A（已完成）

- 建立桥接抽象并替换高频调用点。  
- 结果：桌面行为保持不变，移动端具备统一入口骨架。

### 阶段 B（已完成）

- 通知模块改造到平台桥接（权限/本地通知/通道策略）。  
- 外链/分享下载链路改造到平台桥接（Tauri/Capacitor/Web 三实现）。

### 阶段 C（已完成）

- 后台能力（保活、息屏策略）按平台适配并保留兜底。  
- 运行时能力判断集中在 `runtime.ts`，避免页面层平台分叉。

### 阶段 D（已完成）

- 完成移动端构建链路验证（Capacitor 同步）。  
- 完成桌面构建回归验证（Tauri NSIS 打包）。  
- 后续在 CI 中继续补充 Android/iOS 原生构建矩阵（当前先保证本地可验证链路可用）。

## 4. 代码规范要求

1. 页面层不得直接调用 `@tauri-apps/*` 或 `@capacitor/*`。  
2. 新能力必须先定义到 `src/platform/types.ts`。  
3. 适配器内需要中文注释说明平台差异和兜底行为。  
4. 迁移中保持“行为兼容优先”，再做性能优化。

---

## 5. 今日课程桌面小组件（Widget）

### 5.1 技术路线

采用 **路线 B**：在 Capacitor 架构下新增原生 Widget + 自研 Capacitor 插件，不迁移到 Tauri Mobile。

- 插件包：`packages/capacitor-plugin-mini-hbut-widget/`（monorepo 内联，不发 npm）
- Android：`AppWidgetProvider` + `RemoteViewsService` + WorkManager
- iOS：WidgetKit Extension + `TimelineProvider` + App Group

### 5.2 安装步骤

```bash
# 1. 安装依赖（workspace 自动解析插件包）
npm install

# 2. 构建前端
npm run build

# 3. 同步到原生工程
npx cap sync
```

### 5.3 App Group 配置（iOS）

> ⚠️ **必须配置**，否则 Widget Extension 无法读取主 App 写入的快照。

1. 在 Xcode 中为主 App Target 和 Widget Extension Target 都添加 App Group：`group.com.hbut.mini`
2. 确认 entitlements 文件包含：
   ```xml
   <key>com.apple.security.application-groups</key>
   <array><string>group.com.hbut.mini</string></array>
   ```
3. 重新生成 Provisioning Profile

涉及文件：
- `ios/App/App/App.entitlements`
- `ios/App/MiniHbutTodayWidget/MiniHbutTodayWidget.entitlements`

### 5.4 Android Receiver 注册

确认 `android/app/src/main/AndroidManifest.xml` 包含：

```xml
<receiver android:name="com.hbut.mini.widget.TodayCoursesProvider" android:exported="false">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data android:name="android.appwidget.provider"
               android:resource="@xml/appwidget_today_courses" />
</receiver>
```

### 5.5 构建前检查

`release.py` 在发布前会自动检查：
- iOS：`App.entitlements` 存在且包含 `group.com.hbut.mini`
- Android：`AndroidManifest.xml` 中注册了 `com.hbut.mini.widget.TodayCoursesProvider`

未通过时直接 fail-fast，阻止发布。

### 5.6 FAQ

| 问题 | 回答 |
|------|------|
| 为什么不用 `s00d/tauri-plugin-widgets`？ | Widget 走自研 `AppWidgetProvider` + WorkManager 路线（本文件 5.1），与 Tauri 移动工程通过 `scripts/patch_android_widget.py` 集成 |
| 是否计划迁移到 Tauri Mobile？ | **已迁移（#608 系列）**。正式 Android/iOS 移动构建以 Tauri v2 为准（`src-tauri/gen/android` / `src-tauri/gen/apple`），Capacitor 壳仅保留为历史工程 |
| Widget 数据从哪来？ | 从课表缓存派生，不发起额外网络请求 |
| 支持多账号吗？ | 当前 v1 仅支持单账号，后续可扩展 |

---

## 6. 旧 Capacitor 后台架构退役（#616）

> 本节的删除动作已在 #616 落地，**禁止重新引入**以下 legacy 路径（#608 架构红线）。

### 6.1 已退役组件

| 组件 | 退役内容 | 替代 |
|------|----------|------|
| `@transistorsoft/capacitor-background-fetch` | npm 依赖、初始化与 `com.hbut.mini.notify.periodic` 周期任务 | Tauri 插件 `tauri-plugin-hbut-background`（Android WorkManager / iOS BGAppRefresh） |
| `@capacitor/preferences` | npm 依赖与 `hbu_bg_*` 原生 Preferences 同步 | 前端 `hbu_notify_*` localStorage config + 插件 native store |
| `BackgroundFetchHeadlessTask.java` | Android Headless 业务检查（主工程 + debug 副本） | 原生 Worker（`BusinessChecksWorker` / `GradesCheckWorker`） |
| `KeepAliveForegroundService.java` | 常驻前台服务与“后台运行中”通知 | 不再提供（#608 红线 5） |
| `BootCompletedReceiver.java` | BOOT / 包替换后自动启动保活 | WorkManager 由系统自行恢复，无需接收器 |
| `HBUTNativePlugin` 保活入口 | `setForegroundService` / `getForegroundServiceState` | 删除；插件仅保留系统设置跳转（电池优化/通知设置） |
| `hbu_bg_*` 旧键 | Capacitor 原生 Preferences + localStorage 残留 | `migrateLegacyBackgroundState()`（`src/utils/legacy_background_migration.ts`）幂等清理 |
| iOS 旧 BGTask 标识 | `com.transistorsoft.fetch` / `com.hbut.mini.notify.periodic`、`processing` 后台模式 | Tauri iOS 的 `com.hbut.mini.background.grades-refresh`（见插件 `ios/INTEGRATION.md`） |

### 6.2 升级迁移语义

- 旧开关搬迁：仅当新键未设置时迁移（`hbu_bg_enabled` → `hbu_notify_bg` 等），随后删除旧键；重复升级/启动幂等。
- 旧周期任务/前台服务取消：结构性退役——新构建不含对应类与 manifest 注册，Android 升级安装时系统停止旧服务，旧 Alarm/Receiver 类不存在后调度自然失效，不会与新调度双跑。
- baseline/去重：新原生插件首次成功只建立 baseline 不通知；前台 `hbu_notify_snapshot:*` / 学校消息去重快照不迁移、不重置，历史成绩不会被当作新成绩。

### 6.3 保留项（不要误删）

- Android Widget 全套 Kotlin（`android/app/.../widget/**`）与 `scripts/patch_android_widget.py`；
- `@capacitor/local-notifications` 等仍有消费者的 Capacitor 依赖；
- 桌面端 keep-screen-on（`power_guard` / Tauri keep-screen-on 插件）；
- 开发网站域名 `hbut.6661111.xyz` 的非后台引用（`allowed_domains.ts`、`app_store_policy.ts`、README 等）。
