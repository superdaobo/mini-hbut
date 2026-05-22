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

- 状态：未完成
- 目标：从页面组件和导航入口中提取用户可见功能，建立用户手册覆盖表。
- 输入范围：`src/App.vue`、`src/components/*.vue`、首页模块配置、更多模块配置。
- 输出要求：形成用户侧模块清单，标注入口、用途、主要状态、错误提示与关联文件。
- 验证方式：源码检索用户入口、组件名称、导航事件。
- 实际改动：
- 验证结果：
- 剩余风险：
- 下一步：

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
