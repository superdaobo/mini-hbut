# Mini-HBUT v1.4.11 更新说明

发布日期：2026-09-23

---

## ✨ 版本概览

相对 [v1.4.10](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.10)，本版本重点完成了**课表向“时间画布”升级**、个人日程完整闭环、课程管理增强、研究生学号兼容、日语界面支持，以及 Android / iOS / Windows 多项稳定性修复。

本版本主要完成：

1. **课表进化为时间画布**：课程与个人日程统一进入同一时间轴，支持添加、编辑、删除、冲突提示、提醒、ICS 导出与真实时间布局
2. **课表视图与添加交互升级**：新增「全部 / 课表 / 日程」三态筛选，空白区域改为“两段式选择 → 再确认添加”，减少误触
3. **个人日程纳入外围体验**：首页「今日安排」、云同步、JSON / 长图 / ICS 导出均支持个人日程
4. **课程管理增强**：教务导入课程支持隐藏、恢复，并可选择「仅移除本周」或「移除整学期」
5. **账号兼容增强**：研究生 9 位学号与本科生 10 位学号统一兼容登录、缓存、路由、云同步与统计链路
6. **新增日语界面**：在简体中文、English 基础上新增日本語
7. **稳定性与平台体验修复**：修复 iOS 长后台恢复、导出中心白屏、课表空白选择偏移、Windows 关闭键行为、Android 小游戏 404 容灾等问题
8. **Android 启动闪退止血**：针对 beta.504–507 的主页面启动闪退，1.4.11 暂时熔断 Tauri Android Widget 原生桥，以稳定启动为优先
9. **发布前依赖安全升级**：Vitest 工具链升级至 4.1.11，修复 GHSA-82fw-gwwq-j7x9；同时将 rustls 升级至 0.23.45，修复 RUSTSEC-2026-0285

完整对比：[v1.4.10...v1.4.11](https://github.com/superdaobo/mini-hbut/compare/v1.4.10...v1.4.11)

---

## 🗓️ 课表与个人日程

### 时间画布与个人日程闭环（Epic #833）

课表页面不再只表达“第几节上什么课”，而是升级为能够同时容纳课程和真实时间日程的时间画布。

- 新增独立的个人日程数据模型与本地持久化，不与自定义课程混用
- 课程和日程统一映射到同一时间轴，日程可跨越课表虚线，不受固定节次限制
- 支持个人日程新增、详情、编辑、删除与冲突提示
- 冲突判断统一复用同一套时间区间算法，避免详情、编辑器和课表布局各自实现
- 本地提醒与课程 / 考试提醒共用同一调度与配额体系
- ICS 导出同时包含课程和个人日程
- 超出可视时间范围的日程使用 edge indicator 表达；部分超出范围时仍保留可见部分
- 针对快速切周、切账号和退出登录补强 stale response 防护

关联：[#833](https://github.com/superdaobo/mini-hbut/issues/833)、[#834](https://github.com/superdaobo/mini-hbut/issues/834)、[#835](https://github.com/superdaobo/mini-hbut/issues/835)、[#836](https://github.com/superdaobo/mini-hbut/issues/836)、[#837](https://github.com/superdaobo/mini-hbut/issues/837)、[#838](https://github.com/superdaobo/mini-hbut/issues/838)、[#839](https://github.com/superdaobo/mini-hbut/issues/839)、[#840](https://github.com/superdaobo/mini-hbut/issues/840)、[#841](https://github.com/superdaobo/mini-hbut/issues/841)

### 「全部 / 课表 / 日程」三态筛选

课表工具新增视图显示模式：

- **全部**：同时显示课程与个人日程
- **课表**：只显示课程
- **日程**：只显示个人日程

筛选发生在布局输入层，而不是简单 CSS 隐藏，所以被过滤的内容不会继续占用 lane / overlap 布局空间。用户选择会本地持久化。

### 空白区域两段式添加

空白课表区域的添加交互改为：

`第一次点击 → 选中虚线时间块 → 第二次确认 → 打开统一「添加安排」`

- 点击其它空白位置只移动选区，不立即打开弹窗
- Course 与 Event 各自保留预填草稿
- 双节课程按 1–2、3–4、5–6、7–8、9–10 自动吸附
- 在「日程」视图下默认创建 Event，在「全部 / 课表」视图下默认创建 Course
- 修复 5–6 节等位置待选框与真实课表行存在偏移的问题，并统一上下边界

关联：[#854](https://github.com/superdaobo/mini-hbut/issues/854)、[#855](https://github.com/superdaobo/mini-hbut/issues/855)、[#856](https://github.com/superdaobo/mini-hbut/issues/856)、[#857](https://github.com/superdaobo/mini-hbut/issues/857)、[#860](https://github.com/superdaobo/mini-hbut/issues/860)

### 个人日程同步到首页、云端与导出

- 首页「今日安排」现在会把个人日程与课程统一按时间排序
- 个人日程进入手动与自动云同步
- 云端旧数据如果没有 `events` 字段，会保留本地个人日程，不误清空
- JSON / 长图导出纳入个人日程
- 周 / 学期 ICS 继续同时导出课程与日程
- 账号切换后的旧请求不会覆盖当前账号数据

关联：[#849](https://github.com/superdaobo/mini-hbut/issues/849)、[#850](https://github.com/superdaobo/mini-hbut/issues/850)、[#851](https://github.com/superdaobo/mini-hbut/issues/851)、[#852](https://github.com/superdaobo/mini-hbut/issues/852)

### 教务课程隐藏 / 恢复 / 按周移除

课程管理页进一步区分教务课程和自添加课程：

- 支持将教务导入课程标记为隐藏
- 支持恢复此前隐藏的教务课程
- 删除教务课程时可选择：
  - **仅移除本周**
  - **移除整学期**
- 仍保留原始教务数据，避免因为本地管理操作破坏后续刷新能力

关联：[#867](https://github.com/superdaobo/mini-hbut/issues/867)、[#884](https://github.com/superdaobo/mini-hbut/issues/884)

---

## 🌐 国际化与账号兼容

### 新增日本語

Mini-HBUT 现支持：

- 简体中文
- English
- 日本語

本轮课表 / 日程新增文案同步覆盖三种语言。

关联：[#843](https://github.com/superdaobo/mini-hbut/issues/843)、PR [#846](https://github.com/superdaobo/mini-hbut/pull/846)

### 研究生 9 位学号兼容

此前多个链路硬编码为 10 位学号，导致研究生账号无法完整登录或恢复。

1.4.11 将学号基础契约统一为：

- 研究生：**9 位纯数字**
- 本科生：**10 位纯数字**

并同步覆盖：

- 登录与学习通自动登录
- remembered username
- Session 恢复
- Hash 路由
- 云同步
- 使用统计
- 学号脱敏显示

关联：[#882](https://github.com/superdaobo/mini-hbut/issues/882)

---

## 🛠️ 稳定性与体验修复

### iOS 长后台恢复

针对 App 在后台停留较长时间后回前台可能卡死或不可交互的问题，本版本补强：

- 原生 window focus 信号辅助 WebView lifecycle
- 长 idle 后对当前页面进行 soft remount
- 清理可能残留的 `home-scroll-restoring` 交互锁
- 增加恢复路径健康检查与调试 breadcrumb

同时修复：

- 导出中心首次进入可能因 computed ref 使用错误而白屏
- 「我的 → 开源说明」错误显示字面 `<strong>` 标签
- iOS 日程日期 / 时间输入框横向溢出

关联：[#859](https://github.com/superdaobo/mini-hbut/issues/859)、[#861](https://github.com/superdaobo/mini-hbut/issues/861)、[#862](https://github.com/superdaobo/mini-hbut/issues/862)、[#863](https://github.com/superdaobo/mini-hbut/issues/863)、[#864](https://github.com/superdaobo/mini-hbut/issues/864)

### Windows 关闭按钮

Windows 桌面端右上角关闭按钮恢复为真正的一键退出，不再误走“返回”或要求二次确认。

关联：[#875](https://github.com/superdaobo/mini-hbut/issues/875)

### Android 小游戏 404 容灾

针对 Android「更多 → 小游戏」出现 `404 / Not Found` 的问题：

- 主 CDN 失效时可自动刷新 manifest
- 针对旧缓存与版本目录裁剪做容灾
- 必要时切换备用来源
- 避免直接把 404 页面暴露给用户

关联：[#883](https://github.com/superdaobo/mini-hbut/issues/883)

---

## 📱 Android 启动闪退与 Widget 已知限制

在 1.4.11 测试周期中，Android beta.504–507 出现了“主页面显示后立即闪退”的严重回归。

经过多轮真机 A/B：

- beta.507 已取消整学期 `schedule_index` 大快照，**仍会闪退**
- beta.508 将 Tauri Android 的 Widget JS → Rust/JNI 原生桥整体熔断后，**实机确认不再闪退**

因此 1.4.11 采取稳定性优先策略：

> **Tauri Android 的桌面 Widget 原生写入 / 刷新桥在本版本暂时停用。**

这意味着 Android 桌面 Widget 在 1.4.11 中可能继续显示旧快照或无法随着 App 课表 / 主题变化及时更新。Widget 的 Kotlin / Java / Manifest 基础代码仍保留，后续版本会在定位并重构 native bridge 后恢复同步能力。

同时保留了此前为 Widget 增加的 XML 写入串行化与唯一临时文件机制，以避免后续恢复时再次出现并发 read-modify-write 竞态。

关联：[#880](https://github.com/superdaobo/mini-hbut/issues/880)、[#881](https://github.com/superdaobo/mini-hbut/issues/881)、[#891](https://github.com/superdaobo/mini-hbut/issues/891)、[#894](https://github.com/superdaobo/mini-hbut/issues/894)

---

## 🏗️ 工程与发布流程

### 发布前依赖安全升级

- `vitest` / `@vitest/coverage-v8` 升级至 **4.1.11**
- 修复 `@vitest/mocker` 的 GHSA-82fw-gwwq-j7x9 路径穿越 / 任意文件读取公告
- 发布门禁重新验证客户端与官网依赖，`npm audit` 均为 0 漏洞
- `rustls` 从 **0.23.36** 升级至 **0.23.45**，并同步更新 `rustls-webpki` 至 **0.103.15**
- 修复 RUSTSEC-2026-0285（TLS 1.3 handshake messages incorrectly accepted across encryption level boundaries）

### TestFlight / Dev 构建版本

- 修复 TestFlight 版本自动选择逻辑
- 统一 Dev Build 各平台 beta 编号
- TestFlight build number 继续由 App Store Connect 实际状态决定，避免历史超大 build number 干扰

关联：PR [#847](https://github.com/superdaobo/mini-hbut/pull/847)

### QQ 官方机器人发布通知

正式 Release 的网站部署成功后，现在可自动：

1. 读取当前正式 Release
2. 渲染 Release Notes 截图
3. 发送版本公告
4. 发送 Android APK
5. 发送 Windows NSIS 安装包

通知被安排在 `deploy-website` 成功之后，避免出现“网站尚未部署完成但群里已提前推送”的竞态。

关联：[#892](https://github.com/superdaobo/mini-hbut/issues/892)、PR [#896](https://github.com/superdaobo/mini-hbut/pull/896)

---

## 📦 版本信息

- 版本号：**1.4.11**
- 标签：[`v1.4.11`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.11)
- 上一版本：[`v1.4.10`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.10)
- 完整变更：[`v1.4.10...v1.4.11`](https://github.com/superdaobo/mini-hbut/compare/v1.4.10...v1.4.11)
- 统计：提交 **22** 个 · 变更文件 **187** 个 · +20,268 / −1,149 行

---

## 🔗 本版本重点关联

| 类型 | 编号 | 说明 |
|------|------|------|
| Epic | [#833](https://github.com/superdaobo/mini-hbut/issues/833) | 课表进化为时间画布 + 个人日程 |
| PR | [#842](https://github.com/superdaobo/mini-hbut/pull/842) | 时间画布契约与个人日程持久化 |
| PR | [#844](https://github.com/superdaobo/mini-hbut/pull/844) | 统一添加安排、Grid 日程、提醒、ICS |
| PR | [#845](https://github.com/superdaobo/mini-hbut/pull/845) | 日程详情、编辑删除与冲突闭环 |
| PR | [#848](https://github.com/superdaobo/mini-hbut/pull/848) | Epic #833 最终 QA |
| PR | [#853](https://github.com/superdaobo/mini-hbut/pull/853) | 个人日程接入首页、云同步与导出 |
| PR | [#858](https://github.com/superdaobo/mini-hbut/pull/858) | 视图筛选与两段式空白选择 |
| PR | [#865](https://github.com/superdaobo/mini-hbut/pull/865) | iOS 长后台与多项 UX 回归修复 |
| Issue | [#867](https://github.com/superdaobo/mini-hbut/issues/867) | 教务课程隐藏 / 恢复 |
| Issue | [#884](https://github.com/superdaobo/mini-hbut/issues/884) | 仅移除本周 / 整学期 |
| Issue | [#882](https://github.com/superdaobo/mini-hbut/issues/882) | 研究生 9 位学号 |
| Issue | [#883](https://github.com/superdaobo/mini-hbut/issues/883) | Android 小游戏 404 容灾 |
| Issue | [#894](https://github.com/superdaobo/mini-hbut/issues/894) | Android 启动闪退诊断与 Widget bridge 熔断 |
| PR | [#896](https://github.com/superdaobo/mini-hbut/pull/896) | Release 后自动 QQ 通知 |
