# Epic #833 最终代码 Review（#841）

> 日期：2026-09-18
> 基线：`main@4d3875f7`；最终 QA 分支：`feat-841-qa-final`
> 范围：只收口 #841，不扩大到 Todo / 月历 / AI 日程 / 云同步等 V1 外需求。

## 结论

本轮 QA 新发现并修复 2 个真实边界问题：

1. **部分越界 Event 被整条降级成 edge indicator**：例如 `19:00-21:00` 在最后一节 20:55 结束时，旧逻辑只看 `endMinute`，导致仍有可见部分的 Event 消失。现在只有整个区间完全落在可见区外才进入 edge indicator；部分越界由 geometry clamp 后继续进入 lane。
2. **Event range 请求在登出 / 周日期中间态存在 stale response 极窄窗口**：`useScheduleEventData` 现在每次加载入口都先递增 request token，并额外校验 `studentId + weekDates` request key，旧账号 / 旧周慢响应不能回填新上下文。

除上述修复外，未发现新的高风险数据一致性、隐私或 migration 问题。

## 10 个 Review 维度 / 13 项检查

### 1. 时间与 overlap 真源
- [x] **无第二套 overlap 算法**：`useScheduleEvents.ts` 与 `timelineLayout.ts` 均复用 #834 的 `timeGeometry.intervalsOverlap`。
- [x] 部分越界修复只改变“完全越界 / 部分越界”的分类，实际重叠仍走同一真源。
- [x] `timelineLayout.spec.ts` 新增跨上边界、跨下边界、跨整个网格的回归用例。

### 2. Editor 单一来源
- [x] **无第二套 Event form**：统一添加安排由 `ScheduleAddArrangementDialog.vue` 复用 `ScheduleEventForm.vue`。
- [x] 编辑态类型锁定与课程/日程草稿隔离已有契约测试覆盖。

### 3. 本地持久化边界
- [x] **Event 未写入 `custom_schedule_courses`**：独立 SQLite 表 `personal_events`。
- [x] migration 明确创建 `idx_personal_events_student_date(student_id, date)`。
- [x] legacy DB、幂等 migration、多 student 隔离、CRUD/范围查询由 Rust 11 项定向测试覆盖。

### 4. 云同步 / 隐私边界
- [x] **未新增 Personal Event 自动云上传路径**；Tauri/HTTP schedule 路由注释和仓储均明确独立本地模型。
- [x] 新增 Event 数据路径没有记录 title / note；QA 搜索未发现这些字段进入 console / Rust 日志。
- [x] Event 核心领域模型保持在 `eventTypes.ts`，transport 边界归一后使用明确类型；未在本轮扩散 `any` 到核心领域类型。

### 5. Grid / dashed line / 可点击性
- [x] 16 张 visual smoke 中每张均保留 **11 条 dashed row**。
- [x] 无 Event 场景保持旧课表结构。
- [x] Event 可跨虚线；课程/Event、Event/Event 重叠 lane 稳定。
- [x] 4 重叠场景为 **3 张可见卡 + `+1`** 聚合。
- [x] `ScheduleEventCard.vue` 恢复 `pointer-events: auto`，事件层本身不吞课程点击；卡片有最小视觉高度。
- [x] phone / desktop visual smoke 均无横向 overflow。

### 6. ScheduleView 复杂度
- [x] 本轮未修改 `ScheduleView.vue`；其职责仍通过 schedule composables/components 分拆。
- [x] Grid lane、Event data race、Editor、Reminder、ICS 均不回流到 `ScheduleView.vue` 新建第二套实现。
- [i] `ScheduleView.vue` 当前约 838 行，是既有规模；本轮没有新增 god-component 回潮。

### 7. Reminder 生命周期
- [x] create / update / delete 均进入已有 reminder reconcile/ledger 管线。
- [x] update 会重调度，delete 会取消；稳定 ID 防 orphan。
- [x] 权限拒绝不阻断 CRUD。
- [x] restart reconcile、账号切换清理、过去时间过滤由 reminder 相关测试覆盖。
- [i] 继续沿用现有平台能力与全局 50 条 cap；未另开提醒管线。

### 8. Range / race / 数据一致性
- [x] 一周只发 **1 个 `list-range`**，不按 7 天逐项请求。
- [x] 快速切周：旧周慢响应不覆盖新周。
- [x] A/B 学生切换：A 慢响应不污染 B。
- [x] 登出 / weekDates 暂为空：立即清空并使在途请求失效。
- [x] API 失败安全退化为空数据，不制造 optimistic 假成功。

### 9. Dark mode / i18n / 回归
- [x] `ScheduleEventCard.vue`、edge indicator、overflow chip 均有 dark mode 规则。
- [x] zh-CN / en / ja 三语言字典 key parity 由 i18n coverage 守卫验证。
- [x] AI 课表导入、自定义课程、#827 Unicode periods、#826 Android safe-area 等既有契约均包含在全量 Vitest。
- [i] `check_god_files.mjs` 仍报告 zh-CN/en/ja 三个大字典各约 3281–3283 行，属于既有 i18n 迁移债务，不是本 Epic 新增，也不在 CI architecture gate 中。

### 10. Rollback / migration / 平台风险
- [x] migration 采用幂等 `CREATE TABLE/INDEX IF NOT EXISTS`；legacy custom courses 保留测试通过。
- [x] Rust full lib tests 在清空代理后通过。
- [x] 两个 command/http registry contract 均通过。
- [ ] Android / iOS **真实设备手势、软键盘、通知权限、后台恢复**：当前 Windows Agent 环境无实体设备，未冒充已测试；留作设备验收。
- [ ] Windows **人工指针/键盘 UI smoke**：当前 AgentDock 没有桌面 GUI computer-control，自动化与原生构建由 PR/dev workflow 验证，人工 UI 交互不冒充已执行。

## 最终判定

代码与自动化层面可进入 PR/CI。没有发现需要阻塞合并的 Epic #833 高风险问题；剩余项均为需要实体设备或人工 GUI 的平台体验验证，并在 QA 验收记录中明确标记为 pending。
