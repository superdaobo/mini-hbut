# Changelog

本文件记录 Mini-HBUT 的重要版本变更。

---

## [Unreleased]

### 新增

- **课表内考试卡片**：期末考试安排以红色「考」卡片叠加在课表时间轴上（与日程事件共用右侧叠加区域，课程卡片不受挤压）
  - 卡片显示课程名、考场、开始时间；时间未定时显示「时间待定」并以虚线卡片提示占位
  - 点击卡片打开只读详情弹窗：考试日期 / 时间 / 考场 / 座位号 +「查看全部考试」跳转考试页
  - 有考试的日子在日期表头显示红点提示
  - 数据与考试页共用 `/v2/exams` 端点与缓存（`exams:{studentId}:{semester}`），离线 / 维护降级自动生效
  - 视图模式 `events`（仅看日程）下隐藏考试卡片；`all` / `courses` 下显示
  - 视觉回归：qa-visual 新增 ⑨-⑫ 四个考试场景（单场 / 与课程重叠 / 时间待定 / 同日两场）+ 详情弹窗闭环截图
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

### 修复

- **暗色模式可读性**：服务统计页整块白底（「基础设施」「我的使用」压白底不可读）与导出中心未勾选模块近黑字，统一补齐深色面与对比度（PR #1302）
- **校园导览首屏卡死**：定位回调不返回时永久停在「正在加载校园地图与 POI 数据…」；定位加硬看门狗、首屏期限回落校区中心、请求 12s 超时、地图失败给可重试错误条（PR #1302）
- **小塔出行地图不可用**：生产 CSP 的 `script-src` 未放行 `https://map.qq.com`，腾讯地图脚本被拦截；已最小放行并补加载超时/失败清理/重试（PR #1302）
- **学习通资料分享「资料页跳转登录」**：半失效会话下重试无效；改为命中登录跳转且有门户密码时强制重登一次再重试，并修正登录页误判与绿条/红条同屏（PR #1302）
- **校园助手打开空白**：`chat-model.js` 等处 5 个未定义标识符导致视图导入失败；补齐导入并把相关文件纳入 js-sfc 未定义标识符门禁，异步视图增加错误兜底页（PR #1302）

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
