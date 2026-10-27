# Teacher Portal V2：教师端页面复用、文件拆分与分阶段实施计划

> 状态：规划稿（2026-10-09）；非代码实现。依赖 V1 Issue #1013 的教师 CAS 身份与教师课表能力；本计划只针对后续教师门户 V2。
>
> 依据：本地静态审计 apps/client/src 与 apps/client/src-tauri/src；教师只读勘察 data/teacher-api-recon/00~08；现有 data/plan-teacher-portal-v1.md。勘察返回成功的接口不等于已在全部平台、所有教师权限下验证。

## 0. 核心决策（已按用户认可的方向拟定）

- **推荐混合式拆分：复用四个主页面的现有壳和通用 Vue 组件；教师独有的教学/考试/通知/资料业务另建小型 Vue 文件、composable、TypeScript 适配层与 Rust 子模块。**
- **不创建第二套 Tauri App，不复制整个 apps/client，不重写现有学生端文件。**
- **不把全部教师逻辑堆在 Dashboard.vue、NotificationView.vue、StudentInfoView.vue、parser.rs、http_client/academic/teacher.rs。**
- **不为相同的课程网格、日历、全校课表和空教室重复绘制新页面**；只分流获取与规范化数据。
- 角色是全局会话事实：student/teacher；教师模块默认拒绝，验证后逐项开放，不能仅由隐藏首页图标承担访问控制。
- 教师业务教务接口 V2 默认只读；任何审批、录分、通知已读服务器写回、导出/打印等需独立审查与审批。
- 本文件内标为「拟新增」的文件均为建议命名，尚未创建；已有文件真实路径以本地扫描为准。

## 1. 先回答「老文件上改，还是新建教师文件」

| 情况 | 决策 | 典型模块 |
| --- | --- | --- |
| 画面和使用方法基本一致、接口可按角色切换 | **保留原页面，增角色适配器** | ScheduleView、GlobalScheduleView、ClassroomView、CalendarView |
| 只有首页内容、快捷入口和文案不同 | **保留 Dashboard 壳；抽取数据/配置和教师小卡片** | Dashboard、课程今日安排、模块/快捷入口注册 |
| 展示结构相似、业务含义明显不同 | **新增教师页面，复用通用展示组件** | 教师通知、个人资料、考试与监考 |
| 只有教师才有该业务 | **新建教师专属 Vue 页面 + TS composable + Rust 业务文件** | 我的教学、工作流中心、教学评价结果 |
| 通用应用设置、地图、图书馆、资源共享 | **原样共用，补角色权限与回归验证** | MeView 的设置入口、LibraryView、CampusMapView、ResourceShareView |
| 大文件同时承载学生业务 | **禁止先整文件移动/重写；迁移一次只抽取单一职责** | NotificationView、StudentInfoView、Rust parser.rs |

**复用的是页面骨架、交互和通用数据模型，不是强迫教师调用学生专属教务接口。**

## 2. 首页产品结构

- 底部固定四项：**首页 / 课表 / 通知 / 我的**。
- 教师首页「所有功能」只保留：**教务系统、资源** 两个一级分类；空分类不显示。
- 教务系统 V2 初期：我的教学（教学任务/教学班）、考试与监考（监考/任课班考试）、全校课表、空教室查询、校历、教务通知；工作流中心等验证后再开放。
- 资源初期：图书馆、校园地图、资源共享；塔楼 Go、AI 助手保持受身份/服务有效性控制，无法确认权限时提供清晰降级或暂不显示。
- 校园码、消费记录、电费/教育网缴费、学习通教师课程等不得因「不是成绩模块」而直接自动开放，需单独专项验证。
- 首页今日安排必须沿用现有有效课表与个人日程能力；教师展示「今日授课」和教学班/教室信息，不显示「去上课」式学生行动文案；课表 V1 的 Rust 教师分流不可重复造轮子。

## 3. 建议目录结构（新增文件为规划目标，不代表当前已有）

以下路径均以 apps/client 为根，属于**一个 App 内的教师领域**。

~~~text
src/
  app/
    viewRegistry.ts                  [少量修改：注册教师独有视图]
    coordinators/NavigationCoordinator.ts [少量修改：同源角色/能力门控]
  config/
    role_capabilities.js             [修改：教师、学生可用性与真实路由一致]
    teacher_feature_catalog.ts       [拟新增：教师首页条目、分类、默认快捷入口]
  components/
    Dashboard.vue                    [只改接线和少量文案，不复制]
    ScheduleView.vue                 [维持共用课表]
    NotificationView.vue             [保留既有学生通知业务]
    MeView.vue                       [最少修改：个人信息路由分流]
    StudentInfoView.vue              [保留学生专属数据和表单]
    GlobalScheduleView.vue           [复用展示，加查询适配器]
    ClassroomView.vue                [复用展示，加查询适配器]
    CalendarView.vue                 [复用展示，加查询适配器]
    SchoolInboxView.vue              [复用列表/详情，加教师只读模式]
  features/
    schedule/
      components/                    [复用已有 ScheduleGrid / ScheduleCourseDetail 等]
      composables/useScheduleData.ts [沿用 V1 的 sync_schedule 角色分派，不重写]
    teacher/                         [拟新增教师业务边界]
      types.ts                       [拟新增：明确教师字段与规范化 UI Model]
      api/teacherApi.ts              [拟新增：统一跨平台只读数据访问适配器]
      utils/normalizeTeacherData.ts  [拟新增：HTML 清洗、字段与日期标准化]
      composables/useTeacherHome.ts  [拟新增：首页教学聚合]
      composables/useTeacherTeaching.ts [拟新增：教学任务/教学班]
      composables/useTeacherExams.ts [拟新增：监考/任课班考试]
      composables/useTeacherNotifications.ts [拟新增：教务通知/提醒/待办]
      composables/useTeacherProfile.ts [拟新增：教师个人信息]
      components/TeacherTodayCard.vue [按需要新增：首页特有内容，其他卡片优先复用]
      views/TeacherTeachingView.vue  [拟新增：教学任务 + 教学班双标签]
      views/TeacherExamsView.vue     [拟新增：考试 + 监考双标签]
      views/TeacherNotificationView.vue [拟新增：教师通知容器，不调用学生成绩监控]
      views/TeacherProfileView.vue  [拟新增：教师个人资料]
      views/TeacherWorkflowView.vue [后续拟新增：只读工作流]
      __tests__/                     [拟新增：真实脱敏响应 fixture 与契约测试]
~~~

**关于教师通知的重要决策**：原 NotificationView.vue 现有学生电费/成绩等大量状态，因此第一轮**不在旧文件里面插入几十个 isTeacher 判断**。教师单独建 TeacherNotificationView.vue，外层导航仍是同一个「通知」Tab，并复用可抽出的信息卡片、开关、空状态和加载设计。只有稳定后才考虑抽公共组件，不要求先做大范围学生通知重构。

**关于教师个人资料**：保留原 StudentInfoView.vue 学生业务，新增 TeacherProfileView.vue；MeView.vue 按身份切换「个人信息」目标，教师端禁止直接走学生资料接口。资料字段优先姓名/工号/教师角色/部门ID；部门名、职称、邮箱等在真实只读查询证明前不展示猜测值。

**关于共享课表**：沿用 ScheduleView.vue 和现有 features/schedule/*、Rust application/schedule.rs 的 teacher 分派，教师特有的卡片文字通过可选字段或局部小组件实现；不要新建 TeacherScheduleView.vue。

## 4. Rust「后端」拆分（本项目指 Tauri 本地后端，**不新建云端教师服务器**）

现状：apps/client/src-tauri/src/http_client/academic/teacher.rs 已有教师身份和课表抓取；application/schedule.rs 已按身份分派；parser.rs 已有 parse_teacher_schedule；http_client/academic/mod.rs 注册 teacher 模块。

建议沿用 Rust「teacher.rs 作为薄入口、teacher/ 存各业务文件」的模块组织方式，**不必迁移现有 teacher.rs 位置**：

~~~text
src-tauri/src/
  http_client/
    academic/
      teacher.rs                        [保留现有身份和课表；仅小幅注册子模块]
      teacher/
        teaching.rs                     [拟新增：教学任务 + 教学班只读]
        exams.rs                        [拟新增：教师考试 + 监考只读]
        classroom.rs                    [拟新增：教师空教室/相关查询，只在参数差异显著时]
        calendar.rs                     [拟新增：教师校历，只在后端差异有必要时]
        profile.rs                      [拟新增：教务教师卡片只读解析]
        workflow.rs                     [后续拟新增：我的申请/经办/待办只读]
      schedule.rs                       [保留学生教务课表]
      student_info.rs                   [保留学生资料]
      calendar.rs                       [共享业务可选择角色分流]
    qxzkb.rs                            [复用现有接口入口，按身份分派教师 queryQxkbPage]
  application/
    teacher.rs                          [拟新增：教师业务编排/权限/错误规范化]
    schedule.rs                         [保留已实现的教师课表分派]
    mod.rs                              [最小增量注册]
  transport/tauri/
    teacher.rs                          [拟新增：少量受控只读 invoke commands]
    mod.rs                              [增量注册]
  http_server/routes/
    teacher.rs                          [拟新增：Web/bridge 如确需，授权校验与 Tauri 同源]
    mod.rs                              [增量注册]
  modules/
    school_inbox.rs                     [最小改动：教师禁止写 updateState]
  lib.rs                                [集中集成阶段更新 invoke_handler 注册]
~~~

Rust 模块拆分不是按页面名称复制整份 client，而是按**教师特有的数据语义**划分。现有教师课表已正常分派则不搬迁；teacher.rs 作为入口按需声明子模块，避免一个文件膨胀到数千行。

师生共用的日历/教室/全校课表优先在现有 Rust 方法中依据已验证身份做一次分流，若逻辑显著复杂再放进 teacher/ 子文件，避免两套状态与缓存分叉。

所有教师请求复用 HbutClient 当前 CAS Cookie/身份；禁用原始任意 URL 代理；只开放经过白名单确认的只读路径。授权来自实际会话角色和教务权限，不接受前端单独传 teacher=true 绕过。前端不得直接抓取教师 HTML 或保存教师 Cookie；数据不经 OCR/CDN/HF 第三方处理。

浏览器版通过已有本地 HTTP bridge/服务路由提供同等角色校验，仅在实际需要时加对应 route；不凭空增设生产服务器或开放跨用户云 API。

## 5. 现有文件修改边界（维护学生端稳定）

| 已有文件 | 最多负责什么 | 禁止做什么 |
| --- | --- | --- |
| Dashboard.vue + Dashboard.html | 接入教师分类配置、今日授课数据与局部文案 | 在首页写教务 HTTP 抓取逻辑 |
| config/role_capabilities.js | 权限表与共用判据 | 只隐藏图标却允许教师直接跳学生路由 |
| MeView.vue | 教师个人资料入口、通用设置 | 混入教师 HTML 抓取与学生宿舍字段 |
| StudentInfoView.vue | 保持学生资料能力 | 把教师特有内容堆进其现有数据模型 |
| NotificationView.vue | 保持学生通知 | 教师直接调用学生成绩、电费通知检测 |
| SchoolInboxView.vue + school_inbox.rs | 共用学校消息 UI、角色感知只读保护 | 教师隐式调用 POST /admin/system/tzsjx/updateState |
| ScheduleView.vue + useScheduleData.ts | 共用课表及规范化数据 | 重新发明教师版课表网格 |
| GlobalScheduleView.vue / ClassroomView.vue / CalendarView.vue | 共享展示、查询抽象 | 假设教师和学生请求路径及筛选参数相同 |
| App.vue / app/viewRegistry.ts | 极少量视图注册与 Tab 身份路由 | 继续堆大量教师业务实现 |
| axios_adapter/post.ts | 保持现有 /v2/schedule/query → sync_schedule 映射 | 同时新增未经鉴权的教师远端接口 |
| http_client/academic/teacher.rs | 现有教师课表、身份 + 小型模块入口 | 累加所有教师业务成为新的巨型文件 |

**现状提醒**：Dashboard 与 useScheduleData 都经 axios_adapter/post.ts 的 /v2/schedule/query 映射到 Rust sync_schedule；Rust application/schedule.rs 已做教师分派。V2 要修复的是教师语义、教务接口兼容、独立通知检测和身份作用域，不能误判为要替换整个课表调用栈。

## 6. 教师功能与页面绑定

| 功能 | 页面/组件 | 教师取数与状态 | 接入时序 |
| --- | --- | --- | --- |
| 教师课表/今日授课 | 原 ScheduleView + Dashboard；仅特殊内容分离 TeacherTodayCard | V1 sync_schedule 教师分流 + useTeacherHome | P0 校验 |
| 首页「教务系统」「资源」 | Dashboard + teacher_feature_catalog.ts | 师生能力表与默认快捷入口 | P0 |
| 我的教学 | TeacherTeachingView，复用课程卡/列表 | /admin/jsd/jxrw/ajaxListJsJxrw、/admin/jsd/jsdcjcx/jsdQueryJxbList | P1 |
| 考试与监考 | TeacherExamsView，复用考试卡/日期筛选 | /admin/jsd/kwglJsdJkcx/ajaxJsjkList、/admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList | P1 |
| 空教室 | 原 ClassroomView + Rust 教师适配 | /admin/system/jxzy/jsxx/getZyKjs | P1 |
| 全校课表 | 原 GlobalScheduleView + Rust 教师适配 | /admin/jsd/qxzkb/queryQxkbPage；现有 querylist 不可直接视同 | P1 |
| 校历 | 原 CalendarView + Rust 教师适配 | /admin/system/zy/xlgl/getData/{xnxq}；现有学生路径需保留 | P1 |
| 教务通知 | TeacherNotificationView + SchoolInboxView 的列表详情部件 | /admin/system/tzsjx/ajaxList；详情参数需单独核验 | P0/P1 |
| 教师授课/监考提醒 | TeacherNotificationView + 提醒数据转换器 | 教师课表 + 监考只读结果；新通知去重 scope | P1 |
| 教师资料 | TeacherProfileView，抽取学生信息页的展示原子组件 | 工号、姓名、角色、部门ID；教师卡片 HTML 尚需数据验证 | P0 |
| 只读工作流 | TeacherWorkflowView，复用列表/状态组件 | /admin/activiti/myApply/qryMyApply 等三条已实测 | P2 |
| 考勤、成绩、评教结果 | 独立教师页（将来），不复用学生输入业务 | 具体详情/班级权限或非空样本尚待确认 | P3 |

**业务 IDs 规则**：教学任务样本 6 条、教学班样本 4 条；不能按数组顺序关联，需匹配可信教学班 ID。接口名称相同也可能处于不同路径（考勤模块与教学任务模块）；必须按完整路径定位。

## 7. 先后顺序与独立 Worktree 边界

前置条件：V1 Issue #1013 教师登录、教师课表已稳定并可作为 V2 基线；目前本地 feat/teacher-portal-v1 工作树有未提交插件权限/生成文件，**绝不可在原工作树清理、重置、覆盖**。

**Stage A（必须先串行集成）：角色契约、目录、权限门禁、缓存与提醒作用域**
- 定义 TeacherViewModel、教师默认禁用的能力矩阵、teacher+accountId+semester 作用域。
- 全局路由门禁/深链检查；底部 Tab 保持同一路由用户体验。
- 建立只读 Rust 调用契约及 Web/Tauri 共享错误模型。
- 由唯一整合负责人修改 App.vue、viewRegistry.ts、role_capabilities.js、Rust 模块注册、lib.rs；其他 Agent 不并行改这些文件。

**Stage B（完成 Stage A 后可分 Worktree 并行）：**
- B1 首页分类/快捷入口/今日授课：只负责 Dashboard、首页 catalog、useTeacherHome。
- B2 教师个人资料/我的：只负责 TeacherProfileView、useTeacherProfile、教师资料 Rust 方法和 MeView 的最小入口；公共路由修改交给整合负责人。
- B3 教师通知只读：只负责 TeacherNotificationView、useTeacherNotifications、SchoolInboxView/后端只读拦截；不改学生通知核心语义。
- B4 教务共用查询：只负责 CalendarView、ClassroomView、GlobalScheduleView 及对应教师 Rust 适配。
- B5 教学任务/教学班：只新增 features/teacher 中 teaching 相关文件和 Rust teacher/teaching.rs；不写公共注册。
- B6 监考/考试：只新增 features/teacher 中 exams 相关文件和 Rust teacher/exams.rs；不写公共注册。
- B7 工作流（可延后）：只新增 teacher/workflow.rs / TeacherWorkflowView 及单元测试。

**Stage C（集成串行）：** 统一注册 Vue 视图与 Tauri/HTTP bridge 命令、补全入口门禁/懒加载，解决接口命名冲突、去重键、公共样式；统一语言包由整合负责人合并。

**Stage D（验收/发布）：** Student/Teacher 分别检查 Android/iOS/Windows/Web；无越权、无隐式写入、无旧缓存串号、无学生成绩监控给教师；通过后灰度上线，可通过教师 feature flag 回退。

每个 Agent：只改其分配的目录/文件 → 先跑局部测试 → PR 审查 → 整合负责人合并（依赖顺序）→ 清理工作树。**禁止两个 Agent 同时修改 App.vue、viewRegistry.ts、http_client/*/mod.rs、lib.rs、语言包**。

## 8. 每个 PR 的验收标准（可机械核查）

1. 教师和学生共享首页/课表/通知/我的四 Tab；教师首页仅「教务系统」「资源」，资源类权限有效，无空分类。
2. 学生原有通知/资料/课表功能原样运行；教师通知不请求 /v2/quick_fetch、学生考试与学生电费检查；教师个人资料不请求学生 xskp/student_info。
3. 教师本人课表使用已有 sync_schedule 教师链路，首页「今日授课」与课表数据一致，跨周/单双周/小节聚合无误。
4. 教师 school_inbox_mark_read 不发 updateState 写请求，教师消息仅本地标记已读；HTML 通知标题/详情安全处理。
5. 每个新增教师接口必须有脱敏 fixture、ret/401/HTTP200错误HTML/空列表/缺参/会话过期测试；没有权限则隐藏或给出清晰的拒绝说明。
6. 同工号在不同角色、不同账号与学期之间：通知快照、课程、自定义日程、提醒、云同步隔离；游客/离线旧会话不得冒充教师。
7. 教师新视图懒加载，保留学生正常首次渲染与发布包体积边界；不复制大页面/大范围样式，支持明暗主题与中/英/日国际化。
8. 通过现有项目 typecheck、vitest、cargo test / cargo check（视本地实际可用命令）；记录 Android/iOS/Windows/Web 真机或等价验证；严格的只读网络 allowlist 检测；PR 有安全/数据泄露审查。
9. 功能按 Stage A→B→C→D 灰度，完成后关闭相应 sub-issue；单个失败模块可独立回滚，不影响学生登录/课表。

## 9. 建议 Epic 子任务图谱

E0 [基础架构] 教师业务独立文件边界 + 角色/路由权限 + 缓存作用域。依赖 V1 #1013。
E1 [首页] 教师双分类 + 快捷入口 + 今日授课。依赖 E0。
E2 [个人资料] 教师个人信息与「我的」入口。依赖 E0。
E3 [通知] 教师通知/消息只读与通知源/提醒重构。依赖 E0，监考提醒依赖 E6。
E4 [查询复用] 校历、空教室、全校课表教师数据适配。依赖 E0。
E5 [我的教学] 教学任务与教学班双标签及归一化。依赖 E0。
E6 [考试与监考] 教师考试双标签与数据归一化。依赖 E0。
E7 [工作流] 只读申请/经办/待办。依赖 E0，可推迟。
E8 [集成/测试] 全平台/身份双向回归、权限、文案、性能及文档。依赖 E1～E6；工作流另行验收。

## 10. GitHub Epic 与 Sub-issues（已创建、已关联）

> Epic #1018：https://github.com/superdaobo/mini-hbut/issues/1018
> 前置 V1 #1013：https://github.com/superdaobo/mini-hbut/issues/1013

| 工作包 | Issue | 内容 | 前置 |
| --- | --- | --- | --- |
| E0 | #1019 | 基础架构、教师文件边界、全局权限及缓存作用域 | #1013 |
| E1 | #1021 | 首页双分类、快捷入口、今日授课 | #1019 |
| E2 | #1022 | 教师个人信息、我的页面通用功能 | #1019 |
| E3 | #1023 | 教师通知、只读教务收件箱、本地授课提醒 | #1019；监考提醒依赖 #1026 |
| E4 | #1024 | 校历、全校课表、空教室的教师接口适配 | #1019 |
| E5 | #1025 | 我的教学：教学任务和我的教学班 | #1019 |
| E6 | #1026 | 考试与监考及教师提醒数据源 | #1019 |
| E7 | #1027 | 只读工作流中心（延期可选） | #1019 |
| E8 | #1028 | 最终集成、全平台与双角色回归 | #1021～#1026 |

**发布规则**：各 Issue 的需求及验收独立成立；本文件是本地 Agent 的建议实现蓝图。计划文件未 PR 提交时，远程 Issue 仍有上下文与验收标准。V2 尚未编写业务功能代码。

## 11. 本阶段明示不做

- 不触发学校生产写接口（通知修改、审批、成绩录入、课程排课、导出/打印）。
- 不一次性搬迁全部旧 Vue 文件、不新建第二个教师 App、不调整现有学生数据库表以满足未验证的教师需求。
- 不默认开放校园卡/学习通/校园网/游戏排行等未经教师账号验证的模块。
- 不在未完成 V1 教师身份和课表回归时发布教师端全量功能。
- 不将教师个人工号、手机号、教学班名单、教务 Cookie 原始值提交 GitHub Issue/日志/fixture。
