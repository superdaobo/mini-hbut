# Epic #833 时间画布：多 Agent 并行执行规划与 Gate A 契约冻结

> 主 Agent：WorkBuddy（本会话） · 起始：2026-09-17 · 基点：main `0436256739`（Release v1.4.10）
> 子 Issue：#834 #835 #836 #837 #838 #839 #840 #841

---

## 一、波次与 Agent 分工

```
Wave 1（锁契约，完全并行）
  Agent A  #834 Timeline / Geometry   → wt-834-timeline-geometry  / feat-834-timeline-geometry
  Agent B  #835 Event Persistence     → wt-835-event-persistence  / feat-835-event-persistence
        ── Gate A：契约冻结（本文档第二节）──

Wave 2（契约稳定后并行，峰值 4）
  Agent C  #836 Unified Editor
  Agent D  #837 Grid / Lane
  Agent F  #839 Reminder
  Agent G  #840 ICS Export
        ── Gate B：#836 + #837 基本闭环 ──

Wave 3
  Agent E  #838 Event UX（依赖 C + D）

Wave 4
  QA #841 i18n + 多端 smoke + 全量回归 + Final Review
```

### 写边界（硬约束）

| Agent | 允许写 | 禁止写 |
|---|---|---|
| 主 Agent | `ScheduleView.vue`、契约最终裁决、合并、验收文档 | — |
| A #834 | `features/schedule/utils/{timelineTypes,timeGeometry,timelineAdapters}.ts` + spec | 任何 `.vue`、任何 Rust、`constants.ts`、`layout.ts` |
| B #835 | Rust `migrations.rs` / `repositories/schedule_event.rs` / `repositories/mod.rs` / `http_server/routes/schedule.rs` / `transport/tauri/schedule.rs` / `lib.rs` / 两个契约基线 / `axios_adapter/post.ts` | 任何 `.vue`、`ScheduleGrid.vue` |
| C #836 | Drawer / Add Dialog / Event Form / `useScheduleEditor.ts` / 新建 `useScheduleEvents.ts` | Rust、Grid lane 算法 |
| D #837 | `ScheduleGrid.vue` / 新建 `ScheduleEventCard.vue` / `utils/timelineLayout.ts` + spec | DB / Drawer / AI Import |
| E #838 | 新建 Event detail 组件 + Event composable | `ScheduleView.vue`（交主 Agent） |
| F #839 | 新建 `personal_reminder_*.ts` + 必要 Event hook | Grid / DB schema / Dialog 布局 |
| G #840 | export aggregator / event adapter / `calendar.ts` / Rust ICS 生成 | Grid / Dialog / Reminder 主逻辑 |

---

## 二、Gate A 契约冻结（**后续 Agent 不得自行发明字段**）

### 2.1 `ScheduleEvent` 持久化契约（冻结）

代码位置：`apps/client/src-tauri/src/infrastructure/db/repositories/schedule_event.rs::ScheduleEventRecord`

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | TEXT PK | 应用层生成 `ev{毫秒时间戳}{4 位随机}` |
| `student_id` | TEXT NOT NULL | 多账号隔离；**不出现在前端 canonical payload** |
| `title` | TEXT NOT NULL | trim 后非空 |
| `date` | TEXT NOT NULL | `YYYY-MM-DD`，真实日历日期（含闰年校验） |
| `start_time` | TEXT NOT NULL | `HH:mm`，00:00-23:59 |
| `end_time` | TEXT NOT NULL | `HH:mm`，必须 > `start_time`；V1 不跨日 |
| `location` | TEXT NULL | 空串落 NULL，读回归一为空串 |
| `note` | TEXT NULL | 同上 |
| `color` | TEXT NULL | 同上 |
| `reminder_minutes` | INTEGER NULL | `NULL` = 不提醒；`>= 0` |
| `created_at` | TEXT NOT NULL | `CURRENT_TIMESTAMP` 默认 |
| `updated_at` | TEXT NOT NULL | 同上 |

索引：`idx_personal_events_student_date (student_id, date)`
schema 版本：`ensure_schema_migration(7, "personal_events (student_id, date) local calendar events")`

**前端 canonical payload**（`schedule_event_payload()`，字段白名单，**不含 `student_id`**）：
`id / title / date / start_time / end_time / location / note / color / reminder_minutes / created_at / updated_at`

### 2.2 `ScheduleTimelineItem` 渲染契约（冻结）

代码位置：`apps/client/src/features/schedule/utils/timelineTypes.ts`

```ts
type ScheduleTimelineItem = {
  id: string
  kind: 'course' | 'event'
  dayIndex: number            // 1..7（周一 = 1）
  startMinute: number         // 距 00:00 的分钟数
  endMinute: number
  title: string
  subtitle?: string
  color?: string
  source: 'official' | 'custom-course' | 'personal-event'
  raw: unknown                // 原始记录引用（详情弹窗/调试回溯）
}
```

辅助类型：`ScheduleEdgeState = 'before' | 'inside' | 'after'`、`ScheduleTimePosition { y, edge }`、`ScheduleGridRect { top, height, startEdge, endEdge }`、`ScheduleTimeSlot { p, start, end }`。

### 2.3 `timeGeometry` API 契约（冻结）

代码位置：`apps/client/src/features/schedule/utils/timeGeometry.ts`

```ts
export const MINUTES_PER_DAY = 1440
export const DEFAULT_MAX_GAP_MINUTES = 30

parseClockToMinute(clock: string): number | null
getCourseRealInterval(period: number, djs: number, timeSchedule: ScheduleTimeSlot[])
  : { startMinute: number; endMinute: number } | null
buildScheduleTimeGeometry(timeSchedule: ScheduleTimeSlot[], slotHeight: number,
  options?: { maxGapMinutes?: number }): ScheduleTimeGeometry
timeToGridY(minute: number, geometry: ScheduleTimeGeometry): ScheduleTimePosition
intervalToGridRect(startMinute: number, endMinute: number, geometry: ScheduleTimeGeometry)
  : ScheduleGridRect | null
intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean
getGridTotalHeight(geometry: ScheduleTimeGeometry): number
```

**几何不变量（必须保持）**：
1. 第 i 节开始时间**精确落在第 i 行顶部** `rowTop = (i-1) * slotHeight` → 与 `grid-row: period / span djs` 课程卡视觉对齐；
2. 行内二段切分：`[periodBand_i][gapBand_i]`；`periodBand = rowHeight * p / (p + min(g, maxGapMinutes))`；
3. 课间段用**原始** gap 做线性插值（保证 12:30 / 13:30 可区分且严格单调），压缩进有限 `gapBand`；
4. 可见区外返回 `{ y: 0, edge: 'before' }` / `{ y: totalHeight, edge: 'after' }`，**绝不 NaN / Infinity**；
5. 时间表非法 → `valid: false`，行数 0，所有坐标安全退化为 0。

### 2.4 唯一 overlap 真源（冻结）

```ts
intervalsOverlap(aStart, aEnd, bStart, bEnd) === (aStart < bEnd && bStart < aEnd)
```
半开区间：首尾相接不算重叠。**表单 warning 与 Grid lane 必须共用这一份，禁止第二套实现。**

### 2.5 路由与 command 对应表（冻结）

| HTTP 路径（HTTP Bridge） | Tauri command | 前端虚拟路径（axios adapter） |
|---|---|---|
| `POST /schedule/event/add` | `add_schedule_event` | `/v2/schedule/event/add` |
| `POST /schedule/event/list-range` | `list_schedule_events_range` | `/v2/schedule/event/list-range` |
| `POST /schedule/event/update` | `update_schedule_event` | `/v2/schedule/event/update` |
| `POST /schedule/event/delete` | `delete_schedule_event` | `/v2/schedule/event/delete` |

**请求体字段（snake_case，HTTP 与 Tauri 一致）**
- add / update：`student_id, title, date, start_time, end_time, location?, note?, color?, reminder_minutes?`（update 另需 `event_id`）
- list-range：`student_id, start_date, end_date`（闭区间）
- delete：`student_id, event_id`

**Tauri 参数约定**：add / update 走 DTO `{ req }`（沿用既有范式，规避 clippy `too_many_arguments`）；list-range / delete 走扁平驼峰参数（`studentId` / `startDate` / `endDate` / `eventId`）。

**响应**：`ok(json!({ "success": true, "data": <canonical payload> }))`；delete 返回 `{ success: true, deleted: true }`。
**错误**：校验失败 → `400 / "参数错误"`；未找到 → `400 / "业务错误"`；DB 失败 → `500 / "数据库错误"`。

---

## 三、Gate A 门禁结果

| 项 | wt-834（#834） | wt-835（#835） |
|---|---|---|
| 目标 spec | `timeGeometry.spec.ts` **28/28** | `schedule_event` 单测 **11/11** |
| 全量 vitest（串行） | **1681 passed / 1 failed** → 见下 | 见「门禁补充记录」 |
| `vue-tsc --noEmit` | **0 错误** | **0 错误** |
| `vite build` | 成功 | 成功 |
| `cargo test --lib` | 无 Rust 改动 | **357 passed / 1 failed** → 见下 |
| `command_registry` | 基点即失败（见下） | **2/2 通过** |
| `http_route_registry` | 基点即失败（见下） | **2/2 通过** |
| `cargo fmt --check` | — | **干净** |
| `cargo clippy --lib` | — | 改动文件内 **0 告警** |
| `check-frontend-safety` | PASS | PASS |
| `check-design-tokens` | PASS | PASS |
| `check_arch_guards` | PASS | PASS |
| `check_god_files` | FAIL（既有债务，非 PR 门禁） | FAIL（同） |

> **wt-835 全量 vitest 终值**：**197 文件 / 1654 测试全绿**。
> **wt-834 全量 vitest 终值**：198 文件 / 1682 测试，其中 1 例为 P4（构建后复跑通过），
> 故有效结果 = **198 文件 / 1682 测试全绿**（差值 28 = 新增 `timeGeometry.spec.ts`）。

### 已独立验证的既有问题（**非本次改动引入**）

| # | 问题 | 验证方式 | 证据 | 处置 |
|---|---|---|---|---|
| P1 | `command_registry::handler_matches_baseline` 在**基点即失败** | 在未改任何 Rust 的 wt-834（基点 `0436256739`）运行 | 缺 6 个命令：`list_saved_accounts` / `switch_active_account` / `delete_saved_account` / `probe_school_cert_status` / `identity_core_fetch` / `identity_fetch_auth_history` | Agent B 按 `lib.rs` 顺序机械补齐基线；**根因是 CI 只跑 `cargo test --lib`，未跑 `tests/` 契约测试，导致漂移长期未被发现** |
| P2 | `http_route_registry` 在**基点即失败** | 同上 | 实际 126 条 vs 基线 119 条，多出 7 条：`GET /debug/identity-core-diag`、`GET /local/{grades,profile,timetable}`、`POST /debug/{frontend-eval,identity-intent,keyring-probe}` | 同上；基线补齐至 130（含新增 4 条 event 路由），断言 `119 → 130` |
| P3 | `http_client::auth::login_cooldown_tests::real_reqwest_connect_error_is_classified_as_transport` 失败 | 在基点 wt-834 单独复跑 | 基点同样 `0 passed; 1 failed`；本会话环境 `HTTP_PROXY=http://127.0.0.1:7209` 使 reqwest 走代理 | 环境性，与本改动无关；已登记 |
| P4 | `src/styles/bottom_tab_bar_safe_area.spec.ts` 失败 | wt-834 首轮全量 | 报 `ENOENT ... dist/assets`（worktree 只放了占位 `dist/index.html`） | 跑 `npm run build` 后复跑 **16/16 通过** → worktree 环境性，非回归 |
| P5 | `check_god_files` 失败 | 两个 worktree | `src/utils/i18n/messages/{en,zh-CN}.ts` 各 3226 行 > 1000 上限；`git status` 确认字典**未被本次改动触碰**；`.github/workflows/ci.yml` **未引用 god-files** | 既有债务，非 PR 门禁（仅在 release-readiness 的 `check:release --strict` 生效）；已登记 |
| P6 | `axios_adapter/post.ts` 改动前已 **988 行**（god-file 上限 1000），Agent B 新增 67 行后达 1056 行 → **新引入 1 项 god-file 违规** | `git show HEAD~1:...post.ts \| wc -l` = 988；`check_god_files` 报 3 项违规 | 主 Agent 复核时发现 | **已修复**：按仓库既有惯例（`handleAuthPost` / `handleCampusCodePost` 同款抽取）把 4 个日程分支抽到新模块 `axios_adapter/schedule_event.ts`（82 行），post.ts 回落至 **992 行**；`check_god_files` 违规数回到 **2 项（仅既有 i18n 债务）**，未新增任何 god-file 债务 |

> **P1 / P2 的影响面评估**：两处均为「代码已实现、基线未登记」，Agent B 的补齐是**让契约测试与真实代码重新一致**，不改变任何运行时行为。已在提交信息中如实记录，避免被误读为本 Epic 引入的变更。

---

## 四、默认假设（执行中生效）

1. Worktree 隔离：`D:\Documents\C_learn\成绩查询\wt-<N>-<slug>`，分支名用连字符（带 `/` 建不出来），`node_modules` 用目录联接指向主仓库。
2. 命令全部在 `apps/client` 下执行（仓库根无 `package.json`）；全量 vitest 必须 `--no-file-parallelism`。
3. 新文案同时写 `zh-CN.ts` + `en.ts`（`i18n_coverage.spec.ts` 强制双向 diff 为空）。
4. Android / iOS 无真机时登记为「待用户执行」，**不得标记为已通过**。
5. 提醒平台差异（Windows 桌面不支持预调度、iOS 预调度已知失效）按平台降级并如实记录。
6. 严格守住 Epic「V1 明确不做」清单，任何 Agent 不得扩范围。

---

## 五、门禁补充记录

（随 Wave 推进追加）
