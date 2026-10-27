# Teacher Portal V2 并行执行规划（本地 Worktree + 多 Agent）

> 制定时间：2026-10-09
> 目标 Epic：[#1018](https://github.com/superdaobo/mini-hbut/issues/1018)
> 子任务：#1019(E0) / #1021(E1) / #1022(E2) / #1023(E3) / #1024(E4) / #1025(E5) / #1026(E6) / #1027(E7) / #1028(E8)
> 上游蓝图：`data/plan-teacher-portal-v2.md`（架构决策，本文件只管**怎么并行执行**）
> 接口事实源：`data/teacher-api-recon/00~08`（⚠️ 未入库，本轮必须一并入库，否则子 Issue 缺自包含上下文）

---

## 0. 结论先行：这一小时能交付什么、不能交付什么

**能交付（本轮 60 分钟目标）**

1. **E0 契约层**（#1019）：教师能力矩阵 + 路由门禁 + `features/teacher/**` 业务边界 + Rust 只读调用骨架 + 缓存作用域 + **全部命令/视图/路由预注册为 stub（默认关）**。
2. **E1–E6 只读功能实现**（#1021–#1026）：6 个 Agent 并行填实现，各自独立可测。
3. **E8 集成与本地验收**（#1028）：单点整合 + 本地门禁全绿 + 交叉对抗审查 + 提交 PR。

**不能交付（必须在规划里说清，不要假装做到）**

- **E7（#1027 工作流只读）**：issue 本身写明「非首批、可延期」，本轮**不做**。
- **Android / iOS 真机验证、Release 打包、TestFlight**：本地 60 分钟不可能完成，本轮只做 **Windows/Web 本地路径 + 构建冒烟**，真机项在 PR body 如实标注「未验证」，交用户执行。
- **「全部 8 个 issue 的全部验收 checkbox 打勾」**：不现实。Epic 验收里含「发布构建 + 四端关键路径确认」，本轮只能覆盖其中可在本机机械核查的部分。
- **V1 合并**：见 §2，这是**必须先解决的前置**，且属对外动作，需用户授权。

**为什么这样切**：E0 是硬前置（E1–E6 全部依赖它的类型与注册点），E8 是硬收口。E1–E6 之间**文件不重叠**，是本轮唯一能真正并行的部分。E7 无依赖价值且 issue 允许后置，砍掉换质量。

---

## 1. 关键约束事实（已实测，带证据）

这些事实决定了并行方案怎么设计，不是背景铺垫。

| 事实 | 证据 | 对方案的影响 |
| --- | --- | --- |
| `role_capabilities.js` 64 行，教师白名单仅 8 项 | `src/config/role_capabilities.js:26-35` | 唯一能力事实源，**必须单点独占** |
| `role_capabilities.spec.ts` 的 `ALL_MODULE_IDS`(24) 与 Dashboard 强绑定 | `src/config/role_capabilities.spec.ts:10-35,93` | 改白名单必同时改 spec，属串行点 |
| `Dashboard.vue` **1553 行**，已超 1500 上限 | `node scripts/check_god_files.mjs` 输出 | 首页改造**只能减不能增**；god-file 当前是 `migration` 模式不阻塞 PR Gate，但 `check:release` 会红 |
| `lib.rs` 有 **217 条** `generate_handler` 条目 | `src-tauri/src/lib.rs:439-677` | 所有新命令都要在这里追加 → **最大串行冲突点** |
| `tests/command_baseline.txt` 已落后 6 条（217 vs 211） | `tests/command_registry.rs` | 属**既有漂移**；再加命令会继续漂。E0 顺手机械化重生成 |
| CI 只跑 `cargo test --lib`，**不跑** `tests/` 集成测试 | `.github/workflows/ci.yml:202,248,292` | 基线漂移不阻塞 PR Gate，但本地 `cargo test` 全量会红 |
| `cargo test --lib` = 402 通过，冷启 **69s** | 本机实测 | Rust 验证每轮约 1 分钟，可接受 |
| `node_modules` 仅 **265M**；`src-tauri/target` **15G**；D 盘剩 **32G** | 本机实测 | node_modules 可复制；**target 绝不可 6 份**，必须共享 `CARGO_TARGET_DIR` |
| `check_god_files.mjs` 当前 `mode=migration`，violations=2 但 exit 0 | 本机实测 | 超限不阻塞 PR Gate，但别把 Dashboard 继续撑大 |
| `school_inbox.rs` 教师路径会 POST `updateState` | `src-tauri/src/modules/school_inbox.rs:622-632` | 安全红线，E3 必须断掉 |
| `i18n_coverage.spec.ts` 强制 zh-CN/en/ja **三侧 key 集合完全一致** | `src/utils/i18n_coverage.spec.ts:167-189` | 每批教师文案必须三语同步，是**高频合并冲突点** |
| `origin/main` **不含** V1 提交；V1 分支落后 main 2 个提交 | `git branch -r --contains 8df660ff` 仅命中 `origin/feat/teacher-portal-v1` | 见 §2 基线策略 |

---

## 2. 基线策略（**执行前必须先解决**）

### 现状

- 本地 HEAD = `feat/teacher-portal-v1` @ `8df660ff`（V1 #1013 已实现）。
- PR **#1014 仍 OPEN**，base=main，`mergeable=UNKNOWN`（head 落后 main → 合并会被拒）。
- `origin/main` = `9e63451a`，比 V1 分支多 2 个提交（#1015 / #1017）。
- V2 大量代码**依赖 V1 引入的文件**：`role_capabilities` 教师白名单、`http_client/academic/teacher.rs`、`application/schedule.rs` 分流、`parser::parse_teacher_schedule`。

### 结论

**V2 不能基于 `origin/main` 直接开工**（会引用不存在的 V1 代码，Rust 直接编译失败）。必须二选一：

**方案 A（推荐，需用户授权）**：先合 V1
1. `gh pr update-branch 1014` → 等 `PR Gate` 绿
2. squash 合并 #1014 → main 前进到含 V1
3. V2 全部 worktree 基于新 `origin/main` → **所有 PR base=main，CI 正常触发**
- 代价：5–15 分钟（含 CI），且合并是对外动作，**需用户明确同意**。

**方案 B（不合并 V1 时的退路）**：stacked
1. 建本地基线分支 `feat/teacher-portal-v2-base` = `feat/teacher-portal-v1` merge `origin/main`（消落后）
2. E0 分支基于它；E1–E6 基于 E0 分支
3. PR 全部开 **draft**，base 指向上一层
4. V1 合并后：`gh pr edit <n> --base main` + `gh pr update-branch <n>` 逐个改基
- 代价：**stacked PR base 非 main 时 CI 不触发**（本仓库已知坑），必须靠本地门禁替代，合并前再逐个改 base 重跑。

**规划默认按方案 A 写**（时间表、PR 矩阵均以「V1 已合入 main」为前提）；若用户不授权合 V1，切换方案 B，Wave 0 增加 3 分钟建基线分支，其余不变。

---

## 3. 并行化设计：E0「契约与注册先行 + 全量 stub 化」

这是本方案的核心技巧，用来消灭最大的并行冲突源。

**问题**：`lib.rs`(217 条注册)、`viewRegistry.ts`、`App.vue`(v-if 链)、`app_navigation.ts`、三语字典、`role_capabilities.js` 都是公共文件。6 个 Agent 同时往里加东西 = 6 路冲突。

**解法**：E0 由**唯一整合负责人**一次性完成**全部**注册，且把 E1–E6 的命令/视图/路由**预注册为 stub**：

- Rust：`transport/tauri/teacher.rs` 里预声明 E2/E5/E6/E4 需要的**全部**只读命令（返回 `not_implemented` 或空结构），`lib.rs` 与两个 baseline 文件**一次改到位**。之后 E2/E5/E6 只写自己的实现文件（`teacher/profile.rs`、`teacher/teaching.rs`、`teacher/exams.rs`、`qxzkb.rs`/`calendar.rs` 分流），**再也不碰 lib.rs**。
- 前端：`viewRegistry.ts` + `App.vue` + `app_navigation.ts` 预注册 `teacherprofile` / `teacherteaching` / `teacherexams` / `teachernotifications` 等视图，指向 E0 创建的**占位视图**。之后 E2/E5/E6 只替换自己的视图文件。
- 能力开关：`teacher_feature_catalog.ts` 里每个教师功能带 `enabled` flag，**默认 false**。E0 交付时教师端看到的是「功能建设中」空态，而不是崩溃。E8 只对**已验证通过**的 flag 置 true。
- i18n：E0 冻结 key 前缀约定 `teacher.<domain>.<element>`，并在三语字典**各自文件末尾**追加一个 `// --- teacher v2 ---` 区块；E1–E6 只允许往这个区块内追加（同一区块仍可能冲突，故约定：E0 一次性把 E1–E6 需要的 key **全部预置**，Agent 只改值不改 key）。

**收益**：E1–E6 的写入边界收敛到**互不相交的新文件**，冲突从「公共文件 6 路抢」降到「几乎为零」。

**代价**：E0 变重（约 20–25 分钟）。这是必要的，E0 本来就要求「独立文件边界 + 统一权限门禁」。

---

## 4. 依赖图与时间表

```
                     ┌──────────────────────────────┐
  [0-5m]  基线/Worktree 准备（1 Agent + 主控）
                     └──────────────┬───────────────┘
                                    ▼
                     ┌──────────────────────────────┐
  [5-28m] E0 契约 + 注册 stub 化（Agent-A，串行独占）
                     └──────────────┬───────────────┘
                          ┌─────────┴─────────┬─────────┬─────────┬─────────┐
                          ▼         ▼         ▼         ▼         ▼         ▼
  [28-50m]              E1        E2        E3        E4        E5        E6
                      (B)       (C)       (D)       (E)       (F)       (G)
                    首页      个人资料    通知      教务查询    我的教学    考试监考
                          └─────────┴─────────┴─────────┴─────────┴─────────┘
                                    ▼
                     ┌──────────────────────────────┐
  [50-60m] E8 集成 + 本地门禁 + 交叉审查 + 提 PR（Agent-A 整合负责人）
                     └──────────────────────────────┘
```

| 时段 | 阶段 | 执行者 | 产出 | 超时降级 |
| --- | --- | --- | --- | --- |
| 0–5m | 基线 | 主控 | 7 个 worktree + 分支 + node_modules 复制 + 共享 target | 复制慢则改用 junction |
| 5–28m | **E0** | Agent-A | 契约、门禁、Rust 骨架、全量 stub 注册、契约测试 | 28m 未完成 → 只保留「类型 + 门禁 + Rust stub 注册」，Dashboard 配置抽取推迟 |
| 28–50m | **E1–E6** | Agent-B..G | 6 个独立功能实现 + 各自测试 | 见 §8 降级阶梯 |
| 50–60m | **E8** | Agent-A | 集成 + 门禁 + 审查 + PR | 门禁红 → 关 flag 保底，PR 照提并标注 |

---

## 5. Worktree / 分支 / PR 矩阵

Worktree 放**仓库外**（`D:/Documents/C_learn/成绩查询/wt/`），避免污染主仓库 `git status`。

| Worktree | 分支 | 内容 | PR base（方案 A） |
| --- | --- | --- | --- |
| `wt/tpv2-e0` | `feat/teacher-portal-v2-e0-architecture` | E0 #1019 | `main` |
| `wt/tpv2-e1` | `feat/teacher-portal-v2-e1-home` | E1 #1021 | `main` |
| `wt/tpv2-e2` | `feat/teacher-portal-v2-e2-profile` | E2 #1022 | `main` |
| `wt/tpv2-e3` | `feat/teacher-portal-v2-e3-notifications` | E3 #1023 | `main` |
| `wt/tpv2-e4` | `feat/teacher-portal-v2-e4-academic-query` | E4 #1024 | `main` |
| `wt/tpv2-e5` | `feat/teacher-portal-v2-e5-teaching` | E5 #1025 | `main` |
| `wt/tpv2-e6` | `feat/teacher-portal-v2-e6-exams` | E6 #1026 | `main` |
| `wt/tpv2-e8` | `feat/teacher-portal-v2-integration` | E8 #1028 | `main`（最后提，含 E0–E6 合流） |

**建 worktree 的成本控制（D 盘只剩 32G，target 单个 15G）**

```bash
# node_modules 直接复制（265M，秒级），不要 npm ci（慢 1-3 分钟/个）
cp -r apps/client/node_modules "$WT/apps/client/node_modules"
# Rust 共用一份 target，禁止每个 worktree 各自 15G
export CARGO_TARGET_DIR="D:/Documents/C_learn/成绩查询/tauri-app/apps/client/src-tauri/target"
```

⚠️ 共享 `CARGO_TARGET_DIR` 会让并发 `cargo` 通过文件锁**串行化**（后到的等锁）。这是刻意的取舍：省 90G 磁盘 > 并发度。纯前端 Agent 不受影响。

⚠️ **绝不动主工作树的未提交改动**：`feat/teacher-portal-v1` 有 9 个 `permissions/autogenerated/*` 的 autocrlf 行尾噪音（`git diff` 为空），**禁止 clean / reset / stash 它们**。

---

## 6. 文件所有权与串行锁

**独占（只有 Agent-A / E8 整合负责人可改）**

```
apps/client/src/config/role_capabilities.js          + .spec.ts
apps/client/src/config/teacher_feature_catalog.ts    (新)
apps/client/src/app/viewRegistry.ts
apps/client/src/App.vue
apps/client/src/navigation/app_navigation.ts
apps/client/src/app/coordinators/NavigationCoordinator.ts
apps/client/src/utils/i18n/messages/{zh-CN,en,ja}.ts
apps/client/src-tauri/src/lib.rs
apps/client/src-tauri/src/http_client/academic/mod.rs
apps/client/src-tauri/src/application/mod.rs
apps/client/src-tauri/src/transport/tauri/mod.rs
apps/client/src-tauri/src/http_server/routes/mod.rs
apps/client/src-tauri/src/http_server/mod.rs
apps/client/src-tauri/tests/command_baseline.txt
apps/client/src-tauri/tests/http_route_baseline.txt
```

**各 Agent 独占的写入边界**

| Agent | 独占新增/修改 |
| --- | --- |
| A (E0) | 上表全部 + `features/teacher/{types.ts,api/,utils/,views/*占位*,__tests__/}` + `src-tauri/src/http_client/academic/teacher/` + `application/teacher.rs` + `transport/tauri/teacher.rs` + `http_server/routes/teacher.rs` |
| B (E1) | `components/Dashboard.vue`（**只减不增**）、`templates/views/Dashboard.html`、`features/teacher/composables/useTeacherHome.ts`、`features/teacher/components/TeacherTodayCard.vue` |
| C (E2) | `features/teacher/views/TeacherProfileView.vue`、`composables/useTeacherProfile.ts`、`components/MeView.vue`（仅个人信息入口分流）、`src-tauri/src/http_client/academic/teacher/profile.rs` |
| D (E3) | `features/teacher/views/TeacherNotificationView.vue`、`composables/useTeacherNotifications.ts`、`components/SchoolInboxView.vue`（加只读模式）、`src-tauri/src/modules/school_inbox.rs`（教师禁写）、`utils/notify_center_checks.ts` + `utils/local_reminder_scheduler.ts`（**只加教师作用域分支，不改学生逻辑**） |
| E (E4) | `components/{CalendarView,GlobalScheduleView,ClassroomView}.vue`、`src-tauri/src/http_client/qxzkb.rs`、`src-tauri/src/http_client/academic/calendar.rs` |
| F (E5) | `features/teacher/views/TeacherTeachingView.vue`、`composables/useTeacherTeaching.ts`、`src-tauri/src/http_client/academic/teacher/teaching.rs` |
| G (E6) | `features/teacher/views/TeacherExamsView.vue`、`composables/useTeacherExams.ts`、`src-tauri/src/http_client/academic/teacher/exams.rs` |

**硬规则**

- 除 Agent-A/E8 外，**任何人不得触碰 §6 独占清单**。
- Agent-C 改 `MeView.vue` 只有一处（个人信息入口按角色分流）；Agent-D 改 `SchoolInboxView.vue` 只加教师只读模式；两者都在 E0 已把「教师视图」注册好之后，改的是**行为分支**，不是注册。
- 若某 Agent 发现必须改独占文件 → **停下来在 PR 里写「需要整合负责人处理」**，不要自行修改（这正是 E0 stub 化要避免的情况）。

---

## 7. Agent 任务卡

### Agent-A：E0 契约与注册（#1019）

**交付物**

1. `config/role_capabilities.js`：保留 8 项白名单语义，新增**能力矩阵**与 `isViewAllowedForRole(viewId, role)` 路由级门控；同步 `role_capabilities.spec.ts`。
2. `config/teacher_feature_catalog.ts`（新）：教师首页两分类（**教务系统 / 资源**）+ 每项 `{id, viewId, category, flagKey, enabled:false}` + 教师默认快捷入口。
3. `features/teacher/types.ts`（新）：`TeacherProfile / TeachingTask / TeachingClass / TeacherExam / Invigilation / TeacherNotice / WorkflowItem` + 统一 `TeacherViewModel` + **错误模型**（`empty | unauthorized | expired | errorHtml | timeout | notImplemented`）。
4. `features/teacher/api/teacherApi.ts`（新）：Tauri invoke / bridge 双通道只读适配器。
5. `features/teacher/utils/normalizeTeacherData.ts`（新）：HTML 清洗、日期/字段标准化、**稳定去重键**（禁 `Date.now()`）。
6. `features/teacher/utils/teacher_scope.ts`（新）：缓存/提醒作用域 `teacher:{accountId}:{semester}`。
7. `features/teacher/views/` 5 个占位视图（`TeacherProfileView / TeacherTeachingView / TeacherExamsView / TeacherNotificationView / TeacherWorkflowView`）+ `__tests__/` 脱敏 fixture。
8. Rust：`http_client/academic/teacher/{mod,readonly,profile,teaching,exams}.rs`（`readonly.rs` 存**只读路径 allowlist 常量**）、`application/teacher.rs`、`transport/tauri/teacher.rs`（**全部命令 stub**）、`http_server/routes/teacher.rs`。
9. 全局注册（独占文件一次性改完）：`viewRegistry.ts`、`App.vue`、`app_navigation.ts`、`NavigationCoordinator.ts`（角色门控）、`lib.rs`、各 `mod.rs`、**两个 baseline 文件重生成**。
10. 契约测试（新）：`src/utils/teacher_readonly_allowlist_contract.spec.ts` —— 断言教师所有教务路径**不含写动词**、与 `readonly.rs` allowlist 一致、`school_inbox` 教师路径不含 `updateState`。

**必须自证**

```bash
cd apps/client && npm run typecheck && npx vitest run src/config src/utils/teacher_readonly_allowlist_contract.spec.ts src/utils/i18n_coverage.spec.ts
cd <repo> && cargo fmt --manifest-path apps/client/src-tauri/Cargo.toml --all -- --check \
  && cargo check --manifest-path apps/client/src-tauri/Cargo.toml --lib \
  && cargo test  --manifest-path apps/client/src-tauri/Cargo.toml --lib
```

**验收断言**：教师端 4 Tab 可用；所有教师功能 flag 默认 false 且显示「建设中」；学生端 24 模块零变化；`role_capabilities.spec.ts` 绿。

---

### Agent-B：E1 教师首页（#1021）

**交付**：教师仅「教务系统 / 资源」两分类；教师默认快捷入口；今日**授课**语义（非「去上课」）。
**关键约束**：`Dashboard.vue` 当前 1553 行已超限 —— **改动必须净减少行数**（把模块表/分类表/快捷入口元数据抽到 `teacher_feature_catalog.ts` / `config/dashboard_modules.ts`，由 E0 已预留的接口消费）。
**验收**：教师只显示两分类；今日授课与底部课表同源；切换账号不残留上一教师数据；学生 24 模块分类/文案/布局零回归。

---

### Agent-C：E2 教师个人资料（#1022）

**交付**：`TeacherProfileView` 显示**工号/姓名/教师身份/部门ID**（部门名、职称、邮箱**无真实来源则不显示**）；`MeView.vue` 按角色分流个人信息入口；Rust `teacher/profile.rs` 只读解析。
**红线**：**绝不**调用 `/admin/xsd/xsjbxx/xskp`、`/v2/student_info`、`student_login_access`、宿舍/迎新接口；**绝不**触发教师卡片修改类写接口。
**验收**：教师资料页无「本科生/宿舍/导师」块；学生 `StudentInfoView` 布局与功能完全回归。

---

### Agent-D：E3 教师通知只读（#1023）

**交付**：`TeacherNotificationView`（教务通知 / 教学提醒 / 监考 / 待办，**数据源未具备的标签不出现**）；`SchoolInboxView` 教师只读模式；**教师标记已读仅本地**。
**红线**：① 教师路径**绝不** POST `/admin/system/tzsjx/updateState`；② 教师**不**触发学生成绩/学生考试/宿舍电费检测（不请求 `/v2/quick_fetch` 学生分支）；③ 提醒去重作用域按真实角色隔离。
**验收**：自动化测试证实「UI 与 native 命令两条路径都无法触发 updateState」；HTML 通知无 XSS；学生通知/后台提醒逻辑完整回归。

---

### Agent-E：E4 教务共用查询适配（#1024）

**交付**：`CalendarView` / `GlobalScheduleView` / `ClassroomView` 三套 UI **不复制**，仅在 Rust 侧按真实角色分流：
- 校历：学生 `/admin/xsd/jcsj/xlgl/getData/{学期}` → 教师 `/admin/system/zy/xlgl/getData/{学期}`
- 全校课表：学生 `querylist` → 教师 `queryQxkbPage`
- 空教室：教师 `GET /admin/system/jxzy/jsxx/getZyKjs`（**未知筛选参数先只读核验，不伪造**）
**红线**：教师端不得用学生个人资料接口做筛选前置；**不通过全校查询批量导出可识别学生信息**。
**验收**：四类错误形态（缺参 `ret:-1` / 401 / HTTP 200 错误 HTML / 超时）都有回退状态；三套页面无教师版完整副本。

---

### Agent-F：E5 我的教学（#1025）

**交付**：`TeacherTeachingView` 双标签（教学任务 / 我的教学班）；Rust `teacher/teaching.rs` 只读。
**关键陷阱**：`ajaxListJsJxrw`(6 条) 与 `jsdQueryJxbList`(4 条) **粒度不同，禁止按数组索引拼接**，必须按可靠教学班 ID 关联；`/admin/jsd/xskq/ajaxListJsJxrw` 是**学生考勤模块**，同名不同路径，禁止误用。
**验收**：6 对 4 条不误合并/丢失；HTML 字段清洗；无写型请求；不影响学生课表/选课/自定义日程。

---

### Agent-G：E6 考试与监考（#1026）

**交付**：`TeacherExamsView` 双标签（监考安排 / 教学班考试）；Rust `teacher/exams.rs` 只读；监考数据规范化为本地提醒事件（供 E3 消费）。
**接口**：`ajaxJsjkList`（监考）/ `ajaxJsrkjxbksList`（任课班考试）。
**验收**：不把学生 `ExamView` 改标题冒充；日期/地点/教学班不交叉错配；重复拉取不重复通知；教师提醒与学生考试提醒完全隔离。

---

### Agent-A（E8 收口，#1028）

**交付**：把 E0–E6 合流到 `feat/teacher-portal-v2-integration`；统一语言包；按已验证结果**逐项置 flag=true**；跑完整本地门禁；开 PR。
**验收**：见 §9。

---

## 8. 降级阶梯（超时保底，按顺序砍）

时间不够时，按此顺序牺牲，**保证前面的一定绿**：

1. **第一保底（必须绿）**：E0 + E2 + E5 + E6 —— 全部是新文件，零冲突，成功率最高。
2. **第二保底**：E4（三视图适配器）。
3. **第三**：E1（首页，撞 god file）→ 降级为「能力表 + 分类门控 + 今日授课文案」，**不做 Dashboard 大重构**。
4. **第四**：E3（通知，安全面最大）→ 降级为「门禁 + 断掉 updateState + 教师只读复用 SchoolInboxView」，**不建 TeacherNotificationView**。
5. **兜底**：任一功能验证不过 → **flag 保持 false**，UI 显示「建设中」，PR 照提并如实标注未完成项。**绝不用假数据或未验证接口凑验收。**

---

## 9. 验收方案（四层）

**L1 各 Agent 自证（提交前必跑）**

```bash
# 前端（cwd=apps/client）
npm run typecheck
npx vitest run <自己域的 spec> src/utils/i18n_coverage.spec.ts src/config/role_capabilities.spec.ts
npm run check:architecture          # check_arch_guards + check_god_files
# Rust（cwd=repo root，共享 CARGO_TARGET_DIR）
cargo fmt   --manifest-path apps/client/src-tauri/Cargo.toml --all -- --check
cargo check --manifest-path apps/client/src-tauri/Cargo.toml --lib
cargo test  --manifest-path apps/client/src-tauri/Cargo.toml --lib
```

**L2 交叉对抗审查（每个 Wave-1 产物换一个 Agent 只读复审）**

复审清单（照抄进每个 PR 评论）：

- [ ] 是否调用了学生专属接口（`xskp` / `/v2/student_info` / `/v2/quick_fetch` 学生分支）？
- [ ] 是否存在**任何**写型请求（POST updateState / 审批 / 录分 / 导出 / 打印）？对照 `data/teacher-api-recon/07-write-endpoints-denylist.md`
- [ ] 教师/学生、不同账号、不同学期的缓存与提醒是否可能串号？
- [ ] 通知 HTML 是否清洗？学生名单是否可能被批量导出？
- [ ] 401 / 会话过期 / HTTP 200 错误 HTML / 空列表 / 缺参 是否都有回退态？
- [ ] 学生端对应功能是否零回归（跑学生侧 spec）？
- [ ] 提交的 fixture / 日志是否含身份敏感字段（工号、手机号、Cookie）？

**L3 集成门禁（E8 在 integration worktree 跑，等价 PR Gate）**

```bash
# 前端
npm ci --prefer-offline --no-audit --no-fund
npm run build && node scripts/check_strict_csp_bundle.mjs
npm run test:ci
node scripts/check-frontend-safety.mjs
node scripts/check_arch_guards.mjs
npm run typecheck && npm run typecheck:js-sfc
# Rust
cargo test --lib && cargo fmt --all -- --check && cargo clippy --lib
cargo check --release --lib
```

**L4 安全与多端（如实声明）**

- 只读契约测试：教师全部教务路径匹配 allowlist 且**无写动词**（机械扫描，E0 交付）。
- Windows/Web 本地路径实测；Android/iOS **声明未验证**，写入 PR body 的「未验证项」小节。
- 回滚开关验证：`teacher_feature_catalog` 全 flag 置 false → 教师端回到「仅 V1 登录+课表」，学生端无影响。

---

## 10. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| E0 超时 → Wave 1 全线阻塞 | 中 | 高 | E0 内部再切：28m 硬截止，未完成部分降级（见 §4） |
| 6 路 cargo 并发争抢共享 target 锁 | 高 | 中 | 接受串行化；纯前端 Agent 不跑 cargo |
| 三语字典合并冲突 | 中 | 中 | E0 预置全部 teacher key，Agent 只改值 |
| `Dashboard.vue` 继续膨胀 | 中 | 中 | 硬性要求净减行数；`check_god_files --strict` 验收 |
| 教师接口权限/字段与勘察样本不一致 | 中 | 高 | 一律 fail-closed：拿不到就空态 + flag 关 |
| stacked PR base 非 main → CI 不触发 | 中 | 中 | 方案 A 避免；方案 B 用本地门禁替代 + 合并前改 base |
| D 盘 32G 被 worktree/target 吃满 | 低 | 高 | node_modules 复制而非 npm ci；共享 target；不建第 8 个 worktree |
| 误触学校生产写接口 | 低 | **极高** | 只读 allowlist 契约测试 + 07 denylist 审查 + 无写动词机械扫描 |

---

## 11. 明确不做（写进每个 PR body）

- 不调用任何学校写型/产物型接口（审批、录分、通知写回、排课、导出、打印）。
- 不做 E7 工作流（#1027）—— issue 允许后置，本轮显式延期并保留 issue open。
- 不新建第二个 App、不复制整套 `apps/client`、不新建 `TeacherScheduleView`。
- 不开放未验证教师权限的模块（校园卡 / 学习通 / 校园网 / 游戏积分）。
- 不提交教师工号、手机号、教学班名单、教务 Cookie 原始值到 issue / 日志 / fixture。
- 不清理、不 reset、不 stash 主工作树既有的 9 个 autocrlf 噪音改动。

---

## 12. 需要用户拍板的一件事

**是否授权本轮先合并 V1（PR #1014）？**

- **是（推荐）** → 走方案 A：`gh pr update-branch 1014` → CI 绿 → squash 合并 → V2 全部 PR base=main，CI 正常触发。多花 5–15 分钟。
- **否** → 走方案 B：V2 PR 全部 stacked + draft，本地门禁替代 CI，V1 合并后再逐个改 base 重跑。**PR 提交时间会延后**。

未获授权前，我会按方案 B 建 worktree（不依赖合并结果），但**不会**执行任何 PR 合并动作。
