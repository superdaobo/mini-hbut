# Mini-HBUT 重构迁移方案（Tauri 桌面 + Capacitor 移动）

## 1. 目标

- **桌面端**：继续使用 Tauri，保持当前能力与发布链路稳定。  
- **移动端**：新增 Capacitor 外壳，逐步承接 iOS/Android 深度能力。  
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
| 为什么不用 `s00d/tauri-plugin-widgets`？ | 移动端使用 Capacitor，该插件仅适用于 Tauri Mobile |
| 是否计划迁移到 Tauri Mobile？ | 当前无计划，成本远大于收益 |
| Widget 数据从哪来？ | 从课表缓存派生，不发起额外网络请求 |
| 支持多账号吗？ | 当前 v1 仅支持单账号，后续可扩展 |
