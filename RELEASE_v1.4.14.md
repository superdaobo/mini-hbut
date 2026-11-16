# Mini-HBUT v1.4.14 更新说明

发布日期：2026-11-16

---

## ✨ 版本概览

相对 [v1.4.13](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.13)，本次更新以 **课表考试一体化、成绩分布查询、离线可用与稳定性** 为重点，同时在底层完成应用模块平台与身份 v2 的能力落地。

本版本主要完成：

1. **课表与考试一体化**：期末考试以「考」卡片叠加在课表时间轴上，支持只读详情与「查看全部考试」跳转。
2. **成绩分布查询**：新增教师 / 科目双模式与竞态保护，首页提供独立入口。
3. **离线可用**：断网时核心模块可读缓存，首页展示离线横幅，断网请求快速失败，在线时后台静默预热。
4. **课程冲突展示**：冲突课程支持「合并 / 并排」两种模式，并可持久化保存。
5. **暗色模式二度轮调**：全页面暗色可读性修复，并新增门禁阻止 `:global(html.dark)` 规则静默失效。
6. **稳定性修复**：AI 校园助手空白、学习通资料页、校园导览地图、通知重复、服务统计红条、电费月份错位、校园码重试等。
7. **Android 桌面小组件恢复**：修复启动闪退与今日日程同步，v1.4.13 中的熔断限制已解除。

完整变更：[v1.4.13...v1.4.14](https://github.com/superdaobo/mini-hbut/compare/v1.4.13...v1.4.14)

---

## 📅 课表与考试

### 考试卡片叠加到时间轴

期末考试安排以红色「考」卡片叠加在课表时间轴上，与日程事件共用右侧叠加区域，课程卡片不被挤压。

- **卡片信息**：课程名、考场、开始时间；时间未定时显示「时间待定」，并以虚线卡片提示占位。
- **只读详情**：点击卡片打开详情弹窗，展示考试日期 / 时间 / 考场 / 座位号，并提供「查看全部考试」跳转考试页。
- **日期提示**：有考试的日子在日期表头显示红点。
- **数据同源**：与考试页共用 `/v2/exams` 端点与缓存（`exams:{studentId}:{semester}`），离线与维护降级自动生效。
- **视图模式**：「仅看日程」模式隐藏考试卡片，`all` / `courses` 模式显示。
- **无障碍**：考试卡片支持键盘 Space 键打开详情；时间待定时详情回退展示原始时间文本。
- **视觉回归**：qa-visual 新增单场 / 与课程重叠 / 时间待定 / 同日两场四个考试场景及详情弹窗闭环截图。

关联：[PR #1242](https://github.com/superdaobo/mini-hbut/pull/1242)

### 课程冲突展示与课表视觉

- 新增「合并 / 并排」两种冲突课程展示模式，选择结果持久化保存。
- 移动端冲突展示改为横向分段控件，窄屏下不再挤压。
- 修复合并模式下冲突卡片丢失的问题。
- 课程标题支持 3 行、日程标题支持 2 行，长课程名不再被截断。
- 夜间模式下优化课表顶栏、日期行、今日竖条、周选择器与工具按钮的对比度。

关联：[#1115](https://github.com/superdaobo/mini-hbut/issues/1115)、[#1116](https://github.com/superdaobo/mini-hbut/issues/1116)、[#1124](https://github.com/superdaobo/mini-hbut/pull/1124)、[#1097](https://github.com/superdaobo/mini-hbut/pull/1097)、[#1139](https://github.com/superdaobo/mini-hbut/issues/1139)

---

## 📊 成绩分布

- 新增**教师 / 科目双模式**查询，切换时带竞态保护，快速连点不会串数据。
- 首页新增「成绩分布」独立入口，原 Tab 入口保持兼容。
- 布局迁移后修正窄屏与长教师名的展示问题。

关联：[#1110](https://github.com/superdaobo/mini-hbut/issues/1110)、[#1111](https://github.com/superdaobo/mini-hbut/issues/1111)

---

## 📴 离线可用

围绕 [Epic #1145](https://github.com/superdaobo/mini-hbut/issues/1145) 落地了完整的离线降级链路：

- **离线快速路径**：断网时核心模块走本地缓存，不再直接抛网络错误；无缓存的模块给出明确可读的空态提示。
- **全局离线指示**：首页展示设备离线相位横幅与状态点，恢复在线后自动消失。
- **断网快速失败**：网络状态监控接入会话恢复链，断网时立即失败而不是等待超时；网络恢复后即时重试。
- **业务离线回退**：校邮（列表 / 详情）、学习通列表、智慧迎新、图书馆预约列表均支持 SQLite 持久缓存与离线快照。
- **后台预热**：在线时静默预取核心模块数据，首次进入更快，也为离线兜底。
- **存储基础**：新增 7 张离线缓存表，按账号与学期隔离。

关联：[E1 #1146](https://github.com/superdaobo/mini-hbut/issues/1146) / [PR #1152](https://github.com/superdaobo/mini-hbut/pull/1152)、[E2 #1147](https://github.com/superdaobo/mini-hbut/issues/1147) / [PR #1153](https://github.com/superdaobo/mini-hbut/pull/1153)、[E3 #1148](https://github.com/superdaobo/mini-hbut/issues/1148) / [PR #1154](https://github.com/superdaobo/mini-hbut/pull/1154)、[E4 #1149](https://github.com/superdaobo/mini-hbut/issues/1149) / [PR #1156](https://github.com/superdaobo/mini-hbut/pull/1156)、[E5 #1150](https://github.com/superdaobo/mini-hbut/issues/1150) / [PR #1157](https://github.com/superdaobo/mini-hbut/pull/1157)、[E6 #1151](https://github.com/superdaobo/mini-hbut/issues/1151) / [PR #1155](https://github.com/superdaobo/mini-hbut/pull/1155)、[后台预热 #1158](https://github.com/superdaobo/mini-hbut/issues/1158) / [PR #1160](https://github.com/superdaobo/mini-hbut/pull/1160)

---

## 🌙 暗色模式与视觉

- **全页面二度轮调**：按页面逐个复核深色下的卡片面、分隔线、次级文字与图标对比度。
- **二级窗口**：修复二级窗口未继承主题、部分区域仍是浅色的问题。
- **我的页与课表详情**：操作区、课程详情弹窗在暗色下恢复可读。
- **导出中心**：模块名与学期标签在暗色下不再消失。
- **服务统计**：卡片补齐深色面与对比度。
- **门禁**：新增回归测试，禁止 scoped 样式再用 `:global(html.dark)`——这类写法会被编译成只有 `html.dark` 的选择器，规则静默失效；相关规则已统一迁到全局 `dark-mode.css`。

关联：[PR #1302](https://github.com/superdaobo/mini-hbut/pull/1302)、[PR #1306](https://github.com/superdaobo/mini-hbut/pull/1306)

---

## 🐛 稳定性与体验修复

### 页面白屏与加载

- 修复**校园 AI 助手打开空白**：视图导入引用了未定义标识符，导致整页加载失败。
- 修复**教室页白屏**：恢复设置页绑定，补全缺失依赖。
- **校园导览**：首屏初始化收敛为单次，地图加载失败提供重试入口；生产 CSP 放行腾讯地图脚本并补充加载兜底。

### 数据与统计

- **服务统计**：改用 `/health/deps` 获取完整聚合，兼容后端降级后的轻量存活载荷，修复红条误报。
- **电费月视图**：月度趋势按真实年月去重升序，本月只认当前自然月；异常标签做一致性校验并按滚动窗口派生到当前月，修复月份重复与滞后。

### 通知与登录

- 通知去重基线加固，消除重登 / 切换账号后整表重发。
- 学习通资料页跳登录时强制重登并重试，避免半登录态卡死。
- 强制重登增加 30 秒进程级节流，避免重复弹窗。

### 交互细节

- 修复「编辑快捷入口」等弹窗塌缩成竖条：锁定 Tailwind 命名 `max-w` 标度的 v3 语义，避免 v4 迁移后标度被污染。
- 修复快捷入口编辑器条带布局。
- 通知中心「近期消息」卡片支持点击跳转到对应功能页，并禁止长按选中文本。
- 校园码：失败原因分类、token 重试边界收紧、自动刷新失败自愈、失效码与订单轮询保护。

关联：[PR #1302](https://github.com/superdaobo/mini-hbut/pull/1302)、[PR #1311](https://github.com/superdaobo/mini-hbut/pull/1311)、[PR #1314](https://github.com/superdaobo/mini-hbut/pull/1314)、[#1229](https://github.com/superdaobo/mini-hbut/issues/1229) / [PR #1231](https://github.com/superdaobo/mini-hbut/pull/1231)、[PR #1230](https://github.com/superdaobo/mini-hbut/pull/1230)、[#1107](https://github.com/superdaobo/mini-hbut/pull/1107)、[#1099](https://github.com/superdaobo/mini-hbut/pull/1099)、[#1113](https://github.com/superdaobo/mini-hbut/issues/1113) / [PR #1117](https://github.com/superdaobo/mini-hbut/pull/1117)、[#1114](https://github.com/superdaobo/mini-hbut/issues/1114) / [PR #1118](https://github.com/superdaobo/mini-hbut/pull/1118)

---

## 📱 移动端

### Android 桌面小组件

- 修复 Widget 原生桥 `ndk_context` 未初始化导致的**启动闪退**；初始化失败只降级为「Widget 不可用」，不再拖垮整个 App。
- 今日课程卡片毛玻璃 UI 改版，自定义课程即时同步。
- 电费快照写入人类可读房间名（校区 / 楼栋 / 楼层 / 房间），不再写内部 ID。
- 拒绝过期快照，避免跨天显示昨日课程。
- 真机验证：ROD2-W69（Android 16）5/5 冷启动无闪退。

关联：[#1029](https://github.com/superdaobo/mini-hbut/issues/1029)、[PR #1036](https://github.com/superdaobo/mini-hbut/pull/1036)

### iOS

- TestFlight 持续构建，本版包含上述全部修复。
- 合规构建（`VITE_APP_STORE_BUILD`）继续隐藏未登录与审核演示会话下的敏感模块，真实门户验证用户按会话权限展示功能。

---

## 🏗️ 工程与安全底座

> 以下为底层能力，**本版不改变现有登录入口与功能入口**。

### 应用模块平台（[Epic #1161](https://github.com/superdaobo/mini-hbut/issues/1161) / [#1162](https://github.com/superdaobo/mini-hbut/issues/1162)）

- 模块内容运行在**独立 origin + 容器 sandbox** 中，不再被视为可信来源，也不继承宿主权限。
- 模块发布包走**签名验签链**：验签、防回放、解包边界与内容 CSP，未验签的本地模块直接拦截。
- 受控请求宿主：模块只能通过受控通道发起请求，实例生命周期与协议版本 fail-closed。
- 远端嵌入白名单、SDK 版本校验、导航与换模块时实例作废、平台降级矩阵。
- 模块更新不得悄悄扩权：授予集只做交集。
- 首个真实只读模块「账号安全概览」以**样例**形式跑通「打包 → 签名 → 验签 → 渲染」全链路，可用模块由远程配置下发。

### 身份 v2（[Epic #1243](https://github.com/superdaobo/mini-hbut/issues/1243)）

- 设备密钥对 **canonical v2 正式签名**命令（只签名不造密钥、三重绑定、自检通过才返回）。
- Casdoor **授权码 + PKCE** 客户端流程（深链 + loopback 回退），会话改交 refresh token，设备换票降为显式开关的过渡回退。
- 学号 claim 名称可配置，并加误配告警；首次登记与换机码流程（发起 + 旧设备批准）。
- 禁止自报学号自动接管既有身份；客户端退役 `/identity/bootstrap` 调用。
- 退役自建应用注册表 / 审核 / 门户写入口（410 + 权威源变更，门户转为只读）。
- 说明：v2 登录链路尚未替换现网登录入口，仍以现有教务 / 融合门户登录为准。

### 其他

- 教务会话核验上报（[#1307](https://github.com/superdaobo/mini-hbut/issues/1307)）：灰度开关，**默认关闭**；开启后登录成功会上报教务会话供后端核验学号，失败静默且不阻塞登录。
- 发布说明与 QQ 群通知的构建时间统一为北京时间（UTC+8）。
- Linux 构建 apt 步骤加 noninteractive，修复构建卡死。

---

## ⚠️ 已知限制

### 身份 v2 与模块平台

- 身份 v2 的登录链路**尚未替换**现有入口，换机与多设备绑定的界面化流程留待后续版本开放。
- 模块平台以样例模块验证全链路，实际可用模块由远程配置下发；未下发的用户看不到入口。
- 应用注册与审核入口已退役为只读，第三方应用接入走新的权威源。

### 离线能力边界

- 离线只保证「可读」，所有写操作（提交预约、发送邮件、刷课等）仍需联网。
- 第三方数据的离线快照依赖最近一次成功同步；首次安装且从未联网时无缓存可读，会看到明确空态而非假数据。
- 学习通、校邮等模块的离线能力以最近一次同步的学期 / 账号为界，切换账号后需重新联网同步。

### 图书馆预约

- 原生座位页主要用于查询；座位提交仍需要官方页面中的人工行为验证。
- 官方服务的开放时段、用户资格与会话有效性决定是否能提交成功。
- 部分未来日期的座位预约受学校接口限制，不能保证全部日期可操作。

### Android 桌面小组件

- 已修复启动闪退与同步链路，并在 ROD2-W69（Android 16）验证 5/5 冷启动；其他厂商 ROM 的后台限制仍可能影响刷新时效。

### iOS TestFlight / App Store 合规构建

为符合分发策略，未登录与审核演示会话会隐藏图书馆预约、部分外部模块及校园写操作；通过真实门户验证的正常用户按会话权限展示功能。TestFlight 构建同样启用该策略，与 GitHub Release 版本的功能可见范围不完全一致。

---

## 📦 版本信息

- 版本号：**1.4.14**
- 发布标签：**v1.4.14**
- 上一正式版：[v1.4.13](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.13)
- 完整对比：[v1.4.13...v1.4.14](https://github.com/superdaobo/mini-hbut/compare/v1.4.13...v1.4.14)
- 支持平台：Android、iOS、Windows、macOS、Linux
- 仓库：https://github.com/superdaobo/mini-hbut

感谢每位参与反馈和测试的同学与老师。Mini-HBUT 是非官方校园工具，后续将继续完善师生共同使用的校园功能。
