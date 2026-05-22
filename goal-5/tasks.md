# Goal 5 任务清单

> 执行规则：每轮只处理第一个未完成任务。每个任务完成后必须记录：实际改动、验证结果、剩余风险、下一步。每完成三个任务执行一次大型全面检查/debug 循环。

## Task 1：全量读取并建立源码/文档结构索引

- 状态：已完成
- 目标：扫描当前仓库结构，明确 Tauri 应用、前端源码、工具脚本、网站文档模块、扩展模块的位置与职责。
- 输入范围：`src`、`src/components`、`src/utils`、`src/platform`、`src-tauri`、`website/src`、`website/modules-src`、`website/scripts`、根目录配置。
- 输出要求：在任务记录中列出主要目录、关键文件、现有文档页、待覆盖模块清单。
- 验证方式：`rg --files`、目录读取、关键入口文件读取。
- 实际改动：
  - 完成 `goal-5` 第一轮结构索引，未修改业务代码或 website 正文。
  - 扫描并确认根项目配置：`package.json` 定义主应用 `mini-hbut@1.3.6`，脚本覆盖 `dev`、`build`、`build:hot-bundle`、`test`、Tauri、Capacitor 同步与调试桥接；依赖包含 Vue 3、Tauri 2、Capacitor 6、Pinia、FontAwesome、Tauri FS/notification/shell/autostart 等。
  - 扫描并确认前端入口：`src/main.ts` 负责 Vue 挂载、全局 `IOSSelect` 注册、UI 设置、应用设置、字体设置、主题桥接、调试日志、Markdown 运行时、后台通知检查与 Tauri debug bridge 的延迟初始化。
  - 扫描并确认主视图调度入口：`src/App.vue` 通过 `currentView`、`goToView`、`handleNavigate`、`v-if / v-else-if` 视图分发管理首页、课表、校区作息、选课、论坛、个人页、官方页、反馈、配置、设置、导出、更多模块、超星签到、成绩、电费、流水、校园码、通知、空教室、学籍、考试、排名、日历、学业进度、培养方案、AI、校园地图、图书馆、资源共享等页面。
  - 扫描并确认用户界面组件目录：`src/components` 包含核心页面组件、`chaoxing_checkin` 签到子组件、`templates` 业务模板组件、`ui` 基础组件和若干视觉/布局辅助组件。
  - 扫描并确认工具层目录：`src/utils` 覆盖 API/axios 适配、设置、主题、字体、通知中心、后台抓取、热更新、模块中心、更多模块、搜索、论坛缓存/API、Markdown、图片/静态资源缓存、Widget 快照、调试桥、远程配置、更新器、导出/截图、云同步、加密、时间/学期、布局拖拽和多个契约测试。
  - 扫描并确认平台适配层：`src/platform` 包含 `native.ts`、`runtime.ts`、`types.ts`、`notification_actions.ts`，以及 `adapters/web.ts`、`adapters/tauri.ts`、`adapters/capacitor.ts`、`adapters/capacitor_web.ts` 和 Capacitor widget 支持。
  - 扫描并确认 Tauri/Rust 后端结构：`src-tauri/tauri.conf.json` 定义产品名 Mini-HBUT、版本 1.3.6、窗口尺寸、构建命令、前端产物目录和 Windows NSIS 打包；`src-tauri/Cargo.toml` 定义 Rust crate、Tauri/reqwest/tokio/rusqlite/axum/插件依赖与 release 体积优化。
  - 扫描并确认 Rust 业务模块：`src-tauri/src/modules/mod.rs` 导出 `grades`、`schedule`、`exam`、`ranking`、`student_info`、`classroom`、`calendar`、`training_plan`、`course_selection`、`electricity`、`transaction`、`notification`、`ai`、`one_code`、`module_bundle`、`online_learning`、`chaoxing_checkin`、`weather`。
  - 扫描并确认 Rust HTTP 客户端：`src-tauri/src/http_client/mod.rs` 负责统一 `HbutClient`、Cookie Jar、CAS/教务域名、OCR endpoint、AES-CBC 密码加密、会话恢复、电费 token 和重登冷却等公共逻辑。
  - 扫描并确认 Tauri command 注册：`src-tauri/src/lib.rs` 注册登录、验证码/OCR、远程配置、调试桥、模块窗口、资源共享、通知权限、本地通知、会话恢复、成绩/课表/考试/排名/学籍/空教室/培养方案/日历/选课/在线学习/图书馆/电费/流水/校园码/AI/一卡通/Widget/超星签到/天气等命令。
  - 扫描并确认 website 站点：`website/package.json` 定义 React 19 + React Router 7 + Vite 7 + TypeScript + Tailwind + Radix/lucide/three/gsap 站点；`website/src/App.tsx` 现有路由包含首页、发布页、搜索页和 `/docs` 子路由。
  - 扫描并确认现有文档模块：`website/src/layouts/DocsLayout.tsx` 当前侧栏只有“文档总览、使用指南、配置、常见问题、技术原理、更多”；实际 docs 页面还存在 `DevRules.tsx`、`Implementation.tsx`、`Nonebot.tsx`、`TauriApi.tsx`，但当前路由和侧栏未接入这些页面。
  - 扫描并确认扩展模块源码：`website/modules-src` 当前存在 `jump_out_hbut`、`hugongda_escape`、`hecheng_hugongda`、`hbut_memory_match`、`clumsy_bird_hbut`、`hbut_monopoly`、`hbut_2048`、`hbut_miner` 八个模块，其中 manifest 显示 `hugongda_escape` 为 disabled。
  - 扫描并确认脚本入口：根目录 `scripts` 覆盖 dist 边界检查、敏感上传保护、设计 token 检查、热更新包构建、website 模块构建、release manifest、Tauri debug dev、Widget/图标同步、资源共享/热更新/模块桥接测试等；`website/scripts` 覆盖发布链接更新和链接测试。
  - 建立后续待覆盖清单：用户侧至少覆盖首页、登录/会话、成绩、课表、校区作息、选课、论坛、个人/设置、官方/反馈/配置、导出、更多模块、超星签到、教务服务、电费、校园码、通知、空教室、学籍、考试、排名、日历、学业进度、培养方案、AI、地图、图书馆、资源共享、在线学习、扩展小游戏；开发者侧至少覆盖 Vue 入口、视图路由、组件体系、utils 工具层、platform 适配、Tauri commands、Rust modules、HTTP 客户端、数据库、模块打包、热更新、网站文档站、脚本和测试。
- 验证结果：
  - 已执行 `rg --files src`、`rg --files src-tauri`、`rg --files website/src`、`rg --files website/modules-src website/scripts scripts`，确认输入范围可读并形成索引。
  - 已读取 `package.json`、`website/package.json`、`src/main.ts`、`website/src/App.tsx`、`website/src/layouts/DocsLayout.tsx`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/src/modules/mod.rs`、`src-tauri/src/http_client/mod.rs`、`src-tauri/src/lib.rs` 关键片段。
  - 已执行 `rg -n "defineAsyncComponent|currentView|handleNavigate|goToView|@navigate" src\App.vue`，确认前端主视图分发证据。
  - 已执行 `rg -n "tauri::generate_handler!" src-tauri/src/lib.rs` 并读取 handler 列表片段，确认 Tauri command 注册入口。
  - 已执行 `rg --files website/modules-src -g module.json`，确认 8 个扩展模块 manifest 文件。
  - 已执行 `rg -n "Route path=|const links|label:" website/src/App.tsx website/src/layouts/DocsLayout.tsx`，确认现有 docs 路由和导航入口。
- 剩余风险：
  - 本任务是结构级索引，不逐行审计每个组件的业务状态、错误处理和用户文案；这些内容留给 Task 2 和 Task 3。
  - 部分历史 `.md` 旁路说明文件存在编码异常或内容陈旧风险，后续正式文档必须以当前源码为准。
  - website docs 中未接入的 `DevRules`、`Implementation`、`Nonebot`、`TauriApi` 页面需要在 Task 4 判断是否保留、迁移或重新接入。
- 下一步：
  - 执行 Task 2：从 `src/App.vue`、`src/components/*.vue`、首页模块配置和更多模块配置中梳理用户可见功能模块清单，建立用户手册覆盖表。

## Task 2：梳理用户功能模块清单

- 状态：已完成
- 目标：从页面组件和导航入口中提取用户可见功能，建立用户手册覆盖表。
- 输入范围：`src/App.vue`、`src/components/*.vue`、首页模块配置、更多模块配置。
- 输出要求：形成用户侧模块清单，标注入口、用途、主要状态、错误提示与关联文件。
- 验证方式：源码检索用户入口、组件名称、导航事件。
- 实际改动：
- 完成用户侧模块清单审计，本轮只更新 goal 任务记录，未修改业务代码和 website 文档正文。
- 全局导航与状态恢复覆盖：
  - 底部主 Tab：`home` 首页、`schedule` 课表、`forum` 论坛、`notifications` 通知、`me` 我的；入口和渲染分发由 `src/App.vue` 的 `MAIN_TABS`、`currentView`、`handleNavigate`、`goToView` 和模板分支维护。
  - 我的页二级入口：`official`、`feedback`、`config`、`settings`、`export_center`、`more`、`more_module_host`、`more_chaoxing_checkin`；由 `ME_SUB_VIEWS` 与 `HIERARCHICAL_PARENT_VIEW_MAP` 标注父子关系。
  - 功能页返回链路：详情页通过 `previousView`、层级父视图映射与主 Tab 判断回到正确父页面；后续正式文档需要解释“从首页/我的/更多进入模块后返回”的用户预期。
  - 登录态门禁：多数教务、一卡通和个人数据模块要求登录；首页模块元数据中的 `requiresLogin` 与 App 级 `isLoggedIn` 共同控制入口提示和可访问状态。
- 首页与首页功能区覆盖：
  - 首页入口：`home`，组件 `src/components/Dashboard.vue`。
  - 用户用途：展示问候、天气、今日课程、维护提示、公告/搜索、快捷入口、功能分类和可编辑首页布局。
  - 关键状态：今日课程有未登录清空、加载中、加载失败、空课表、课程时间线、已结束课程弱化；天气有缓存、原生天气获取、失败后 fallback；快捷入口和功能 Tab 使用 `localStorage` 保存。
  - 首页分类：教务服务、一码通、资源；快捷入口默认包含成绩、课表、空教室、电费、排名。
  - 关联文件：`src/components/Dashboard.vue`、`src/utils/home_search.js`、`src/utils/home_layout.js`、`src/utils/theme.js`、`src/App.vue`。
- 教务服务模块覆盖：
  - `grades` 成绩查询：入口来自首页模块“成绩查询”和 App 分支 `GradeView`；用于查看成绩、绩点、学分等结果；状态包含加载、查询失败、登录过期、缓存/离线兜底和空结果。关联 `src/components/GradeView.vue`、`src-tauri/src/modules/grades`、`src/utils/cache` 相关逻辑。
  - `schedule` 个人课表：底部 Tab 与快捷入口均可进入；用于查看周课表、课程详情、自定义课程、导入导出、云同步和日历导出；状态包含学期/周次加载、离线缓存提示、导入导出错误、增删改自定义课程反馈。关联 `src/components/ScheduleView.vue`、`src/utils/schedule_*`、`src-tauri/src/modules/schedule`。
  - `qxzkb` 全校课表：入口为首页教务服务“全校课表”；用于按条件查询全校课程；状态包含查询条件加载、结果加载、空结果、离线数据提示和错误提示。关联 `src/components/GlobalScheduleView.vue`。
  - `course_selection` 选课中心：入口为首页教务服务“选课中心”；用于查看选课概览、课程列表、课程详情、已选课程，并执行选课/退课；状态包含概览/列表/详情加载失败、操作 toast、登录失效和空列表。关联 `src/components/CourseSelectionView.vue`、`src-tauri/src/modules/course_selection`。
  - `classroom` 空教室：入口为首页教务服务和默认快捷入口；用于按校区、教学楼、日期/节次查询空教室；状态包含登录要求、会话过期、网络重试、上次结果缓存和无空教室。关联 `src/components/ClassroomView.vue`、`src-tauri/src/modules/classroom`。
  - `exams` 考试安排：入口为首页教务服务“考试安排”；用于查看考试时间、地点、科目和安排；状态包含加载、查询失败、登录过期、空考试安排和缓存提示。关联 `src/components/ExamView.vue`、`src-tauri/src/modules/exam`。
  - `ranking` 绩点排名：入口为首页教务服务和默认快捷入口；用于查看绩点、排名和专业/班级维度结果；状态包含加载、错误、空结果、重新登录和离线数据。关联 `src/components/RankingView.vue`、`src-tauri/src/modules/ranking`。
  - `calendar` 校历：入口为首页教务服务“校历”；用于查看校历、周次和学期信息；状态包含加载、失败、空校历和离线信息。关联 `src/components/CalendarView.vue`、`src-tauri/src/modules/calendar`。
  - `academic` 学业情况：入口为首页教务服务“学业情况”；用于查看学分、课程达成和培养进度；状态包含加载、错误、空数据和离线数据。关联 `src/components/AcademicProgressView.vue`。
  - `training` 培养方案：入口为首页教务服务“培养方案”；用于查看专业培养方案、课程结构和毕业要求；状态包含加载、错误、空结果和离线数据。关联 `src/components/TrainingPlanView.vue`、`src-tauri/src/modules/training_plan`。
- 一码通与校园生活模块覆盖：
  - `campus_code` 校园码：入口为首页“一码通”；用于显示校园码/二维码，支持在线/离线模式、自动刷新和状态检查；状态包含配置加载、二维码生成失败、离线码、刷新失败和权限/会话异常。关联 `src/components/CampusCodeView.vue`、`src-tauri/src/modules/one_code`。
  - `electricity` 电费查询：入口为首页“一码通”和默认快捷入口；用于选择宿舍、查看余额和照明/空调用电；状态包含宿舍数据加载、查询重试、离线缓存、低余额样式、失败提示。关联 `src/components/ElectricityView.vue`、`src-tauri/src/modules/electricity`。
  - `transactions` 交易记录：入口为首页“一码通”；用于查看一卡通流水和按月记录；状态包含首次登录提醒、加载、错误、离线数据、月份空状态。关联 `src/components/TransactionHistory.vue`、`src-tauri/src/modules/transaction`。
- 资源与工具模块覆盖：
  - `library` 图书查询：入口为首页“资源”；用于关键词检索馆藏、筛选结果和查看详情；状态包含搜索空结果、检索错误、详情加载失败、封面缺失。关联 `src/components/LibraryView.vue`、`src-tauri/src/modules/online_learning` 或图书馆相关 command。
  - `campus_map` 校园地图：入口为首页“资源”；用于查看校园地图、缓存地图图片、跳转或复制微信小程序路径；状态包含 7 天缓存、图片失败 fallback、打开失败复制兜底。关联 `src/components/CampusMapView.vue`。
  - `resource_share` 资料分享：入口为首页“资源”；用于浏览远程配置的 WebDAV 资料、目录、文件预览与下载；状态包含远程配置加载、目录读取失败、下载失败、图片/PDF/媒体/Office 预览兜底。关联 `src/components/ResourceShareView.vue`、资源共享 Tauri commands。
  - `ai` 校园助手：入口为首页“资源”，首页元数据标注“暂不可用”；用于本地/远程 AI 会话、流式输出、会话管理和上传校验；状态包含初始化失败、模型/鉴权/网络错误、上传限制、远程失败本地 fallback。关联 `src/components/AiChatView.vue`、`src-tauri/src/modules/ai`。
- 社区与通知模块覆盖：
  - `forum` 论坛：底部 Tab 入口；用于查看帖子、分类、详情、发帖、回复、评分、收藏、个人资料、通知、举报和管理员备份/审核；状态包含登录门禁、列表/详情加载、发帖校验、评分/收藏/回复失败、空列表和管理权限边界。关联 `src/components/ForumView.vue`、`src/utils/forum_*`。
  - `notifications` 通知中心：底部 Tab 入口；用于管理系统通知权限、课程提醒、电费提醒和测试通知；状态包含权限不可用、授权失败、提醒开关、后台任务状态和测试通知结果。关联 `src/components/NotificationView.vue`、`src/platform/notification_actions.ts`、`src-tauri/src/modules/notification`。
- 我的、设置与运营辅助模块覆盖：
  - `me` 我的：底部 Tab 入口；用于展示头像/姓名/学号、登录状态、退出登录、隐私政策、免责声明、赞助、开源协议和功能宫格。关联 `src/components/MeView.vue`。
  - `studentinfo` 个人信息：我的页入口；用于查看学籍/个人信息、当前登录信息和访问记录；状态包含加载、错误、离线信息和 Tab 切换。关联 `src/components/StudentInfoView.vue`、`src-tauri/src/modules/student_info`。
  - `settings` 设置中心：我的页入口；用于主题、字体、后端/远程配置、云同步、日志、测速、通知和实验设置；状态包含保存失败、测速失败、云同步失败、日志导出/复制、通知权限异常。关联 `src/components/SettingsView.vue`、`src/utils/settings.js`、`src/utils/theme.js`、`src/utils/cloud_sync.js`。
  - `export_center` 导出中心：我的页入口；用于导出多模块数据到 JSON 或长图，支持学期筛选和缓存类数据；状态包含模块无数据、导出失败、截图失败、缓存限制提示。关联 `src/components/ExportCenterView.vue`、`src/utils/export_center.js`、`src/utils/export_image.js`。
  - `config` 配置工具：我的页管理员入口，仅 `configAdminIds` 命中时显示；用于远程配置查看/编辑/导出；状态包含管理员权限边界、配置读取失败、保存/导出反馈。关联 `src/components/ConfigEditor.vue`、`src/utils/remote_config.js`。
  - `official` 官方帖子：我的页入口；用于打开官方帖子/站点内容，含 iframe 加载和链接复制。关联 `src/components/OfficialView.vue`。
  - `feedback` 意见反馈：我的页入口；用于打开反馈页面并复制近期错误日志辅助反馈。关联 `src/components/FeedbackView.vue`、日志工具。
  - 检查更新、开源协议、赞助、免责声明/隐私政策：由 `MeView.vue` 和更新器/外部链接工具提供，正式用户文档需要归入“设置与帮助”。
- 更多与扩展模块覆盖：
  - `more` 更多：我的页入口；用于展示模块中心、远程模块目录、缓存状态、兼容性状态、加载失败和缓存兜底。关联 `src/components/MoreView.vue`、`src/utils/module_center.js`、`src/utils/more_modules.js`。
  - `more_module_host` 模块宿主：由更多模块卡片进入；用于 iframe/模块页面渲染、本地桥接、远程/本地 fallback、外部打开；状态包含加载中、空模块、桥接阻断、远程失败、本地缓存失败。关联 `src/components/MoreModuleHostView.vue`。
  - `more_chaoxing_checkin` 超星签到：更多页或特定入口进入；用于超星签到相关流程；正式文档后续需要结合 `src/components/chaoxing_checkin` 子组件细化。关联 `src/components/MoreChaoxingCheckinView.vue`、`src/components/chaoxing_checkin/*`、`src-tauri/src/modules/chaoxing_checkin`。
  - 默认模块中心内置扩展：`hecheng_hugongda` 合成湖工大、`jump_out_hbut` 跳出湖工大、`hbut_2048` 2048 湖工大版、`clumsy_bird_hbut` 笨鸟先飞、`hbut_monopoly` 湖工大富翁、`hbut_miner` 湖工矿工、`hbut_memory_match` 湖工记忆牌；`hugongda_escape` 在 `website/modules-src` 存在但 manifest 禁用，不作为默认用户可见模块。关联 `src/utils/module_center.js`、`website/modules-src/*/module.json`、`website/public/modules/*/catalog.json`。
- 后续用户文档分组建议：
  - “快速开始”：首页、登录、底部导航、搜索、快捷入口、返回行为。
  - “教务服务”：成绩、课表、全校课表、选课、空教室、考试、排名、校历、学业、培养方案。
  - “校园生活”：校园码、电费、交易流水、图书馆、校园地图、资料分享、天气。
  - “社区与消息”：论坛、通知中心、系统提醒、反馈。
  - “我的与设置”：个人信息、设置、导出、更新、隐私、开源协议、赞助。
  - “扩展与小游戏”：更多、模块中心、模块宿主、超星签到、各小游戏和禁用模块说明。
- 验证结果：
- 已执行 `rg -n "defineAsyncComponent|MAIN_TABS|ME_SUB_VIEWS|HIERARCHICAL_PARENT_VIEW_MAP|VIEW_PREFETCHERS|@navigate|currentView ===" src\App.vue`，确认主 Tab、二级视图、层级返回映射和全部 `currentView` 渲染分支。
- 已执行 `rg -n "baseModules|moduleCategories|defaultQuickEntries|HOME_FEATURE_TAB_KEY|QUICK_ENTRY_KEY|search|today|weather|quick" src\components\Dashboard.vue`，确认首页模块元数据、功能分类、快捷入口、搜索、今日课程、天气和本地持久化 key。
- 已执行 `rg -n "studentinfo|official|feedback|settings|export_center|config|more|退出登录|检查更新|开源协议|赞助" src\components\MeView.vue`，确认我的页用户入口、运营辅助入口和管理员配置工具显示条件。
- 已执行 `rg -n "defaultModules|remoteModules|hecheng_hugongda|jump_out_hbut|hbut_2048|clumsy_bird_hbut|hbut_monopoly|hbut_miner|hbut_memory_match|hugongda_escape" src\utils\module_center.js website\modules-src -g module.json -g *.js`，确认默认模块中心扩展、源码模块和禁用模块。
- 已结合上一轮已读取的 `Get-Content src\App.vue`、`Get-Content src\components\Dashboard.vue`、`Get-Content src\components\MeView.vue`、`Get-Content src\utils\module_center.js` 结果，完成入口、用途、状态和关联文件的归档。
- 剩余风险：
- Task 2 是用户可见功能清单，不逐行复核每个组件模板里的全部文案；Task 7、Task 8、Task 9 会按领域继续深挖模块细节。
- 个别底层 Tauri command 与前端组件之间可能存在命名差异，后续开发者模块清单和正式文档落地时需要再次用 `src-tauri/src/lib.rs` 与组件调用点交叉核对。
- `library`、`resource_share`、`ai` 等模块的具体后端 command/远程配置链路需要在 Task 3 和后续专题文档中补充精确实现细节。
- 下一步：
- 执行 Task 3：梳理开发者实现模块清单，重点覆盖 `src/utils`、`src/platform`、`src-tauri`、根脚本、website 脚本和模块市场构建链路。

## Task 3：梳理开发者实现模块清单

- 状态：未完成
- 目标：提取平台适配、数据层、缓存、通知、调试、构建、发布、模块市场等开发者主题。
- 输入范围：`src/utils`、`src/platform`、`scripts`、`src-tauri`、`package.json`、`website/scripts`。
- 输出要求：形成开发者侧主题清单，标注关键文件、设计意图、风险点。
- 验证方式：源码和脚本检索。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Checkpoint A：前三项全面检查/debug

- 状态：未完成
- 目标：确认索引没有漏掉核心目录、用户模块、开发者模块。
- 检查范围：需求偏离、模块遗漏、文件证据、分类合理性。
- 验证方式：对照 `rg --files src website/src website/modules-src scripts` 与任务记录。
- 实际检查：
- 修复记录：
- 剩余风险：
- 下一步：

## Task 4：设计 website 文档信息架构与导航分类

- 状态：未完成
- 目标：基于现有 `DocsLayout` 和 docs 页面设计可扩展文档结构。
- 输入范围：`website/src/layouts/DocsLayout.tsx`、`website/src/pages/docs/*`、`website/src/App.tsx`。
- 输出要求：确定新增分类、路由、页面命名、导航顺序。
- 验证方式：读取现有路由与导航实现。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 5：实现文档导航与分类骨架

- 状态：未完成
- 目标：在 `website` 中新增或调整文档导航，让用户文档和开发者文档分类可访问。
- 输入范围：`website/src/layouts/DocsLayout.tsx`、`website/src/App.tsx`、必要的 docs 页面。
- 输出要求：新增分类入口、页面骨架、路由可访问。
- 验证方式：`cd website && npm run build`。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 6：编写用户总览与快速开始文档

- 状态：未完成
- 目标：面向普通用户写清产品定位、安装入口、首页、登录、常用功能路径。
- 输入范围：用户模块清单、首页源码、登录/设置相关源码。
- 输出要求：新增或扩展用户指南页面。
- 验证方式：文档构建、内容核对。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Checkpoint B：六项后全面检查/debug

- 状态：未完成
- 目标：确认文档骨架、导航、用户快速开始可构建且无明显错链。
- 检查范围：路由、导航、构建、UI/UX、移动端基础可读性。
- 验证方式：`cd website && npm run build`，必要时浏览器检查。
- 实际检查：
- 修复记录：
- 剩余风险：
- 下一步：

## Task 7：编写教务服务全量用户文档

- 状态：未完成
- 目标：覆盖成绩、课表、考试、培养方案、选课、教务维护/缓存等教务功能。
- 输入范围：对应 Vue 组件、utils 中教务相关逻辑。
- 输出要求：教务服务专题文档，包含入口、使用方法、状态说明、异常处理。
- 验证方式：源码证据核对、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 8：编写校园生活与工具类用户文档

- 状态：未完成
- 目标：覆盖电费、图书馆、校园码、地图、资源共享、通知、论坛、反馈等。
- 输入范围：对应 Vue 组件、utils、平台接口。
- 输出要求：校园生活专题文档。
- 验证方式：源码证据核对、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 9：编写扩展模块与小游戏用户文档

- 状态：未完成
- 目标：覆盖更多模块、模块市场、热更新、小游戏与模块资源。
- 输入范围：`website/modules-src`、`website/public/modules`、模块相关 utils 与组件。
- 输出要求：扩展模块专题文档。
- 验证方式：模块 manifest 与源码核对、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Checkpoint C：九项后全面检查/debug

- 状态：未完成
- 目标：确认用户侧主要功能文档覆盖完整。
- 检查范围：用户模块遗漏、描述准确性、导航可达性、构建。
- 验证方式：用户模块清单逐项勾稽。
- 实际检查：
- 修复记录：
- 剩余风险：
- 下一步：

## Task 10：编写开发者架构总览

- 状态：未完成
- 目标：说明前端入口、视图切换、组件组织、状态恢复、平台边界。
- 输入范围：`src/App.vue`、`src/components`、`src/platform`。
- 输出要求：开发者架构页面。
- 验证方式：源码证据核对、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 11：编写数据流、缓存、网络与错误处理文档

- 状态：未完成
- 目标：说明 API 调用、缓存、离线、维护模式、错误提示、敏感信息处理。
- 输入范围：`src/utils`、API/缓存/配置相关文件。
- 输出要求：数据与错误处理专题。
- 验证方式：源码证据核对、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 12：编写平台适配、原生桥接与权限文档

- 状态：未完成
- 目标：说明 Tauri/Capacitor/Web 适配层、通知、文件、插件、权限边界。
- 输入范围：`src/platform`、`src-tauri`、Capacitor/Tauri 相关依赖与配置。
- 输出要求：平台适配专题。
- 验证方式：源码和配置核对、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Checkpoint D：十二项后全面检查/debug

- 状态：未完成
- 目标：确认开发者核心架构文档准确，不误导后续维护。
- 检查范围：架构、数据、安全、权限、构建。
- 验证方式：源码抽样核对、`website` 构建。
- 实际检查：
- 修复记录：
- 剩余风险：
- 下一步：

## Task 13：编写构建、测试、发布与运维文档

- 状态：未完成
- 目标：说明根项目与 website 的脚本、构建产物、发布 manifest、资源边界检查。
- 输入范围：`package.json`、`scripts`、`website/package.json`、`website/scripts`。
- 输出要求：运维与发布专题。
- 验证方式：脚本清单核对、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 14：编写安全、隐私与合规文档

- 状态：未完成
- 目标：面向用户和开发者说明账号、Cookie、本地缓存、权限、网络请求、敏感数据边界。
- 输入范围：登录、Cookie、存储、网络、平台权限相关源码与配置。
- 输出要求：安全隐私专题。
- 验证方式：源码证据核对、敏感词检索、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 15：编写排错、FAQ 与维护手册

- 状态：未完成
- 目标：整合用户常见问题、开发者调试路径、日志与恢复策略。
- 输入范围：现有 FAQ、错误提示、调试脚本、测试文件。
- 输出要求：排错与 FAQ 专题。
- 验证方式：文档构建、错链检查。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Checkpoint E：十五项后全面检查/debug

- 状态：未完成
- 目标：确认用户文档、开发者文档、运维安全排错文档形成闭环。
- 检查范围：需求覆盖、类型检查、构建、文档导航、内容重复、事实错误。
- 验证方式：`cd website && npm run build`，必要时主项目构建。
- 实际检查：
- 修复记录：
- 剩余风险：
- 下一步：

## Task 16：建立源码到文档的引用索引

- 状态：未完成
- 目标：创建文件/模块/脚本索引，方便开发者从文档跳到源码职责。
- 输入范围：前面任务形成的清单与当前源码。
- 输出要求：参考索引页面或章节。
- 验证方式：路径存在性检查、文档构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 17：优化文档页面 UI/UX 与长文可读性

- 状态：未完成
- 目标：让超长文档可读、可扫描、分类清晰，避免导航拥挤。
- 输入范围：`website/src/layouts/DocsLayout.tsx`、docs 页面样式、全局 CSS。
- 输出要求：必要的布局、目录、卡片或分组优化。
- 验证方式：浏览器检查桌面/移动端，`website` 构建。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 18：补充文档内交叉链接与阅读路径

- 状态：未完成
- 目标：用户文档、开发者文档、FAQ、参考索引之间形成互相可达的阅读路径。
- 输入范围：全部 docs 页面。
- 输出要求：交叉链接、推荐阅读顺序、相关模块链接。
- 验证方式：链接检索、构建、浏览器抽查。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Checkpoint F：十八项后全面检查/debug

- 状态：未完成
- 目标：检查文档站体验、导航、链接、构建与覆盖。
- 检查范围：UI/UX、链接、内容结构、移动端、构建。
- 验证方式：`cd website && npm run build`，浏览器抽查。
- 实际检查：
- 修复记录：
- 剩余风险：
- 下一步：

## Task 19：最终覆盖率审计与缺口补文档

- 状态：未完成
- 目标：对照源码模块清单逐项确认是否有文档覆盖，补齐遗漏。
- 输入范围：源码清单、全部 docs 页面。
- 输出要求：缺口清单清零或记录合理不覆盖原因。
- 验证方式：`rg` 对照模块名、页面名、脚本名。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 20：最终构建、浏览器验收与 goal 完成审计

- 状态：未完成
- 目标：完成最大范围 review，确认没有已知高风险问题后标记 goal 完成。
- 输入范围：全部相关变更。
- 输出要求：最终审计记录、验证命令输出摘要、剩余风险说明。
- 验证方式：`npm run build`、`cd website && npm run build`、必要测试、浏览器抽查、git diff 审阅。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：
