# Mini-HBUT v1.4.7 更新说明

发布日期：2026-08-28

---

## ✨ 版本概览

相对 [v1.4.6](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.6)，本版本合入 **83** 个已合并 PR，并在版本窗口内关闭 **99** 个 Issue。

本版本主要完成：

1. **校内域名 HTTPS 证书可用性改造（epic #716）**：教务系统（jwxt）/ 新融合门户（e.hbut.edu.cn）等学校官方域名在证书过期等异常情况下不再被拦截——Rust 业务层无条件放行（Release 与 Debug 一致）、Android/iOS 原生后台任务同步放行，并新增冷启动证书探测与「我的」页兼容模式黄色提示
2. **学习数据开放与本地 Agent 接口（epic #697）**：本机桥只读学业数据端点族 + 本机令牌门禁、OIDC 数据域 scope 扩展与授权快照机制、中继页与授权弹窗逐项明示勾选、双篇接入文档
3. **账户级开发者平台（epic #686）**：API Key 平台一期（签发 / Bearer 认证 / account REST / 门户管理页）、应用详情页重设计、API 文档站上线
4. **密钥与设备身份可靠性（epic #668 系列）**：keyring 平台原生后端全目标启用与回归护栏、设备绑定全自动无感、多设备自绑定（移除第二设备批准门槛）
5. **开学季学期切换收尾（#741 / #742 / #745）**：校历第零周与课表学期起始对齐（8/31）、周切换动画随滑动方向生效、课表页滑动与键盘切周恢复
6. **移动端与界面体验**：宽屏适配一期（768 断点 + 首页双栏）、学习通通知独立渠道、电费卡前移与用电趋势排序、冷启动深链静默降级、登录错误消息可读化
7. **工程治理与发布自动化**：客户端工作区迁入 apps/client、CI 门禁分层与 CodeQL 后置、TestFlight 出口合规全自动系列、dev 构建编号规则、tauri-plugin-log 文件日志可观测性

完整对比：[v1.4.6...v1.4.7](https://github.com/superdaobo/mini-hbut/compare/v1.4.6...v1.4.7)

---

## 🎯 修复与体验改进

### 🗓️ 开学季学期切换与校历（#741 / #742 / #745）

- 校历解析保留第零周并合并跨月拆行周，学期起始与课表缓存对齐为 8/31，两页不再显示不同第一周（#743）
- 移除无 UI 的学期弹窗与徽章死状态机，恢复课表页滑动滚动与键盘切换周次（#744）
- 开学季自动切换学期：移除「anchor 有课即中止探测」的提前收工逻辑，保证新学期到来后自动切换到新学期课表（#745）
- 切换学期时清空远程课表缓存，无数据学期不再误展示上一学期课表（#634，修复 #633）

### 📬 学校消息与通知

- 已登录用户打开学校消息页不再误报「缺少登录方式，请重新登录」：登录方式键缺失时降级 portal 链路（#730，修复 #729）
- 新增「学习通通知」独立通知渠道：与学校消息形态一致、来源区分、并行检测（#723，修复 #715）
- 后台检查控制面收敛：移除 per-feature 独立开关，统一由通知类型开关控制（#708，修复 #706）

### ⚡ 电费

- 「近期消息」区块内电费监控卡片前移至考试与学校消息之间，与使用频率对齐（#733，修复 #732）
- 用电趋势按月升序排序并支持横向滚动查看全部历史月份（#738，修复 #737）

### 🔐 登录与会话

- 登录错误消息可读化：修复 `[object Object]`、英文原文、按钮无提示与超时问题（#654，修复 #653）
- 登录二维码 canvas 内联兜底样式，外部 CSS 失效时不再溢出裁切（#691，修复 #690）
- 会话恢复提示文案区分网络/DNS 错误，不再一律报「后台自动登录未成功」（#588）
- 修复 v1.4.4 → v1.4.6 升级后 Session NULL 凭据导致的成绩无法查询与登录恢复死循环（#663，修复 #659）

### 🖥️ 交互与显示

- 底部 Tab 页滚动位置串扰修复：装配 appShellRef 使切页回顶真正生效（#684，修复 #681）
- 培养方案课程详情弹窗居中于手机屏幕而非整页内容（#662，修复 #661）
- 给分记录查询增加超时、中文错误提示与重试按钮（#660，修复 #658）
- 冷启动收到已失效 identity 深链静默降级，不再全屏阻塞弹「授权失败」（#740，修复 #739）
- 选课中心入口菜单增加测试阶段提示横幅，以教务系统/学习通为准（#703）
- 应用内旧标识 favicon 换新 + Android 通知小图标品牌化（#632，修复 #631）

### 🧹 日志与稳定性

- 移除 identity-overlay 每 3 秒诊断轮询上报，消除运行时日志刷屏（#696）
- dev 构建 keyring 库 DEBUG 日志降噪：level_for 降为 Warn（#722，修复 #721）
- 接入 tauri-plugin-log 文件日志，恢复线上可观测性（#674，修复 #671）

---

## 🛡️ 安全与密钥可靠性

### 校内域名 TLS 证书过期可用性改造（epic #716）

学校教务系统、新融合门户等官方域名在部分网络环境下证书过期，原 Release 构建默认严格校验导致全校用户在那个时间段完全无法使用成绩查询、电费、一码通等核心业务。产品决策：**学校官方域名无论证书状态如何都必须可访问**。本版本落地：

- Rust 层统一 TLS 策略：校内业务客户端（登录/课表/成绩/门户/电费 SSO 等）无条件接受证书异常，5 处 SSO 跳板硬编码全部收口为单一判定入口；OCR、identity 等第三方服务通道维持严格校验（#727，修复 #717）
- Android/iOS 原生后台任务（成绩/考试/学校通知）同步放行：域判定严格限定 `*.hbut.edu.cn` 后缀匹配，超星等外部域完全不受影响（#727，修复 #718）
- 冷启动证书探测 + 「我的」页登录状态区黄色提示：独立严格校验探针检测 jwxt / e.hbut.edu.cn 两域证书状态，异常时逐域显示「已以兼容模式连接」，正常与网络故障不显示；会话级缓存防重复探测、零轮询（#727，修复 #719）
- 安全权衡已留档：放行即同时跳过有效期/自签/主机名三类校验，校园网中间人攻击面接受为产品决策的一部分；SECURITY.md 与设计文档同步更新

### keyring 平台后端与设备身份（epic #668 系列）

- 按 target 启用 keyring 平台原生后端（Windows Credential Manager / Apple Keychain / Linux Secret Service），写路径增加重写韧性并细分后端缺失错误（#673）
- keyring 真后端回归护栏：单测硬失败化 + CI 补 Windows/macOS 测试与 feature 断言（#676）
- Android 设备身份与云同步主密钥显式降级，替代误导性写入报错（#675）
- 设备绑定全自动无感：「密钥在但缺本地绑定」时静默补绑定（#678）
- 多设备自绑定：同账号新设备凭认证会话直接注册授权，移除第二设备批准门槛（#680）
- 设备密钥 keyring 损坏条目自愈（#657）

### 防刷与限流（#708）

- 限流改用真实访客 IP：小黄云（CDN 代理）下优先读 `CF-Connecting-IP`，不再因全体共用边缘 IP 被误伤（#734）
- 三个敏感写动作（创建应用 / 提交审核 / 申请 Key）接入 Turnstile 人机验证（#735）

---

## 💻 学习数据开放与开发者平台

### 本地 Agent 数据接口与授权快照（epic #697，六件套）

- 本机桥新增只读学业数据端点族（grades / schedule / exams…）与本机令牌门禁（#709）
- 数据域 scope 扩展 + 授权快照机制：加密存储 / claims 注入 / 时效读取 / 撤回清理（#710）
- 中继页新增学习数据 scope 逐项明示清单（#711）
- 授权弹窗学习数据 scope 逐项勾选，取消项不进入批准范围（#712）
- 新增本地 Agent 接入指南与数据共享说明文档（#713）
- scope 目录扩展学习数据域 + 已上架应用元数据可编辑（含审计）（#725）

### 账户级开发者平台（epic #686）

- 应用详情页重设计：显性编辑入口 + 通俗化信息架构（#692）
- 账户级 API Key 平台一期：签发 / Bearer 认证 / account REST / 门户管理页（#693）
- website 新增 API 文档站：认证 / 端点参考 / curl 示例 / Agent 接入指南（#694）

### OIDC 平台配套

- 公开 OIDC 平台并收口开发者接入文档（#635）
- 「授权记录」页展示本机 id.湖北工业大学.com 授权历史（#639）
- 重建 web 独立 npm 锁文件并钉死 openid-client@6.8.5，修复云端构建不可用（#666）
- sitemap 收录 /docs/identity-oidc 开发者文档页（#667）
- 同步根 README 与官网（OIDC 平台 + v1.4.6 能力 + 精简发布脚本/Widget 章节）（#638）

---

## 🎨 界面与适配

- 宽屏适配一期：768 断点地基 + 首页双栏布局（左今日安排 / 右快捷入口与所有功能）（#724，修复 #714）
- 学习通通知独立渠道已见「学校消息与通知」节（#723）
- 登录 / 选课中心 / 给分记录等页面的体验修复见「修复与体验改进」节

---

## 🏗️ 工程治理与 CI

### 客户端工作区迁移（#640 epic）

- 客户端完整工作区迁入 `apps/client` 并完成仓库治理：文档、CI、提交保护、生成物治理全部适配（#647，closes #631 #640-#646）
- 修复移动端链接：Android JNI 与 iOS Swift linking（#648）
- 清理 main 生产构建图无用代码（#645）

### CI 门禁与发布自动化

- 分层精简 PR 门禁：PR 仅跑快路径，CodeQL / Release / Dry Run 后置（#605 / #606 / #607，修复 #598）
- Dev 测试版自动编号：最新正式版 patch+1 的 beta（#685，修复 #683）
- TestFlight 出口合规全自动系列：ASC 自动递增留空版本号（#707）、声明创建体按 Apple 真实 schema 修正（#720）、仅系统加密表达 + iOS 最低版本升至 15.0（#726）、声明关联前轮询等待 APPROVED（#728）、build 豁免标记兜底（#731）、上传后自动关联 AppEncryptionDeclaration（#665）
- release notes 优先使用仓库内手写 `RELEASE_<版本>.md`（#569）
- 阶段 4/5 架构收口：核心 JavaScript 迁移 TypeScript、上帝文件拆分、移动端发布裁剪（#570 / #585 / #596 / #588 / #632 等）
- 依赖更新：pinia 4、vue 3.5.41、vue-tsc 3、codeql-action 等（#426 / #508 / #563 / #599-604 / #649 等）

---

## 📦 版本信息

- 版本号：**1.4.7**
- 标签：[`v1.4.7`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.7)
- 上一版本：[`v1.4.6`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.6)
- 完整变更：[`v1.4.6...v1.4.7`](https://github.com/superdaobo/mini-hbut/compare/v1.4.6...v1.4.7)
- 统计：已合并 PR **83** · 版本窗口内关闭 Issue **99**

---

## 🔗 本版本重点关联

| 类型 | 编号 | 说明 |
|------|------|------|
| Epic | [#716](https://github.com/superdaobo/mini-hbut/issues/716) | 校内域名 HTTPS 证书过期可用性改造：业务侧无条件放行 + 启动探测提示 |
| Epic | [#697](https://github.com/superdaobo/mini-hbut/issues/697) | 学习数据开放：本地 Agent 数据接口 + OIDC 数据快照共享 |
| Epic | [#686](https://github.com/superdaobo/mini-hbut/issues/686) | 开发者平台：应用体验升级 + 账户级 API 平台 |
| Epic | [#668](https://github.com/superdaobo/mini-hbut/issues/668) | keyring 平台原生后端与设备身份可靠性 |
| Epic | [#640](https://github.com/superdaobo/mini-hbut/issues/640) | 客户端工作区迁入 apps/client + 仓库治理 |
| PR | [#727](https://github.com/superdaobo/mini-hbut/pull/727) | 校内 TLS 放行 + 双端原生放行 + 探测黄字（#717/#718/#719） |
| PR | [#647](https://github.com/superdaobo/mini-hbut/pull/647) | 客户端迁移 apps/client 全量治理 |
| PR | [#724](https://github.com/superdaobo/mini-hbut/pull/724) | 宽屏适配一期：768 断点 + 首页双栏 |
| Issue | [#741](https://github.com/superdaobo/mini-hbut/issues/741) | 校历/课表学期起始周次不一致（开学季收口） |
| PR | [#745](https://github.com/superdaobo/mini-hbut/pull/745) | 开学季自动切换学期 |
| Issue | [#633](https://github.com/superdaobo/mini-hbut/issues/633) | 无数据学期误展示旧学期课表 |
| PR | [#693](https://github.com/superdaobo/mini-hbut/pull/693) | 账户级 API Key 平台一期 |
| PR | [#735](https://github.com/superdaobo/mini-hbut/pull/735) | 三敏感写动作接入 Turnstile 人机验证 |
| PR | [#674](https://github.com/superdaobo/mini-hbut/pull/674) | tauri-plugin-log 文件日志可观测性 |

---

## 📋 完整 PR 列表（v1.4.6 → v1.4.7，共 83 个）

- [#426](https://github.com/superdaobo/mini-hbut/pull/426) build(deps): bump pinia from 3.0.4 to 4.0.2
- [#507](https://github.com/superdaobo/mini-hbut/pull/507) build(deps): bump @radix-ui/react-separator from 1.1.8 to 1.1.15 in /website
- [#508](https://github.com/superdaobo/mini-hbut/pull/508) build(deps): bump vue from 3.5.39 to 3.5.41
- [#511](https://github.com/superdaobo/mini-hbut/pull/511) build(deps): bump @radix-ui/react-navigation-menu from 1.2.14 to 1.2.22 in /website
- [#560](https://github.com/superdaobo/mini-hbut/pull/560) build(deps): bump lenis from 1.3.17 to 1.3.26 in /website
- [#561](https://github.com/superdaobo/mini-hbut/pull/561) build(deps): bump @vueuse/core from 14.3.0 to 14.4.0
- [#562](https://github.com/superdaobo/mini-hbut/pull/562) build(deps): bump marked from 18.0.6 to 18.0.9
- [#563](https://github.com/superdaobo/mini-hbut/pull/563) build(deps-dev): bump vue-tsc from 2.2.8 to 3.3.9
- [#564](https://github.com/superdaobo/mini-hbut/pull/564) build(deps): bump github/codeql-action from 4 to 4.37.4
- [#565](https://github.com/superdaobo/mini-hbut/pull/565) fix: prevent strict-CSP startup white screen and restore full dev builds
- [#567](https://github.com/superdaobo/mini-hbut/pull/567) fix(updater): prevent same-core stable update prompt for beta installs
- [#568](https://github.com/superdaobo/mini-hbut/pull/568) chore(release): bump version to 1.4.6 and add release notes
- [#569](https://github.com/superdaobo/mini-hbut/pull/569) fix(ci): release notes 优先使用仓库内手写 RELEASE_<版本>.md
- [#570](https://github.com/superdaobo/mini-hbut/pull/570) refactor: 完成阶段 4 架构收敛与安全迁移
- [#585](https://github.com/superdaobo/mini-hbut/pull/585) refactor: complete god file decomposition
- [#588](https://github.com/superdaobo/mini-hbut/pull/588) fix: restore split regressions and session/nav issues (#586 #587)
- [#596](https://github.com/superdaobo/mini-hbut/pull/596) feat: Mobile Size 发布裁剪与 Phase 5 收口（#582-#595 + #556/#557/#573）
- [#597](https://github.com/superdaobo/mini-hbut/pull/597) fix(website): update docs reference-index to TS module paths
- [#599](https://github.com/superdaobo/mini-hbut/pull/599) build(deps-dev): bump @emnapi/runtime from 1.11.1 to 1.11.3
- [#600](https://github.com/superdaobo/mini-hbut/pull/600) build(deps-dev): bump material-symbols from 0.45.8 to 0.45.10
- [#601](https://github.com/superdaobo/mini-hbut/pull/601) build(deps-dev): bump fast-check from 4.8.0 to 4.9.0
- [#603](https://github.com/superdaobo/mini-hbut/pull/603) build(deps-dev): bump postcss from 8.5.25 to 8.5.26
- [#604](https://github.com/superdaobo/mini-hbut/pull/604) build(deps): bump github/codeql-action from 4.37.4 to 4.37.6
- [#605](https://github.com/superdaobo/mini-hbut/pull/605) feat: #598 分层精简 PR 门禁——PR Fast Gate + Release Readiness 后置 + Dry Run 收窄 + cargo-audit 缓存
- [#606](https://github.com/superdaobo/mini-hbut/pull/606) fix: #598 push 事件全量验证失效——changes job 始终运行
- [#607](https://github.com/superdaobo/mini-hbut/pull/607) feat: #598 CodeQL 分层——PR 仅 JS/TS，main/schedule/manual 全语言 + CI 分层文档
- [#632](https://github.com/superdaobo/mini-hbut/pull/632) fix(#631): 应用内旧标识 favicon 换新 + Android 通知小图标品牌化
- [#634](https://github.com/superdaobo/mini-hbut/pull/634) fix(#633): 切换学期时清空远程课表，防止无数据学期误展示旧学期课表
- [#635](https://github.com/superdaobo/mini-hbut/pull/635) feat(identity): 公开 OIDC 平台并收口开发者接入文档
- [#638](https://github.com/superdaobo/mini-hbut/pull/638) docs: 同步根 README 与官网（#636）+ fix(website): 下载区抖动与 iOS Safari 崩溃（#637）
- [#639](https://github.com/superdaobo/mini-hbut/pull/639) feat(identity): 「授权记录」页展示本机 id.湖北工业大学.com 授权历史
- [#647](https://github.com/superdaobo/mini-hbut/pull/647) feat: 客户端工作区迁入 apps/client + 全量仓库治理(closes #631 #640-#646)
- [#648](https://github.com/superdaobo/mini-hbut/pull/648) fix(mobile): repair Android JNI and iOS Swift linking
- [#649](https://github.com/superdaobo/mini-hbut/pull/649) build(deps): bump framer-motion from 12.42.2 to 12.43.0 in /website
- [#654](https://github.com/superdaobo/mini-hbut/pull/654) fix(#653): 登录错误消息可读化（[object Object]/英文原文/按钮无提示/无超时）
- [#655](https://github.com/superdaobo/mini-hbut/pull/655) build(deps): bump undici from 5.28.4 to 8.10.0 in /identity-platform
- [#657](https://github.com/superdaobo/mini-hbut/pull/657) fix(#656): 设备密钥 keyring 损坏条目自愈（授权 fail closed）
- [#660](https://github.com/superdaobo/mini-hbut/pull/660) fix(#658): 给分记录查询加超时/中文错误提示与重试（P0 前端）
- [#662](https://github.com/superdaobo/mini-hbut/pull/662) fix(#661): 培养方案详情弹窗居中于视口而非整页内容
- [#663](https://github.com/superdaobo/mini-hbut/pull/663) fix(#659): Session NULL 数据契约 + 传输失败不锁 60s + 登录单飞与在线状态（v1.4.4→当前升级兼容）
- [#665](https://github.com/superdaobo/mini-hbut/pull/665) feat(#664): TestFlight 上传后自动关联出口合规声明（AppEncryptionDeclaration）
- [#666](https://github.com/superdaobo/mini-hbut/pull/666) fix(identity): 重建 web 独立 npm 锁文件，钉死 openid-client@6.8.5
- [#667](https://github.com/superdaobo/mini-hbut/pull/667) chore(website): sitemap 收录 /docs/identity-oidc 开发者文档页
- [#673](https://github.com/superdaobo/mini-hbut/pull/673) fix(#669): 按 target 启用 keyring 平台原生后端，写路径增加重写韧性并细分后端缺失错误
- [#674](https://github.com/superdaobo/mini-hbut/pull/674) feat(#671): 接入 tauri-plugin-log 文件日志，恢复线上可观测性
- [#675](https://github.com/superdaobo/mini-hbut/pull/675) fix(#672): Android 设备身份与云同步主密钥显式降级，替代误导性写入报错
- [#676](https://github.com/superdaobo/mini-hbut/pull/676) fix(#670): keyring 真后端回归护栏——单测硬失败化 + CI 补 Windows/macOS 测试与 feature 断言
- [#678](https://github.com/superdaobo/mini-hbut/pull/678) fix(#677): 设备绑定全自动无感——密钥在但缺本地绑定时静默补绑定
- [#680](https://github.com/superdaobo/mini-hbut/pull/680) feat(#679): 多设备自绑定——同账号新设备凭认证会话直接注册授权，移除第二设备批准门槛
- [#682](https://github.com/superdaobo/mini-hbut/pull/682) fix(#679): 重建 core 独立 npm 锁文件，修复云端构建不可用
- [#684](https://github.com/superdaobo/mini-hbut/pull/684) fix(#681): 装配 appShellRef 修复底部 Tab 页滚动串扰，切页回顶真正生效
- [#685](https://github.com/superdaobo/mini-hbut/pull/685) ci(#683): Dev 测试版自动编号为最新正式版 patch+1 的 beta
- [#691](https://github.com/superdaobo/mini-hbut/pull/691) fix(#690): 登录二维码 canvas 内联兜底样式，外部 CSS 失效时不再溢出裁切
- [#692](https://github.com/superdaobo/mini-hbut/pull/692) feat(#687): 应用详情页重设计——显性编辑入口+通俗化信息架构
- [#693](https://github.com/superdaobo/mini-hbut/pull/693) feat(#688): 账户级 API Key 平台一期——签发/Bearer 认证/account REST/门户管理页
- [#694](https://github.com/superdaobo/mini-hbut/pull/694) docs(#689): website 新增 API 文档站（认证/端点参考/Agent 接入指南）
- [#696](https://github.com/superdaobo/mini-hbut/pull/696) fix(#697): 移除 identity-overlay 每 3 秒的诊断轮询上报，消除运行时日志刷屏
- [#703](https://github.com/superdaobo/mini-hbut/pull/703) feat(#702): 选课中心入口菜单增加测试阶段提示横幅（以教务系统/学习通为准）
- [#707](https://github.com/superdaobo/mini-hbut/pull/707) fix: iOS TestFlight 版本号/build 号留空时从 ASC 自动递增 + 三项后处理全自动化
- [#708](https://github.com/superdaobo/mini-hbut/pull/708) fix(#706): 移除后台检测 per-feature 独立开关，控制面收敛至通知类型开关
- [#709](https://github.com/superdaobo/mini-hbut/pull/709) feat(#698): 本机桥新增只读学业数据端点族与本机令牌门禁
- [#710](https://github.com/superdaobo/mini-hbut/pull/710) feat(#699,#700): 数据域 scope 扩展 + 授权快照机制（加密存储/claims 注入）
- [#711](https://github.com/superdaobo/mini-hbut/pull/711) feat(#699): 中继页新增学习数据 scope 逐项明示清单
- [#712](https://github.com/superdaobo/mini-hbut/pull/712) feat(#699): 授权弹窗学习数据 scope 逐项勾选（含 Core 部分批准能力调查结论）
- [#713](https://github.com/superdaobo/mini-hbut/pull/713) docs(#701): 本地 Agent 接入指南 + 数据共享说明文档
- [#720](https://github.com/superdaobo/mini-hbut/pull/720) fix: 出口合规声明创建体按 Apple 真实 schema 修正
- [#722](https://github.com/superdaobo/mini-hbut/pull/722) fix(#721): dev 构建 keyring 库 DEBUG 日志降噪（level_for 降为 Warn）
- [#723](https://github.com/superdaobo/mini-hbut/pull/723) feat(#715): 新增「学习通通知」独立通知渠道，与学校消息并行检测、来源区分
- [#724](https://github.com/superdaobo/mini-hbut/pull/724) feat(#714): 宽屏适配一期——768 断点地基 + 首页双栏布局（左今日安排/右快捷入口与所有功能）
- [#725](https://github.com/superdaobo/mini-hbut/pull/725) feat(#699,#687): scope 目录扩展学习数据域 + 已上架应用元数据可编辑
- [#726](https://github.com/superdaobo/mini-hbut/pull/726) fix: 出口合规声明仅系统加密表达 + iOS 最低版本升 15.0
- [#727](https://github.com/superdaobo/mini-hbut/pull/727) feat(#716): 校内域名 HTTPS 证书过期可用性改造——业务侧无条件放行 + 启动探测黄字提示
- [#728](https://github.com/superdaobo/mini-hbut/pull/728) fix: 出口合规声明轮询等 APPROVED 后再投递外部组
- [#730](https://github.com/superdaobo/mini-hbut/pull/730) fix(#729): 学校消息页登录方式键缺失时降级 portal，不再误报要求重登
- [#731](https://github.com/superdaobo/mini-hbut/pull/731) fix: build 豁免标记兜底出口合规（声明 CREATED 不会自动审批）
- [#733](https://github.com/superdaobo/mini-hbut/pull/733) feat(#732): 近期消息中电费监控卡片前移至考试与学校消息之间
- [#734](https://github.com/superdaobo/mini-hbut/pull/734) fix(#708): 限流真实访客 IP——小黄云下优先读 CF-Connecting-IP
- [#735](https://github.com/superdaobo/mini-hbut/pull/735) feat(#708): 三敏感写动作接入 Turnstile 人机验证
- [#738](https://github.com/superdaobo/mini-hbut/pull/738) feat(#737): 用电趋势按时间升序排序并支持横向滚动查看全部历史月份
- [#740](https://github.com/superdaobo/mini-hbut/pull/740) fix(#739): 冷启动收到已失效 identity 深链不再全屏阻塞弹「授权失败」
- [#743](https://github.com/superdaobo/mini-hbut/pull/743) fix(#741): 校历解析保留第零周并合并跨月拆行周，学期起始对齐 8/31；#742 周切换动画方向接通
- [#744](https://github.com/superdaobo/mini-hbut/pull/744) fix(#742): 移除无 UI 的学期弹窗/徽章死状态机，恢复课表页滑动与键盘切换周次
- [#745](https://github.com/superdaobo/mini-hbut/pull/745) fix(#745): 开学季自动切换学期——移除 anchor 有课即中止探测的提前收工逻辑

---

## 📋 完整 Issue 列表（版本窗口内关闭，共 99 个）

- [#742](https://github.com/superdaobo/mini-hbut/issues/742) [课表] 周切换交互两缺陷：动画方向未随滑动方向生效 + 横滑偶发不切换
- [#741](https://github.com/superdaobo/mini-hbut/issues/741) [课表/校历] 2026-2027-1 学期起始周次两页不一致：校历显示第一周 9/7，课表缓存为 8/31
- [#739](https://github.com/superdaobo/mini-hbut/issues/739) [Identity] 冷启动重放已失效 minihbut://identity 深链时全屏阻塞弹「授权失败」，应静默降级
- [#737](https://github.com/superdaobo/mini-hbut/issues/737) [电费] 用电趋势月视图无排序保证且不可滚动：2024 年起的全部月份数据挤压展示
- [#736](https://github.com/superdaobo/mini-hbut/issues/736) [通知] 学校消息卡「共 0 条」与学校消息模块 27 条不一致：教务端数据晚到导致的快照时序差
- [#732](https://github.com/superdaobo/mini-hbut/issues/732) [通知] 「近期消息」区块内电费监控卡片移至上课提醒与学校消息之间
- [#729](https://github.com/superdaobo/mini-hbut/issues/729) [学校消息] 已登录用户打开学校消息页误报「缺少登录方式，请重新登录」
- [#721](https://github.com/superdaobo/mini-hbut/issues/721) [日志] dev 构建启动时 keyring 库 DEBUG 日志刷屏：信封主密钥读取无缓存且第三方库日志未降噪
- [#719](https://github.com/superdaobo/mini-hbut/issues/719) [我的] 启动时校内证书状态探测 + 登录状态区黄色提示
- [#718](https://github.com/superdaobo/mini-hbut/issues/718) [移动后台] Android/iOS 原生后台任务同步放行校内域名证书校验
- [#717](https://github.com/superdaobo/mini-hbut/issues/717) [网络] Rust 层统一 TLS 策略：业务客户端无条件接受证书异常，Release 同样生效
- [#715](https://github.com/superdaobo/mini-hbut/issues/715) [通知] 新增「学习通通知」独立渠道：与学校消息形态一致、来源区分、并行检测
- [#714](https://github.com/superdaobo/mini-hbut/issues/714) [首页] 宽屏适配一期：768 断点地基 + 首页双栏布局（左今日安排/右快捷入口与所有功能）
- [#706](https://github.com/superdaobo/mini-hbut/issues/706) [通知] 后台检查三分项开关行为不一致：成绩/学校消息两项前台链路未消费，与通知类型开关语义重合
- [#702](https://github.com/superdaobo/mini-hbut/issues/702) [选课中心] 入口菜单页增加测试阶段提示横幅，声明以教务系统/学习通为准
- [#701](https://github.com/superdaobo/mini-hbut/issues/701) [Docs] 本地 Agent 接入指南 + 数据共享说明文档
- [#700](https://github.com/superdaobo/mini-hbut/issues/700) [Identity] 数据快照机制：授权时加密上传/时效读取/撤回清理
- [#699](https://github.com/superdaobo/mini-hbut/issues/699) [Identity] OIDC 数据域 scope 扩展 + 双端授权明示清单
- [#698](https://github.com/superdaobo/mini-hbut/issues/698) [Local] 本地桥只读学业数据端点 + 本机令牌门禁
- [#690](https://github.com/superdaobo/mini-hbut/issues/690) [Auth] 登录二维码缩放过大显示不全：canvas 内联兜底样式修复
- [#689](https://github.com/superdaobo/mini-hbut/issues/689) [Docs] website 新增「API 文档」页面：认证/端点参考/curl 示例/本地 Agent 接入指南
- [#688](https://github.com/superdaobo/mini-hbut/issues/688) [Identity] 账户级 API Key 平台一期 MVP：签发/Bearer 认证/REST 能力端点/管理页
- [#687](https://github.com/superdaobo/mini-hbut/issues/687) [Developer Platform] 应用详情页重设计：显性编辑入口 + 通俗化信息架构（含 3 个潜在 bug 修复）
- [#683](https://github.com/superdaobo/mini-hbut/issues/683) [CI] Dev 测试版自动编号为「最新正式版 patch+1」的 beta（1.4.7-beta.N）
- [#681](https://github.com/superdaobo/mini-hbut/issues/681) [导航] 底部 Tab 页滚动位置串扰：首页滚到底后切课表被拉到底且无法滚动（切页回顶逻辑因 appShellRef 未装配而空转）
- [#679](https://github.com/superdaobo/mini-hbut/issues/679) [Identity] 多设备自绑定：同账号新设备凭认证会话直接注册授权，移除第二设备批准门槛（409 LINK_REQUIRED）
- [#677](https://github.com/superdaobo/mini-hbut/issues/677) [Identity] 设备绑定全自动无感：「密钥在但缺本地绑定」时静默补绑，替代不可自愈的硬报错
- [#672](https://github.com/superdaobo/mini-hbut/issues/672) [Identity][Android] enrollment 显式降级为「暂不支持」，替代误导性写入报错
- [#671](https://github.com/superdaobo/mini-hbut/issues/671) [Client] 接入 tauri-plugin-log 文件日志，恢复线上可观测性
- [#670](https://github.com/superdaobo/mini-hbut/issues/670) [Identity] keyring 真后端回归护栏：单测硬失败化 + CI 补 Windows/macOS 测试与依赖断言
- [#669](https://github.com/superdaobo/mini-hbut/issues/669) [Identity][P0] 按 target 启用 keyring 平台原生后端并加固写路径
- [#664](https://github.com/superdaobo/mini-hbut/issues/664) [CI/TestFlight] 自动勾选出口合规（AppEncryptionDeclaration 关联），内/外测试组投递保持现有自动化
- [#661](https://github.com/superdaobo/mini-hbut/issues/661) [培养方案] 课程详情弹窗居中于整页内容而非手机屏幕，需下滑才能看到
- [#659](https://github.com/superdaobo/mini-hbut/issues/659) [Bug] 修复 v1.4.4 → v1.4.6 升级后 Session NULL 凭据导致成绩无法查询与登录恢复死循环
- [#656](https://github.com/superdaobo/mini-hbut/issues/656) [Identity] 授权失败：系统安全存储写入校验失败（KeyringWriteMismatch，fail closed）
- [#653](https://github.com/superdaobo/mini-hbut/issues/653) [Auth] 登录界面错误消息显示不正确（[object Object] / 英文原文 / 按钮无提示 / OCR 误导）
- [#645](https://github.com/superdaobo/mini-hbut/issues/645) [Cleanup] 清理 main 生产构建图中的无用代码
- [#644](https://github.com/superdaobo/mini-hbut/issues/644) [Repository] 完善提交保护、CNB 隔离与生成物治理
- [#643](https://github.com/superdaobo/mini-hbut/issues/643) [Integration] 更新官网、文档及跨项目客户端引用
- [#642](https://github.com/superdaobo/mini-hbut/issues/642) [Automation] 适配客户端新目录的 CI、构建与发布链路
- [#641](https://github.com/superdaobo/mini-hbut/issues/641) [Client] 将完整客户端工作区迁移至 apps/client
- [#640](https://github.com/superdaobo/mini-hbut/issues/640) [Architecture] 将客户端工作区迁入 apps/client 并完成仓库治理
- [#637](https://github.com/superdaobo/mini-hbut/issues/637) fix(website): 手机滚动到下载区抖动 + iOS Safari 崩溃（Showcase 高负载 + 下载区高度突变）
- [#636](https://github.com/superdaobo/mini-hbut/issues/636) docs: 同步根 README 与官网（OIDC 平台 + v1.4.6 能力 + 精简发布脚本/Widget 章节）
- [#633](https://github.com/superdaobo/mini-hbut/issues/633) [Bug] 课表工具选择无数据学期时展示上一学期课表并误报「缓存课表」
- [#631](https://github.com/superdaobo/mini-hbut/issues/631) [Bug] iOS 通知栏使用旧图标 + 旧标识 favicon.svg 残留被打包
- [#630](https://github.com/superdaobo/mini-hbut/issues/630) [Identity/Web Handoff] 实现浏览器授权接力、App 唤起与短轮询状态页
- [#629](https://github.com/superdaobo/mini-hbut/issues/629) [Identity/Resources] 后置迁移 HF Forum/Cloud Sync 为 Mini-HBUT Identity Resource Server
- [#628](https://github.com/superdaobo/mini-hbut/issues/628) [Identity/Testing] 建立 OIDC/Tauri/QR/异常流 E2E、Vercel Preview 与 Production 上线/回滚门禁
- [#627](https://github.com/superdaobo/mini-hbut/issues/627) [Identity/QR] 实现跨设备二维码 App Approval，与同设备 Deep Link 共用 AuthRequest
- [#626](https://github.com/superdaobo/mini-hbut/issues/626) [Identity/Security] 完成统一身份平台 Threat Model、Secrets、Replay/CSRF/CORS/CSP、限流与日志脱敏
- [#625](https://github.com/superdaobo/mini-hbut/issues/625) [Identity/Admin] 实现应用审核、敏感 Scope 审批、Suspend/Revoke 与审计后台
- [#624](https://github.com/superdaobo/mini-hbut/issues/624) [Identity/Developer] 实现 developer 域名开发者门户、Client/Redirect/Scope/Secret 生命周期
- [#623](https://github.com/superdaobo/mini-hbut/issues/623) [Identity/App UX] 实现 Mini-HBUT 授权确认 Overlay、登录恢复与设备安全设置
- [#622](https://github.com/superdaobo/mini-hbut/issues/622) [Identity/Device] 建立设备 Enrollment、Ed25519 签名批准、设备关联与撤销
- [#621](https://github.com/superdaobo/mini-hbut/issues/621) [Identity/Tauri] 接入 minihbut://identity、Tauri Deep Link/Single Instance 与授权请求调度
- [#620](https://github.com/superdaobo/mini-hbut/issues/620) [Identity/OIDC] 接入 oidc-provider，完成 Authorization Code + PKCE、Discovery、JWKS 与 UserInfo
- [#619](https://github.com/superdaobo/mini-hbut/issues/619) [Identity/Data] 建立用户/学校身份/设备/Client/AuthRequest 与 oidc-provider Postgres Adapter 数据模型
- [#618](https://github.com/superdaobo/mini-hbut/issues/618) [Identity/Infra] 建立本地私有 Vercel 身份平台、三域名与无 Git 部署基线
- [#617](https://github.com/superdaobo/mini-hbut/issues/617) [Identity] 建立 Mini-HBUT App Approval 统一身份平台与第三方 OIDC 生态
- [#616](https://github.com/superdaobo/mini-hbut/issues/616) [Notifications] 退役 Capacitor BackgroundFetch/ForegroundService 并完成发布回归
- [#615](https://github.com/superdaobo/mini-hbut/issues/615) [Notifications] 扩展考试安排变化与学校消息后台检测
- [#614](https://github.com/superdaobo/mini-hbut/issues/614) [Notifications] Background Event Inbox 与通知去重/Resume 最终一致性
- [#613](https://github.com/superdaobo/mini-hbut/issues/613) [iOS] BGAppRefresh 成绩变化后台检测 MVP
- [#612](https://github.com/superdaobo/mini-hbut/issues/612) [Android] WorkManager 成绩变化后台检测 MVP
- [#611](https://github.com/superdaobo/mini-hbut/issues/611) [Tauri] 建立 tauri-plugin-hbut-background 移动后台插件基础设施
- [#610](https://github.com/superdaobo/mini-hbut/issues/610) [Notifications] 课程/考试提醒改为系统预调度 Local Notification
- [#609](https://github.com/superdaobo/mini-hbut/issues/609) [Notifications] 统一后台检查领域契约与 PlatformBridge 状态模型
- [#608](https://github.com/superdaobo/mini-hbut/issues/608) [Notifications] Tauri Native 纯本地后台检查与系统预调度通知架构
- [#598](https://github.com/superdaobo/mini-hbut/issues/598) [CI] 分层精简 PR 门禁，后置 CodeQL / Release / Dry Run 以缩短合并等待
- [#595](https://github.com/superdaobo/mini-hbut/issues/595) [CI] 统一 Android/iOS 发布构建范围并验证瘦身回归
- [#594](https://github.com/superdaobo/mini-hbut/issues/594) [Rust] 移动端排除未启用业务命令、路由与独占依赖
- [#593](https://github.com/superdaobo/mini-hbut/issues/593) [Bridge] 核对 iOS/Android 本地 HTTP Bridge 的真实依赖与包体成本
- [#592](https://github.com/superdaobo/mini-hbut/issues/592) [Chaoxing] 明确课程中心与自动化/签到能力的移动端发布边界
- [#591](https://github.com/superdaobo/mini-hbut/issues/591) [Frontend] 移动端发布包不再包含隐藏/禁用视图及其独占资源
- [#590](https://github.com/superdaobo/mini-hbut/issues/590) [Mobile Size] 建立 Android/iOS 可归因包体基线与回归检查
- [#589](https://github.com/superdaobo/mini-hbut/issues/589) [Mobile Size] Android/iOS 发布构建按真实能力裁剪并建立包体门禁
- [#587](https://github.com/superdaobo/mini-hbut/issues/587) 会话恢复提示文案误导：网络/DNS 错误被报为「后台自动登录未成功」
- [#586](https://github.com/superdaobo/mini-hbut/issues/586) 修复：课表课程详情弹窗错位 / 会话过期误报循环 / 首页滚动位置闪现
- [#584](https://github.com/superdaobo/mini-hbut/issues/584) [Architecture] 删除兼容层并完成最终验证与发布审查
- [#583](https://github.com/superdaobo/mini-hbut/issues/583) [Frontend] 拆分 Settings、Chaoxing 与其他超限页面
- [#582](https://github.com/superdaobo/mini-hbut/issues/582) [Forum] 拆分 ForumView 上帝页面
- [#581](https://github.com/superdaobo/mini-hbut/issues/581) [Schedule] 拆分 ScheduleView 上帝页面
- [#580](https://github.com/superdaobo/mini-hbut/issues/580) [TypeScript] 移除四个 runtime.js 并完成真实 TypeScript 迁移
- [#579](https://github.com/superdaobo/mini-hbut/issues/579) [Database] 拆分 db.rs 职责并建立仓储边界
- [#578](https://github.com/superdaobo/mini-hbut/issues/578) [Rust] 扩展 Application Service 并统一双传输语义
- [#577](https://github.com/superdaobo/mini-hbut/issues/577) [Rust] 模块化 HTTP Router 与 Handler Transport
- [#576](https://github.com/superdaobo/mini-hbut/issues/576) [Rust] 模块化 Tauri Command Transport
- [#575](https://github.com/superdaobo/mini-hbut/issues/575) [Frontend] 完成 Pinia 生产接入与 AppViewHost 收敛
- [#574](https://github.com/superdaobo/mini-hbut/issues/574) [Frontend] 拆分 App.vue 启动壳层与协调器
- [#573](https://github.com/superdaobo/mini-hbut/issues/573) [Agent] 完成免费 DeepSeek 路由与并发工作区编排
- [#572](https://github.com/superdaobo/mini-hbut/issues/572) [Architecture] 建立行为基线、特征测试与防回退守卫
- [#571](https://github.com/superdaobo/mini-hbut/issues/571) [Architecture] Phase 5：拆除核心上帝文件并完成模块化收敛
- [#566](https://github.com/superdaobo/mini-hbut/issues/566) fix(updater): 开发版被同核心正式版误判为可更新
- [#557](https://github.com/superdaobo/mini-hbut/issues/557) security: 阶段 4E 凭据、Token 与备份加密迁移
- [#556](https://github.com/superdaobo/mini-hbut/issues/556) test: 阶段 4D iOS、Android 与真实账号全链路验证
- [#555](https://github.com/superdaobo/mini-hbut/issues/555) refactor: 阶段 4C 核心 JavaScript 分批迁移 TypeScript
- [#554](https://github.com/superdaobo/mini-hbut/issues/554) architecture: 阶段 4B Rust Application Layer 与 Bridge 锁粒度治理
- [#553](https://github.com/superdaobo/mini-hbut/issues/553) architecture: 阶段 4A AppShell、Pinia 与前端状态单一真相
- [#552](https://github.com/superdaobo/mini-hbut/issues/552) architecture: 阶段 4 大型架构与真机验证路线图