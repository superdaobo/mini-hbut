# Changelog

本文件记录 Mini-HBUT 的重要版本变更。

---

## [Unreleased]

### 新增

- **移动端今日课程桌面小组件**：在 Android / iOS 桌面添加「今日课程」Widget，无需打开 App 即可查看当天课表
  - Android：支持 4×2（默认）、2×2、4×1 三种尺寸
  - iOS：支持 systemMedium（默认）、systemSmall、systemLarge 三种尺寸
  - 自动同步：课表刷新、启动恢复、跨天切换时自动更新 Widget
  - 点击跳转：点击 Widget 直接跳转到 App 课表页对应日期
  - 深色模式：跟随系统深浅色自动适配
  - 无障碍：支持大字号、VoiceOver / TalkBack 朗读
  - 离线可用：基于本地缓存渲染，无需网络
  - 隐私保护：学号脱敏显示（如 20**56）
  - 技术方案：路线 B（Capacitor + 原生 Widget + 自研插件 `@mini-hbut/capacitor-plugin-mini-hbut-widget`）
  - 不使用 `s00d/tauri-plugin-widgets`（该插件仅适用于 Tauri Mobile，与当前 Capacitor 架构不兼容）

### 变更

- `release.py` 新增 Widget 构建前检查：验证 iOS App Group 配置与 Android receiver 注册

---

## FAQ — 今日课程桌面小组件

**Q: 为什么不迁移到 Tauri Mobile 并使用 `s00d/tauri-plugin-widgets`？**

A: 迁移移动端到 Tauri Mobile 需要重建 Android / iOS 工程、重建签名发布链路、重做所有已有 Capacitor 能力，成本远大于单一小组件功能的收益。路线 B（保留 Capacitor + 自研插件）是当前最优解。

**Q: Widget 数据从哪里来？**

A: 从 App 本地课表缓存派生，不发起额外网络请求。每次课表刷新成功后自动同步到 Widget。

**Q: 需要额外配置什么？**

A: 
- iOS 开发者需配置 App Group `group.com.hbut.mini`（主 App + Widget Extension 两个 Target）
- Android 无需额外配置（receiver 已在 AndroidManifest.xml 中注册）

**Q: 支持哪些系统版本？**

A: Android 10+ (API 29+)、iOS 14.0+。
