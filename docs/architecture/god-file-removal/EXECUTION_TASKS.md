# mini-hbut 上帝文件拆除执行计划与任务清单

- 状态：待审批草案
- 对应规划：`PRODUCT_PLAN.md`
- 当前阶段：只规划，不创建 GitHub Issue，不修改业务代码
- 计划 GitHub 结构：1 个父 Issue + 13 个子 Issue
- 执行方式：Reasonix 子 Agent 并发实现，主 Agent 负责关键决策、接口冻结、审查和集成

## 1. 总体依赖图

```text
父 Issue：阶段 5｜上帝文件拆除与模块化收敛
│
├─ #A 基线、特征测试与架构守卫
├─ #B Reasonix 子 Agent 与 Worktree 编排
│
├─ Wave 1（可并行）
│  ├─ #C App.vue Bootstrap / Coordinator 拆分
│  ├─ #E Rust Tauri Transport 模块化
│  ├─ #F Rust HTTP Transport 模块化
│  ├─ #H 数据库兼容测试与仓储边界
│  └─ #I runtime.js TypeScript 迁移基线
│
├─ Wave 2（依赖 Wave 1）
│  ├─ #D Pinia 生产接入与 AppViewHost 收敛
│  ├─ #G Application Service 业务收敛
│  ├─ #H 数据库真实拆分
│  └─ #I 四个 runtime.js 完整迁移
│
├─ Wave 3（可按文件并行）
│  ├─ #J ScheduleView 拆分
│  ├─ #K ForumView 拆分
│  └─ #L Settings / Chaoxing / 其他超限文件拆分
│
└─ Wave 4
   └─ #M 删除兼容层、完整验证、文档和发布审查
```

## 2. 主 Agent 决策门

主 Agent 只在以下节点做关键决策：

1. **架构冻结门**：批准目录、接口和依赖方向后，子 Agent 才能写代码。
2. **公共接口变更门**：任何跨 Worktree 类型、Command、HTTP、数据库接口变更必须先由主 Agent批准。
3. **安全与数据门**：凭据、Cookie、Token、密钥、数据库格式、备份恢复的变化必须暂停并单独审查。
4. **集成门**：子 Agent 只提交分支，主 Agent审查 diff、测试和风险后决定合并顺序。
5. **删除旧实现门**：所有兼容层和旧代码的删除只能在新实现完整通过门禁后执行。
6. **发布门**：CI、真机、回滚和安全审查全部满足后，主 Agent才允许结束父 Issue。

## 3. Reasonix 执行约束

### 3.1 模型门禁

实施前必须验证：

```powershell
reasonix doctor --json
reasonix -p --model deepseek-flash "只回复 READY"
```

当前已知状态：Reasonix `v1.18.0` 已安装，默认模型是 `deepseek-flash` → `deepseek-v4-flash`，但诊断显示 `DEEPSEEK_API_KEY` 当前不存在。模型未通过 READY 验证前，不启动任何实现子 Agent。

### 3.2 子 Agent 创建方式

审批后主 Agent会按项目级 Scope 创建 Subagent，例如：

```powershell
reasonix subagent create frontend-app-shell --description "拆分 App.vue 应用壳层" --prompt-file prompts/frontend-app-shell.md --scope project --model deepseek-flash --dir .
```

每个 Agent 的 Prompt 必须包含：

- 目标和非目标。
- 允许修改路径。
- 禁止修改路径。
- 必须先读取的文档和测试。
- 不能改变的接口和用户行为。
- 必须运行的测试。
- 输出报告格式。
- 禁止合并、推送主分支、删除生产数据和修改生产密钥。

### 3.3 Worktree 规则

- 每个写入 Agent 一个独立 Worktree。
- 分支命名：`refactor/god-file-<issue>-<domain>`。
- 集成分支：`refactor/god-file-convergence`。
- 子 Agent 不直接操作 `main`。
- 一个共享入口文件同一时间只能有一个写入所有者。
- 测试 Agent 只写测试和守卫，不改业务实现。
- Review 和 Security Review Agent 只读。

## 4. 父 Issue

### 标题

`Phase 5: 拆除核心上帝文件并完成模块化收敛`

### 目标

在不改变现有产品行为、协议和数据库格式的前提下，拆分前端、Rust Transport、Application、数据库和大型页面上帝文件，建立可并行开发、独立测试和自动防回退的长期架构。

### 父 Issue 完成条件

- 13 个子 Issue 全部关闭或明确记录延期原因。
- `App.vue ≤ 800`、`lib.rs ≤ 1200`、`http_server.rs ≤ 1200`、`db.rs ≤ 1000`。
- 四个 `.runtime.js` 文件移除。
- 所有超过最终红线的文件都有批准的临时豁免或完成拆分。
- 自动化测试、构建、Rust 检查、Windows 启动和真机回归通过。
- Tauri/HTTP 同源服务、数据库兼容、安全存储和回滚完成审查。

## 5. 子 Issue 清单

## #A 基线、特征测试与架构守卫

### 目标

在移动任何代码前锁定当前行为、文件规模、公共接口和关键用户流程。

### 子任务

- 统计所有超过 1500 行的 Vue/TS/JS/Rust 文件。
- 生成 `App.vue` 状态、watch、生命周期、网络调用和模板依赖清单。
- 生成 `lib.rs` Tauri Command 清单。
- 生成 `http_server.rs` Route/Handler 清单。
- 生成 `db.rs` 函数和表/键使用清单。
- 补充启动、会话恢复、导航、缓存、更新、通知特征测试。
- 补充 Tauri/HTTP 同输入同语义契约测试。
- 建立文件行数和禁止职责守卫。
- 保存基线构建产物、关键截图和性能指标。

### 写入边界

- `scripts/check_*`
- `src/**/*.spec.ts`
- `src-tauri/src/**/*test*`
- `docs/architecture/god-file-removal/**`

禁止修改业务实现。

### 验收

- 守卫可以识别故意制造的超限和非法依赖。
- 完整现有测试通过。
- 基线报告可追溯到文件和行号。

### 建议 Agent

`architecture-mapper` + `test-guardian`，只读分析和测试写入可并行。

---

## #B Reasonix 子 Agent 与 Worktree 编排

### 目标

建立可恢复、无共享写冲突的本地并发执行框架。

### 子任务

- 验证 `deepseek-flash` 模型可调用。
- 创建项目级 Subagent 配置和 Prompt 文件。
- 为每个子 Issue 创建独立 Worktree 和分支。
- 建立 `ownership.json` 或等价写入所有权清单。
- 建立子 Agent 输出模板。
- 建立主 Agent 集成检查清单。
- 试运行一个只读 Explore 和一个 Review 子 Agent。

### 验收

- 至少一个自定义子 Agent 返回结构化结果。
- Review 子 Agent 能读取分支 diff 但不能写文件。
- 任意两个写入 Agent 不拥有相同入口文件。

### 建议 Agent

主 Agent负责配置和裁决；Reasonix 内置 `explore`、`review` 用于验证。

---

## #C App.vue Bootstrap / Coordinator 拆分

### 目标

先把应用启动、会话、生命周期、更新、通知和平台初始化从 `App.vue` 迁出，不改变 DOM 和页面行为。

### 子任务

- 提取 App Bootstrap。
- 提取 Session Restore。
- 提取 Lifecycle Coordinator。
- 提取 Update Coordinator。
- 提取 Notification Coordinator。
- 提取窗口关闭和平台事件处理。
- 为 Coordinator 建立显式依赖接口。
- 保持原模板结构和 CSS 不变。

### 写入边界

- `src/App.vue`
- `src/app/bootstrap/**`
- `src/app/coordinators/**`
- 对应测试

禁止修改大型业务页面、Rust 和数据库。

### 验收

- `App.vue` 降至临时上限 1500 行以内。
- `App.vue` 不再直接执行会话恢复、通知轮询和更新策略。
- 冷启动、会话恢复、前后台恢复和窗口关闭测试通过。

### 建议 Agent

`frontend-app-shell`，入口文件单一所有者。

---

## #D Pinia 生产接入与 AppViewHost 收敛

### 目标

完成 Auth、Navigation、Lifecycle、Grade、Update Store 的生产接入，消除本地重复状态和巨大模板分支。

### 依赖

依赖 #C。

### 子任务

- Grade Store 接管生产成绩快照和刷新状态。
- Update Store 接管更新状态和错误。
- Auth/Navigation/Lifecycle Store 去除重复本地 `ref`。
- 提取 `AppViewHost.vue`。
- 提取 Bottom Navigation 和全局 Dialog 宿主。
- 将异步页面注册表迁出 `App.vue`。
- 禁止 Store 与本地状态双向同步。

### 验收

- 五个 Store 均有生产引用和行为测试。
- `App.vue ≤ 800`。
- 主要导航、返回方向、滚动恢复和页面缓存不变。

### 建议 Agent

`frontend-app-shell`，仍保持入口唯一所有者。

---

## #E Rust Tauri Transport 模块化

### 目标

把 Tauri Commands 按领域迁移到 `transport/tauri/**`，`lib.rs` 只保留应用初始化、状态和注册。

### 子任务

- 建立 Command 清单与领域映射。
- 提取 auth/session Commands。
- 提取 academic/grade/exam/rank Commands。
- 提取 schedule/calendar Commands。
- 提取 notification/update/settings Commands。
- 提取其他独立业务域。
- 建立集中 Command Registry。
- 保持 Command 名、参数和返回兼容。

### 写入边界

- `src-tauri/src/lib.rs`
- `src-tauri/src/app/**`
- `src-tauri/src/transport/tauri/**`
- 对应 Rust 测试

禁止修改 HTTP Router 和数据库实现。

### 验收

- `lib.rs ≤ 2000`，最终在 #M 降至 1200。
- Command 名称和前端调用兼容。
- Rust 测试、fmt、clippy 通过。

### 建议 Agent

`rust-tauri-transport`。

---

## #F Rust HTTP Transport 模块化

### 目标

按领域拆分 Axum Router、Middleware、Request/Response 类型和 Handler。

### 子任务

- 提取 Router 构建。
- 提取鉴权和敏感 Bridge Middleware。
- 提取统一 Response/Error Mapping。
- 按 auth、academic、schedule、notification、settings 等拆 Route。
- 保持路径、方法、状态码和 JSON 兼容。
- 消除 Handler 中的领域业务实现。

### 写入边界

- `src-tauri/src/http_server.rs`
- `src-tauri/src/transport/http/**`
- HTTP 契约测试

禁止修改 Tauri Command 注册和数据库实现。

### 验收

- `http_server.rs ≤ 2000`，最终在 #M 降至 1200。
- 现有 Bridge API 契约全部通过。
- 鉴权和敏感接口安全测试通过。

### 建议 Agent

`rust-http-transport`。

---

## #G Application Service 业务收敛

### 目标

让 Tauri 和 HTTP 对同一业务复用同一个 Application Service，清除 Transport 中的缓存、离线和业务规则。

### 依赖

依赖 #E 和 #F 的基础目录和接口冻结。

### 子任务

- 扩展 Session/Auth Service。
- 扩展 Academic/Grade/Exam/Rank Service。
- 建立 Schedule/Calendar Service。
- 建立 Notification/Update Service。
- 建立统一 Application Error。
- 统一缓存成功、缓存写入失败、离线回退和会话失效语义。
- 审查所有锁跨 await 场景。

### 验收

- Tauri/HTTP 同源服务契约通过。
- Transport 不包含业务分支和缓存策略。
- 锁粒度、并发和会话语义测试通过。

### 建议 Agent

`rust-application`；主 Agent负责跨 Transport 接口裁决。

---

## #H 数据库兼容测试与仓储拆分

### 目标

把 `db.rs` 拆为连接、迁移、凭据、缓存、备份和业务仓储，同时保持现有数据库文件兼容。

### 子任务

- 建立数据库函数、表、Key 和调用方清单。
- 为旧数据库 fixture 建立打开和读取测试。
- 提取 connection。
- 提取 migrations。
- 提取 credential repository 和加密入口。
- 提取 cache repository。
- 提取 backup/restore。
- 按业务域提取 repositories。
- 保持原公开函数的临时适配层。
- 验证敏感字段主密钥写入/读取、账户隔离和备份加密。

### 写入边界

- `src-tauri/src/db.rs`
- `src-tauri/src/infrastructure/db/**`
- 数据库测试 fixture

### 验收

- `db.rs ≤ 1600`，最终在 #M 降至 1000。
- 旧库可打开，缓存和凭据兼容。
- 不执行真实用户数据库批量迁移。
- 加密、备份和恢复测试通过。

### 建议 Agent

`rust-db`；安全相关接口由主 Agent和 `security-review` 复核。

---

## #I 四个 runtime.js 完整 TypeScript 迁移

### 目标

移除 `cloud_sync.runtime.js`、`notify_center.runtime.js`、`remote_config.runtime.js`、`updater.runtime.js`。

### 子任务

- 先为四个模块建立导出、错误、存储和平台行为契约。
- 迁移 `remote_config`。
- 迁移 `updater`。
- 迁移 `notify_center`。
- 迁移 `cloud_sync`。
- 为外部响应建立明确类型和运行时校验。
- 删除 facade 和 runtime 双层结构。
- 更新所有 import 和文档。

### 写入边界

- 对应 `src/utils/*.ts`
- 对应 `*.runtime.js`
- 对应测试和文档

禁止修改 App.vue、Rust 和大型页面。

### 验收

- 四个 runtime 文件不存在。
- TypeScript 严格检查通过。
- 离线、错误、更新渠道、通知轮询和云同步测试通过。

### 建议 Agent

`typescript-migration`；可按模块拆成最多两个并行 Worktree，但同一模块只能有一个所有者。

---

## #J ScheduleView 拆分

### 目标

把课表页面拆为数据、领域算法、交互 Composable、可视组件和平台适配。

### 子任务

- 提取课表数据加载和缓存。
- 提取周次、日期、时间段、课程冲突等纯函数。
- 提取抽屉、编辑、拖动和手势 Composable。
- 提取桌面/移动布局组件。
- 提取课程卡片、时间轴、空状态等子组件。
- 保持 DOM、安全区、滚动和动画兼容。

### 验收

- `ScheduleView.vue ≤ 1500`。
- 课表算法具备纯函数测试。
- 今日/周视图、编辑、离线、滚动和移动端回归通过。

### 建议 Agent

`frontend-view-schedule`。

---

## #K ForumView 拆分

### 目标

分离帖子流、身份、编辑器、上传、评论和展示组件。

### 子任务

- 提取 Forum Store/Service。
- 提取 Feed 查询和分页。
- 提取 Post Editor 和上传。
- 提取评论、点赞和身份显示。
- 提取帖子卡片和详情组件。
- 建立失败重试和缓存测试。

### 验收

- `ForumView.vue ≤ 1500`。
- 发帖、编辑、上传、评论、身份和分页行为不变。
- Forum API 和缓存测试通过。

### 建议 Agent

`frontend-view-forum`。

---

## #L Settings / Chaoxing / 其他超限文件拆分

### 目标

拆分剩余超过红线的 Vue 和 Rust 文件，防止项目只处理三个入口后仍保留大量上帝文件。

### 第一批范围

- `SettingsView.vue`
- `ChaoxingClassView.vue`
- `CourseSelectionView.vue`
- `AiChatView.vue`
- `NotificationView.vue`
- `src-tauri/src/modules/online_learning.rs`
- `src-tauri/src/http_client/academic.rs`

### 子任务

- 每个文件先生成职责地图和测试缺口。
- 按 feature/domain 拆分，不按任意行数切割。
- 每个文件单独分支和 PR。
- 对仍超过红线的文件建立临时豁免和后续任务。

### 验收

- 一般 Vue 页面 ≤ 1500 行。
- 一般 Rust 业务模块 ≤ 1800 行。
- 无未记录的超限文件。

### 建议 Agent

`frontend-view-settings`、独立 Chaoxing Agent、独立 Rust Academic Agent；按文件并行，禁止共享入口。

---

## #M 最终收敛、兼容层删除与发布验证

### 目标

删除过渡适配、达到最终行数红线，并证明拆分后产品可以发布。

### 子任务

- 删除未使用旧实现、facade 和转发层。
- 运行行数和依赖守卫。
- 完整前端测试、类型检查和构建。
- 完整 Rust fmt/test/clippy。
- Windows Tauri 调试启动和安装包冒烟。
- Android/iOS 真机核心流程回归。
- Reasonix `review` 和 `security-review`。
- 主 Agent人工审查公共接口、数据兼容、错误语义和锁。
- 更新架构图、开发指南和新增功能落点说明。
- 演练单个子 Issue 的回滚。

### 最终验收命令

```powershell
npm ci
npm run check:architecture
npm run typecheck
npm run test:ci
npm run build
npm run check:all
npm run check:release
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --lib
npx tauri dev
```

### 验收

- 父 Issue 所有完成条件满足。
- CI 全绿。
- 无已知高风险安全、数据兼容或用户流程回归。
- 主 Agent出具最终审查结论后才能合并最后一个 PR。

## 6. 每个子 Agent 的统一交付格式

每次执行必须返回：

```text
任务：
分支 / Worktree：
修改文件：
未修改边界：
关键实现：
行为兼容证据：
测试命令：
测试结果：
已知风险：
需要主 Agent 决策：
建议集成顺序：
```

没有测试结果、diff 说明或风险说明的子 Agent 输出，不进入集成队列。

## 7. 审批后的执行顺序

用户批准后，主 Agent按以下顺序行动：

1. 读取并冻结本规划。
2. 使用 `issue-creator` Skill 创建父 Issue 和 13 个子 Issue。
3. 建立集成分支与 Worktree。
4. 验证 Reasonix 模型可用性。
5. 创建项目级子 Agent 和 Prompt。
6. 先执行 #A 和 #B。
7. 通过架构冻结门后启动 Wave 1 并发。
8. 每个 Wave 结束后统一 Review、Security Review 和完整测试。
9. 主 Agent只处理决策、冲突、审查、合并和 Issue 更新。

当前等待用户审批，不执行以上步骤。
