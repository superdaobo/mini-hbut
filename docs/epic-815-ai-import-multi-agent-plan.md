# Epic #815 多子 Agent 并行执行计划（待审批）

> 仓库：`superdaobo/mini-hbut`　|　Epic：[#815](https://github.com/superdaobo/mini-hbut/issues/815)
> 本地工作区：`tauri-app/main-e296c681`（branch `workbuddy/main-e296c681`）
> 文档状态：**Draft — 等待审批，未开始编码**

---

## 一、Epic 概览

**标题**：`[Epic][Schedule] AI 课表结构化导入：外部识别、粘贴解析、预览校验、智能配色与批量写入`

**核心目标**：建立一条稳定的「外部 AI → Mini-HBUT」课表数据转换层。用户把课表截图交给豆包 / ChatGPT / 通义，用 Mini-HBUT 内置提示词生成约定 JSON，再粘贴/文件导入到应用；应用负责容错解析、标准化、合并去重、冲突检测、配色、预览与批量写入。

**V1 硬边界（不可越线）**：

| 边界 | 说明 |
|---|---|
| 不接外部 AI API | V1 不调用豆包 / OpenAI / 通义，不做 API Key |
| 不上传截图 | 图片识别完全在用户自己的外部 AI 侧完成 |
| 不暴露 Debug Bridge | debug endpoint 不得直接接生产 UI |
| AI 不控制语义字段 | `semester` / `id` / `source_id` 一律由应用注入或忽略 |
| 不新增平行存储 | 最终写入现有 custom schedule 数据模型 |
| conflict 是 warning | 不是 hard block；color 缺失/非法不阻断导入 |
| 不改 backup JSON 语义 | 现有备份导入/导出行为必须零回归 |

**当前状态**：Epic 与 7 个子 Issue 均为 `open`，`enhancement` 标签，无 milestone，无 assignee，零评论（除 Epic 自身的子任务总览评论）。

---

## 二、子 Issue 全景

| # | 标题 | 状态 | 声明依赖 | 核心产出 |
|---|---|---|---|---|
| [#816](https://github.com/superdaobo/mini-hbut/issues/816) | 定义 v1 导入协议与容错 Parser | open | 无 | 协议 v1、类型边界、文本清洗、weekday/periods/weeks 解析、diagnostics、parser 单测 |
| [#817](https://github.com/superdaobo/mini-hbut/issues/817) | 课程归一化合并、重复检测与冲突分析 | open | #816 | merge、exact/possible duplicate、batch 内 & vs official/custom 冲突、overlapWeeks |
| [#818](https://github.com/superdaobo/mini-hbut/issues/818) | 智能配色：AI 推荐、均衡兜底与预览手动改色 | open | #816（Related #470） | 单一色板 source、AI color 白名单校验、稳定均衡配色、同名同色、用户 override |
| [#819](https://github.com/superdaobo/mini-hbut/issues/819) | 新增导入入口、AI 提示词与两阶段预览 Dialog | open | #816 / #817 / #818 | Drawer 入口、Dialog、复制提示词、粘贴/文件导入、列表预览、勾选、改色、overlay 门禁 |
| [#820](https://github.com/superdaobo/mini-hbut/issues/820) | 生产级批量写入：复用校验、事务提交与结果汇总 | open | #816（UI 接入 #819） | production batch command/route、事务提交、added/skipped/failed、双 transport 一致 |
| [#821](https://github.com/superdaobo/mini-hbut/issues/821) | 真实课表布局预览与冲突可视化 | open | #817 / #818 / #819 | 列表/课表双预览、临时 overlay 渲染、周次切换、冲突视觉、零临时 DB 写入 |
| [#822](https://github.com/superdaobo/mini-hbut/issues/822) | i18n、回归测试与多端验收收尾 | open | 全部 | zh-CN/en 完整性、集成测试向量 A–F、旧功能回归、Win/Android/iOS smoke、CI 全绿 |

> ⚠️ 这 7 个子 Issue 目前**没有挂成 GitHub 官方 sub-issue**（`sub_issues_summary.total = 0`），只在 Epic 评论中以清单形式列出。如需 Epic 进度条可视化，需手动补挂。

---

## 三、代码锚点核实（本工作区实测结论）

计划不是凭空拆的——以下均已在本工作区实际读取确认。

### 3.1 可直接复用的既有资产（避免重复造轮子）

| 资产 | 位置 | 对哪个子任务有用 |
|---|---|---|
| 课程色板 `courseThemes`（12 个主题，含 `bg/text/border`） | `apps/client/src/features/schedule/constants.ts` | #818 单一色板 source |
| `hashText` / `hexToRgb` / `colorDistance` / `getCircularOffset` / `evaluateThemeCandidate` / `pickBestThemeCandidate` | `.../utils/colors.ts` | #818 均衡配色**已有稳定 hash 与对比度算法** |
| `normalizeWeeks` / `formatWeeksText` | `.../utils/weeks.ts` | #816 weeks 解析 |
| `normalizeCustomCourse` | `.../utils/course.ts` | #816/#820 归一化 |
| `readTextFromFile` / `parseImportedCustomCourse` / `toPortableCustomCourse` | `.../utils/io.ts` | #819 文件导入；#820 持久化 |
| `CourseColorPicker.vue` | `apps/client/src/components/` | #818/#819 复用改色交互 |
| `ScheduleGrid.vue` / `ScheduleWeekPicker.vue` | `.../schedule/components/` | #821 网格预览 + 周次切换 |
| `anyOverlayOpen` / `isAnyOverlayOpen` / keydown gate | `apps/client/src/components/ScheduleView.vue`（L61/L74/L281） | #819/#821 overlay 门禁 |
| `debug_custom_schedule_upsert`（含 `dry_run` / `return_conflicts`）、`build_custom_schedule_conflicts`、`schedule_ranges_overlap`、`weeks_intersection` | `apps/client/src-tauri/src/http_server/routes/schedule.rs` | #817/#820 冲突语义与校验复用 |
| `normalize_custom_weeks` / `custom_course_to_payload` / `add_custom_schedule_course` | `apps/client/src-tauri/src/transport/tauri/schedule.rs` | #820 batch 落库 |
| `/schedule/custom/add` → `schedule_custom_add` | `.../http_server/routes/schedule.rs:1155` | #820 兼容基线 |

### 3.2 必须先冻结的 4 个风险点

| 级别 | 风险 | 说明 | 处置 |
|---|---|---|---|
| 🔴 P0 | **颜色契约断裂** | Epic 协议写 `color: "#72B9FF"`（单 hex），但现有色板 `courseThemes` 是 `{bg,text,border}` 三元组，且 border 为**小写** `#72b9ff`。若直接拿 border 当 canonical，AI 输出大写 hex 会被判非法 → AI 推荐色永远失效 | 主 Agent 在 Wave 0 冻结 canonical = 色板主题的 `border` 值，并明确**大小写归一化**规则 |
| 🔴 P0 | **双 transport 分叉** | batch 能力需同时落在 `http_server/routes/schedule.rs`（本地 bridge）与 `transport/tauri/schedule.rs`（native），Epic #820 要求返回契约一致 | 主 Agent 冻结统一响应结构，E 双端实现并加契约测试 |
| 🟠 P1 | **i18n god-file 无拆分方案** | `zh-CN.ts` / `en.ts` 各 **3154 行**，Epic 说「以 main 最新拆分方案为准」，但仓库当前并不存在该方案 | 主 Agent 做默认假设：D 只新增 `schedule.import.*` 命名空间分区，G 只审计不重排；不阻塞 |
| 🟠 P1 | **`Course = Record<string, any>`** | 类型宽松，AI import 若沿用会继续扩散 `any` | 主 Agent 冻结独立 import 类型，不复用宽 `Course` |

---

## 四、Agent 拓扑与职责边界

采用 **1 主 + 6 子** 结构。主 Agent 不写业务代码，只负责契约、集成与最终验收。

### 4.1 主 Agent（Orchestrator / 契约所有者）

**职责**
1. Wave 0 冻结三份契约：`importTypes.ts`（类型）、canonical 颜色定义、batch 响应结构。
2. 处理跨模块接口，仲裁 A–F 之间的分歧。
3. 每 Wave 结束做集成检查（typecheck / 关键测试 / diff 审查）。
4. 最终 PR 集成与 Epic 验收。

**写入边界**：`importTypes.ts`（独占）、契约文档、集成期冲突解决。

---

### 4.2 子 Agent 职责与文件所有权

> **文件所有权 = 唯一写者原则**。同一文件在任一时刻只允许一个 Agent 写入，这是并行不冲突的前提。

| Agent | 子 Issue | 独占新增文件 | 独占修改文件 | 只读复用 |
|---|---|---|---|---|
| **A** 协议/Parser | #816 | `utils/importParser.ts`、`utils/importParser.spec.ts` | — | `weeks.ts` |
| **B** 合并/去重/冲突 | #817 | `utils/importMerge.ts`、`utils/importConflict.ts`、对应 spec | — | 后端 `build_custom_schedule_conflicts` 语义 |
| **C** 配色 | #818 | `utils/importColors.ts`、对应 spec | `features/schedule/constants.ts`（抽 palette）、`CourseColorPicker.vue`（改读 source） | `utils/colors.ts` |
| **D** UI Dialog | #819 | `ScheduleCourseImportDialog.vue`、`...Input.vue`、`...Preview.vue`、`useScheduleImport.ts`、`utils/importPrompt.ts` | `ScheduleDrawer.vue`、`components/ScheduleView.vue`（仅 wiring） | `CourseColorPicker`、overlay gate |
| **E** 批量持久化 | #820 | Rust batch handler + 前端 adapter | `http_server/routes/schedule.rs`、`transport/tauri/schedule.rs`、axios adapter、`useScheduleImport.ts`（**D 冻结后**） | `normalize_custom_weeks`、`custom_course_to_payload` |
| **F** 网格预览 | #821 | `ScheduleCourseImportGridPreview.vue` + adapter + spec | — | `ScheduleGrid.vue`、`ScheduleWeekPicker.vue` |
| **G** i18n/QA | #822 | 测试 fixture（Case A–F） | `i18n/messages/{zh-CN,en}.ts`（**仅审计，不重排**） | 全部 |

**冲突点与串行化规则**（关键）：

| 共享文件 | 冲突双方 | 规则 |
|---|---|---|
| `useScheduleImport.ts` | D（创建）↔ E（扩展 commit） | **D 先建壳并冻结 commit 调用签名 → E 后接线**，不同时写 |
| `components/ScheduleView.vue` | D（overlay wiring） | 唯一写者 = D；E/F 不得改 |
| `constants.ts` | C（抽 palette） | 唯一写者 = C；A/B/D 只能 import |
| `i18n/messages/*.ts` | D（加 key）↔ G（审计） | 命名空间分区：D 只写 `schedule.import.*`；G 只读审计 |
| `http_server/routes/schedule.rs` | E | 唯一写者 = E；B 只参考其冲突语义，不改 |

---

## 五、依赖关系与协作方式

### 5.1 真实依赖 DAG

```text
                 ┌──────────────────────────────┐
                 │ 主 Agent · Wave 0 契约冻结    │
                 │  importTypes / palette / API  │
                 └───────────────┬──────────────┘
                                 │
                 ┌───────────────▼──────────────┐
                 │ A · #816 Parser（关键路径头） │
                 └───────────────┬──────────────┘
                                 │
        ┌────────────┬───────────┴────────┬──────────────┐
        ▼            ▼                    ▼              ▼
   B · #817      C · #818            E · #820      D · #819(UI 壳)
   合并/冲突      配色                批量持久化     入口 + 输入页
        │            │                    │              │
        └────────────┴──────────┬─────────┘              │
                                ▼                        │
                    D · #819 完整接线 ◄──────────────────┘
                    （预览列表 / 勾选 / 改色 / commit 调用）
                                │
                                ▼
                    F · #821 课表网格预览
                                │
                                ▼
                    G · #822 i18n / 回归 / 多端验收
                                │
                                ▼
                        主 Agent 集成 → 关闭 #815
```

### 5.2 协作机制：契约先行 + Stub 驱动

并行不冲突的核心不是「等」，而是**先把接口冻死**：

1. **Wave 0 由主 Agent 产出 `importTypes.ts`**，包含 `ParsedImportCourse`、`ImportPreviewCourse`、`ImportConflict`、`ImportWarning`、batch 请求/响应类型。
2. **B / C / E / D 全部针对类型编码**，不等待 A 的实现完成；A 只需保证最终实现符合已冻结类型。
3. 每个 Agent 交付时必须附**结构化结果**：结论 / 证据（文件+行号）/ 可执行变更 / 验证命令输出。
4. 主 Agent 在每个 Wave 边界做一次集成校验（`typecheck` + 相关 vitest + diff 审查），冲突就地仲裁。

### 5.3 跨 Agent 接口清单（Wave 0 冻结）

| 接口 | 提供方 | 消费方 | 冻结内容 |
|---|---|---|---|
| `parseAiCourseImport(text, { semester })` | A | D、G | 入参/出参、diagnostics 结构 |
| `mergeImportCourses(courses)` | B | D、F | 返回合并后课程 + info 记录 |
| `detectImportConflicts(courses, existing)` | B | D、F | `ImportConflict[]`（含 overlapWeeks/source） |
| `validateImportColor(value, palette)` / `assignBalancedCourseColors(...)` | C | D、F | 纯函数签名 |
| `POST /v2/schedule/custom/batch-import` | E | D | 请求体字段白名单 + 响应 `{ok, added, skipped, failed, items}` |
| canonical palette | C | A（prompt）、D、F | 色板单一数组 + 大小写归一化规则 |

---

## 六、执行顺序与里程碑

| Wave | 内容 | 并行度 | 出口门禁（Milestone） |
|---|---|---|---|
| **W0 契约冻结** | 主 Agent 产出 `importTypes.ts` + palette canonical + batch API 契约；确定 i18n 命名空间策略 | 串行（前置） | 三份契约文件落地并被 A–F 引用；`typecheck` 通过 |
| **W1 并行开发** | A(#816)、B(#817)、C(#818)、E(#820) 四线并行；D 同时搭 UI 壳 | 4 并行 + 1 壳 | A/B/C/E 各自单测绿；D 壳可打开、可粘贴、走 stub 数据 |
| **W2 UI 接线** | D 完整接线（列表预览、勾选、改色、调 commit）；E 完成 `useScheduleImport.ts` commit 段 | 2 串行（D→E 接线） | 端到端「粘贴→预览→导入」在桌面跑通；backup JSON 回归绿 |
| **W3 网格预览** | F(#821) 叠加 overlay 渲染 + 冲突可视化 + 周次切换 | 1 | 双预览切换正常；零临时 DB 写入；改色/勾选实时联动 |
| **W4 收尾验收** | G(#822)：i18n 完整性、Case A–F fixture、旧功能回归、Win/Android/iOS smoke、全量 CI | 1 | `typecheck` / `vitest` / `vite build` / `cargo test` 全绿；Epic 验收清单逐条勾选 |

**关键路径**：`W0 → A(#816) → B/C/E → D(#819) → F(#821) → G(#822)`。A 是唯一的全局瓶颈，因此 W0 的契约质量直接决定整体速度。

---

## 七、默认假设（无人值守时按此执行，不阻塞）

1. **canonical 颜色** = `courseThemes[i].border`，比较前统一 `toLowerCase()`；AI 提示词只暴露这一组值。
2. **i18n 策略** = 不重排现有 god-file，仅在 `schedule.import.*` 下新增 key，zh-CN / en 同步。
3. **batch 接口路径** = `/v2/schedule/custom/batch-import`（与现有 `/schedule/custom/add` 风格一致），Tauri 侧映射为等价 command。
4. **事务语义** = 默认 atomic；若现有 DB 抽象实现 atomic 成本过高，降级为 controlled partial 并在 PR 说明理由。
5. **#821 归属** = 若 W3 复杂度可控则本轮纳入，否则按 Epic 授权延后为本 Epic 后续子任务。
6. **目标 semester** 只来自 UI 选择，永不接受 payload 覆盖。

---

## 八、验收门禁

对齐 Epic「整体验收标准」，按 Wave 归属拆分：

- **W1**：parser / merge / color 纯函数单测全覆盖；`npm run typecheck` 通过。
- **W2**：粘贴→预览→写入全链路桌面可用；`teacher/room` 缺失不阻断；exact duplicate 默认不写入；conflict 可勾选保留；backup JSON import/export 零回归；Dialog 打开时背景手势/快捷键被 gate。
- **W3**：双预览切换；仅 selected 项叠加；当前预览周过滤正确；改色/勾选实时联动且无第二份状态源；全程零临时 DB 写入。
- **W4**：全部用户可见文案 zh-CN/en 完整；Case A–F 集成向量通过；30–50 条解析无明显卡顿；`typecheck` / `vitest` / `vite build` / `cargo test` 全绿；Windows / Android / iOS 关键交互 smoke 记录留档。

---

## 九、待审批决策点

请重点确认以下 4 项，它们会直接改变计划走向：

1. **并行粒度**：是否接受「W1 四线并行 + 主 Agent 契约仲裁」的拓扑？还是希望更保守的逐 Issue 串行？
2. **颜色契约**：确认 canonical 取 `courseThemes.border` 并做大小写归一化？（替代方案：新建独立单值调色板数组，与现有主题解耦）
3. **#821 是否本轮做**：真实课表网格预览复杂度较高，是纳入本轮还是按 Epic 授权延后？
4. **执行方式**：审批通过后，是直接进入编码（Agent 模式），还是先按仓库 AGENTS 的 goal 模式初始化 `goal-1/{input,plan,tasks}.md` 再推进？

---

*本计划基于 2026-09-11 读取的 Epic 与 7 个子 Issue 原文，以及本工作区实际代码核实结果。审批后即按 Wave 顺序启动。*
