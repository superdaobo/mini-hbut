# Epic #833 / #841 QA 验收记录

> 日期：2026-09-18
> QA 分支：`feat-841-qa-final`
> Parent：#833
> Final QA：#841

## 0. 验收口径说明

本地 handoff / task ledger 早期文字仍写有“28 条 V1 / 19 条总验收”，但 **2026-09-18 当前 GitHub #833** 的实际清单已经演进为：

- **24 条 V1 必须完成**
- **23 条整体验收标准**

本记录以当前 GitHub #833 为 canonical source，不静默沿用旧计数。

## 1. T9：i18n + 视觉 + Geometry

### 自动化

- Schedule + i18n 定向：**23 files / 512 tests passed**
- `timeGeometry.spec.ts`：28 passed
- `timelineLayout.spec.ts`：13 passed（含本轮部分越界新回归）
- 三语言 i18n coverage：passed

### 8 组 visual smoke

每组均生成 phone（390×844）与 desktop（1440×1000），共 **16 张截图**，路径：
`docs/parallel-execution/schedule-timeline/visual-smoke/`

| 场景 | 结果 |
|---|---|
| 01 无 Event | 0 Event card / 0 edge；旧课表结构保留 |
| 02 普通 Event 19:00–21:00 | 1 card；修复部分越界误降级 |
| 03 跨 dashed line | 1 card，跨行连续显示 |
| 04 Event + Course overlap | Event 与课程并排/侧挂，不整块覆盖 |
| 05 两 Event overlap | 2 cards，lane 稳定 |
| 06 四 Event overlap | 3 cards + `+1` overflow |
| 07 超短 Event | 1 card，保持可点击最小高度 |
| 08 完全可见区外 | 0 card + 2 edge indicators |

所有 16 张截图：
- `dashedRows = 11`
- `gridOverflowX = 0`
- `bodyOverflowX = 0`
- visual report `problems = []`

## 2. Big Check 3：数据一致性 / Reminder / ICS

### Event 数据一致性

新增 `useScheduleEventData.spec.ts` 7 项：
- [x] 当前周仅 1 次 range 请求
- [x] transport snake_case → domain camelCase
- [x] 快速切周旧响应丢弃
- [x] student_A 慢响应不能污染 student_B
- [x] 登出立即清空并失效在途请求
- [x] 周日期为空立即清空并失效在途请求
- [x] API 失败 / 非法记录不制造假数据

Event/Reminder/ICS 关键链路定向：
**7 files / 156 tests passed**。

Rust `schedule_event` 仓储：
**11/11 passed**，覆盖 create/get、list range、update、delete、多账号隔离、legacy migration、幂等 migration、invalid date/time、payload whitelist。

### Reminder
- [x] create schedule
- [x] update reschedule
- [x] delete cancel
- [x] permission denied 不阻断 CRUD
- [x] restart reconcile 按既有 ledger/expected 架构恢复
- [x] 过去时间不误发
- [x] 账号切换清理旧账号提醒
- [i] 平台限制保持既有降级；共享 cap 仍为 50

### ICS
- [x] week export = course + matching event
- [x] semester export 按正确绝对日期范围
- [x] out-of-range event 排除
- [x] location / note / Unicode escape
- [x] existing Course ICS regression
- [x] 无 semester 时不会把个人日程无边界全量导出

## 3. T10：平台 smoke 的真实记录

| 平台 | 自动化 / 构建证据 | 人工/真机交互 |
|---|---|---|
| Windows | 前端全量、Rust、Grid visual 已通过；本地 `tauri build --bundles nsis` 冷编译在 release 阶段超时、未生成 bundle，因此不计为通过；最终以 GitHub dev build 的 Windows NSIS 为发布门禁 | **Pending**：当前 AgentDock 无桌面 GUI computer-control，不冒充人工点击 |
| Android | safe-area / notification / gesture 相关契约进入全量测试；最终 dev build 将执行 Android 构建 | **Pending**：当前环境无 Android 实机 |
| iOS | iOS safe-area/TestFlight workflow 契约进入全量测试；合并后触发签名 TestFlight 构建上传 | **Pending**：当前 Windows 环境无 iPhone 真机自动化 |

这符合 #841 的要求：**任何未执行真机测试都明确记录，不假称通过**。

## 4. T11：性能与全量门禁

### 性能/复杂度
- [x] `personal_events` 有 `(student_id, date)` 索引
- [x] week swipe 每周 1 个 range request
- [x] lane layout 位于纯函数模块，不在 template 中重复计算
- [x] CRUD 后只刷新必要的当前 range
- [x] reminder 复用既有 bounded reconcile，不在首屏新建第二套阻塞管线

### 本地门禁结果
- `npm run build`：passed
- strict CSP bundle check + contract：passed
- frontend safety / design tokens / architecture guards：passed
- npm CLI / Capacitor tar / post-merge workflow contracts：passed
- dist boundary：passed
- `vue-tsc --noEmit`：passed
- 串行 `npm run test:ci -- --maxWorkers=1`：**210 files / 1885 tests passed**
- 默认并发本地运行：209/210 files、1884/1885 tests，唯一失败为既有 `chaoxing_inbox_channel.spec.ts` 5s 偶发 timeout；该文件单独重跑 **4/4 passed**。最终是否合并以 GitHub PR 默认 CI 为硬门禁。
- `cargo test --lib schedule_event`：**11/11 passed**
- `cargo test --lib`：**358/358 passed**
- command/http registry：**4/4 passed**
- `cargo fmt --all -- --check`：passed
- `cargo clippy --lib`：passed（仅仓库既有 warnings，无 error）

### 非阻塞既有债务
`check_god_files.mjs`：
- en.ts 3283 行
- ja.ts 3281 行
- zh-CN.ts 3283 行

这是仓库既有 i18n 大字典债务；CI 使用的 `check_arch_guards.mjs` 已通过，本 Epic 未扩大该债务。

## 5. 当前 GitHub #833 24 条 V1 必须完成映射

1. [x] 本地个人日程模型 + CRUD：`personal_events` + Rust/HTTP/Tauri adapter
2. [x] date/start/end 真实时间语义
3. [x] Course/Event 统一 Timeline display contract
4. [x] 添加课程 → 添加安排
5. [x] 创建态 `课程 | 日程` segmented control
6. [x] 课程表单保持现有行为
7. [x] Event 标题/日期/开始结束/地点/颜色/提醒/备注
8. [x] Course/Event 双草稿保持
9. [x] 编辑课程类型锁定
10. [x] 编辑日程类型锁定
11. [x] Grid 叠加 Personal Event
12. [x] Event 可跨 dashed line
13. [x] Course/Event overlap 并排/侧挂
14. [x] Event/Event deterministic lane
15. [x] 超短 Event min-height + 真实详情时间
16. [x] Event detail/edit/delete
17. [x] 冲突 warning，不禁止保存
18. [x] Event reminder 接入本地调度
19. [x] edit/delete 与 reminder 同步
20. [x] 周/学期切换按绝对日期过滤
21. [x] 周/学期 ICS 纳入匹配 Event
22. [x] i18n：当前仓库 zh-CN/en/ja key parity
23. [~] Windows/Android/iOS 关键交互：**自动化/构建覆盖完成；实体设备/人工 GUI 见平台矩阵 Pending**
24. [x] 自动化、typecheck、build：本地通过；PR CI 为最终硬门禁

## 6. 当前 GitHub #833 23 条整体验收标准

除“实体设备/人工 GUI 体验”这一项明确保留 Pending 外，其余产品/代码验收均已有自动化或 visual evidence：
- 原课表仍是主视觉，未变成新日历 App；
- 11 节 dashed 结构保留；
- 无 Event 视觉无明显回归；
- 统一“添加安排”入口完成；
- Course/Event 语义独立；
- Event 任意真实时间、跨虚线、重叠 lane、可点击；
- 冲突仅 warning；
- Event 独立本地持久化；
- detail/edit/delete + reminder 生命周期闭环；
- 周/学期日期匹配与 ICS；
- AI import / custom course / JSON backup / color/style 契约无回归；
- i18n 完整；
- typecheck/tests/build/Rust gates 有证据。

## 7. 已知剩余风险

1. Android / iOS 实机手势、软键盘、通知权限、后台恢复仍需实体设备人工验收。
2. Windows 人工 UI 点击 smoke 当前工具环境不可执行；合并后的 dev build 会验证 Windows 原生打包。
3. 通知能力继续受各平台既有限制；没有在本 Epic 扩大平台承诺。
4. Reminder 与已有通知共享 50 条 cap。
5. 三个 i18n 字典 >1000 行为既有 architecture debt。

**代码层判定：可提交最终 PR；合并前必须等待 GitHub CI 全绿。**
