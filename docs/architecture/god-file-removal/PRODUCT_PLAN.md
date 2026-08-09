# mini-hbut 上帝文件拆除产品规划书

- 状态：待审批修订草案
- 版本：v1.1
- 日期：2026-08-05
- 规划负责人：主 Agent
- 首选实施模型：`opencode-zen-anthropic/deepseek-v4-flash-free`
- 子 Agent 上下文预算：每个任务按 **200,000 tokens 硬上限**设计，不依赖 Provider 标称的更高窗口
- 回退模型：`deepseek-flash/deepseek-v4-flash`，仅在免费模型不可用且满足熔断条件时启用
- 实施原则：主 Agent 只负责关键架构决策、风险裁决、接口冻结、集成审查和最终合并；Reasonix 原生并行子 Agent 负责代码分析、实现、测试与文档。

## 1. 背景

阶段 4 已完成第一层架构收敛：前端引入 Pinia 和 AppShell，Rust 新增少量 Application Layer，部分 JavaScript 模块建立 TypeScript 边界，安全存储和 CI 也得到加强。

但当前核心文件规模仍然表明“上帝文件”没有真正消失：

| 文件 | 当前规模 | 当前判断 |
|---|---:|---|
| `src/App.vue` | 4997 行 | 应用启动、会话、导航、更新、通知、缓存、页面组合等职责仍高度耦合 |
| `src-tauri/src/lib.rs` | 6987 行 | 仍集中大量 Tauri Command、状态初始化、协议适配和业务调用 |
| `src-tauri/src/http_server.rs` | 6333 行 | 路由、鉴权、参数解析、响应映射和业务处理集中 |
| `src-tauri/src/db.rs` | 3232 行 | 迁移、缓存、凭据、备份和多类仓储职责混合 |
| `src/components/ScheduleView.vue` | 5394 行 | 数据加载、日历算法、交互、绘制、样式和平台适配混合 |
| `src-tauri/src/modules/online_learning.rs` | 5365 行 | 多平台学习业务、解析、状态和网络操作混合 |
| `src-tauri/src/http_client/academic.rs` | 4274 行 | 教务协议、解析、缓存语义和领域数据混合 |
| `src/components/ForumView.vue` | 4099 行 | 帖子流、身份、编辑器、上传、评论和 UI 混合 |
| `src/components/ChaoxingClassView.vue` | 3356 行 | 课程、任务、资源和交互逻辑混合 |
| `src/components/SettingsView.vue` | 3008 行 | 多领域设置和平台能力混合 |

这会导致：

1. 多 Agent 并行时高频修改同一文件，冲突概率高。
2. 小功能改动也需要理解数千行上下文，回归面过大。
3. 单元测试难以隔离，容易依赖源码字符串契约而不是行为测试。
4. 前端状态、Rust Transport、Application 和数据库职责边界不清。
5. 新功能继续堆积时，文件规模和认知负担会持续增长。

## 2. 产品目标

本项目不是“为了缩短行数而拆文件”，而是把 mini-hbut 改造成可以长期并行开发、独立测试、低风险发布的模块化架构。

### 2.1 核心目标

1. **保持用户行为兼容**：拆分过程中不主动改变 UI、接口、数据库格式和登录语义。
2. **消除核心上帝文件**：核心入口只负责组合、注册或协议适配，不再承载具体业务。
3. **建立单向依赖**：Transport → Application → Domain/Infrastructure，页面 → Store/Composable → Service。
4. **支持多 Agent 并行**：不同领域拥有独立目录和写入边界，减少同文件冲突。
5. **提升可测试性**：业务逻辑可以脱离 Vue、Tauri、Axum 和 SQLite 独立测试。
6. **完成真实 TypeScript 迁移**：逐步移除只做薄类型门面的 `.ts + .runtime.js` 双层结构。
7. **建立自动防回退机制**：行数、职责和依赖规则进入架构守卫与 CI。

### 2.2 非目标

本轮不包含：

- 新增业务功能。
- 全面重做 UI 设计。
- 修改生产接口协议。
- 修改真实用户数据库结构或批量迁移真实凭据。
- 更换 Vue、Tauri、Pinia、Axum、SQLite 等核心技术栈。
- 为追求形式统一而重写稳定、低风险的小文件。

任何涉及真实凭据、Cookie、Token、数据库迁移或生产配置的变更，必须独立 Issue、独立风险审查，并再次获得明确确认。

## 3. 拆分原则

### 3.1 先锁定行为，再移动代码

每个拆分任务必须先补足特征测试或契约测试，确认现有行为，再做迁移。禁止在同一个 PR 中同时进行大规模重构和功能改造。

### 3.2 绞杀者模式，不做一次性重写

采用“新模块承接一个垂直用例 → 旧入口转发 → 验证 → 删除旧实现”的方式。每个 PR 都应可独立回滚。

### 3.3 一个 PR 只解决一个边界

例如：

- 只拆会话恢复，不同时改更新逻辑。
- 只拆成绩 Command，不同时重写 HTTP Router。
- 只迁移 `cloud_sync`，不同时迁移 `notify_center`。

### 3.4 禁止双向同步状态

Pinia Store 成为生产代码中的唯一状态来源。迁移期允许 `storeToRefs` 兼容旧变量名，但禁止 Store 与本地 `ref` 双向 watch。

### 3.5 Transport 不拥有业务规则

Tauri Command 和 HTTP Handler 只负责：鉴权、参数解析与校验、调用 Application Service、错误和响应映射。缓存策略、离线回退、领域判断和状态变更必须进入 Application/Domain 层。

### 3.6 数据库按仓储和安全边界拆分

数据库代码按迁移、凭据、缓存、备份和业务仓储分离。加密和密钥策略保持单一入口，禁止多个模块自行实现敏感字段加密。

## 4. 目标架构

### 4.1 前端目标结构

```text
src/
├── app/
│   ├── bootstrap/
│   │   ├── createAppRuntime.ts
│   │   ├── restoreSession.ts
│   │   └── deferredInitializers.ts
│   ├── coordinators/
│   │   ├── AuthCoordinator.ts
│   │   ├── LifecycleCoordinator.ts
│   │   ├── NavigationCoordinator.ts
│   │   ├── NotificationCoordinator.ts
│   │   └── UpdateCoordinator.ts
│   ├── shell/
│   │   ├── AppShell.vue
│   │   ├── AppViewHost.vue
│   │   └── BottomNavigation.vue
│   └── contracts/
├── features/
│   ├── grades/
│   ├── schedule/
│   ├── forum/
│   ├── settings/
│   ├── chaoxing/
│   └── ...
├── stores/
├── platform/
└── shared/
```

`App.vue` 最终只负责：挂载 AppShell、组合全局 Coordinator、放置全局 Dialog/Toast/View Host、暴露少量应用级错误边界。

### 4.2 Rust 目标结构

```text
src-tauri/src/
├── app/
│   ├── bootstrap.rs
│   ├── state.rs
│   └── command_registry.rs
├── transport/
│   ├── tauri/
│   │   ├── auth.rs
│   │   ├── academic.rs
│   │   ├── schedule.rs
│   │   ├── notification.rs
│   │   ├── settings.rs
│   │   └── mod.rs
│   └── http/
│       ├── router.rs
│       ├── middleware.rs
│       ├── response.rs
│       ├── routes/
│       └── mod.rs
├── application/
│   ├── auth/
│   ├── academic/
│   ├── schedule/
│   ├── notification/
│   ├── settings/
│   └── session/
├── domain/
└── infrastructure/
    ├── db/
    │   ├── migrations/
    │   ├── repositories/
    │   ├── credentials.rs
    │   ├── cache.rs
    │   ├── backup.rs
    │   └── connection.rs
    └── http/
```

### 4.3 TypeScript 目标

以下运行时文件最终必须被真正的 TypeScript 实现替代：

- `cloud_sync.runtime.js`
- `notify_center.runtime.js`
- `remote_config.runtime.js`
- `updater.runtime.js`

迁移完成后不得保留 `.ts` 只转发到 `.runtime.js` 的长期结构。

## 5. 量化验收标准

### 5.1 文件规模红线

| 类型 | 最终目标 | 临时过渡上限 |
|---|---:|---:|
| `src/App.vue` | ≤ 800 行 | ≤ 1500 行 |
| `src-tauri/src/lib.rs` | ≤ 1200 行 | ≤ 2000 行 |
| `src-tauri/src/http_server.rs` | ≤ 1200 行 | ≤ 2000 行 |
| `src-tauri/src/db.rs` | ≤ 1000 行 | ≤ 1600 行 |
| 一般 Vue 页面 | ≤ 1500 行 | ≤ 2200 行 |
| 一般 Rust 业务模块 | ≤ 1800 行 | ≤ 2500 行 |
| 一般 TypeScript/JavaScript 模块 | ≤ 1000 行 | ≤ 1500 行 |

例外必须写入架构豁免清单，说明原因、责任人和到期条件。

### 5.2 架构验收

- `App.vue` 不直接实现网络请求、会话恢复、更新策略和通知轮询。
- `lib.rs` 不直接包含大段业务流程，只保留初始化、状态和 Command 注册。
- `http_server.rs` 不直接包含领域业务实现。
- `db.rs` 不再同时承载迁移、备份、缓存、凭据和所有仓储实现。
- Tauri 和 HTTP 对同一用例复用同一个 Application Service。
- Pinia 的 Auth、Navigation、Lifecycle、Grade、Update Store 均在生产代码中真实使用。
- 四个 `.runtime.js` 文件全部移除。
- 新增架构守卫阻止上帝文件再次增长。

### 5.3 功能验收

以下用户流程不得出现行为回归：

1. 冷启动、热启动、会话恢复和退出登录。
2. 首页、底部导航、返回动画和滚动位置恢复。
3. 课表、成绩、考试、排名、学籍信息。
4. 前后台切换、长时间后台恢复和窗口关闭。
5. 通知轮询、更新检查和离线缓存。
6. HTTP Bridge 与 Tauri Command 的响应语义一致。
7. Windows 调试启动、生产构建和安装包冒烟。
8. Android/iOS 已有主流程的真机回归。

## 6. 测试策略

### 6.1 自动化门禁

每个 PR 至少执行相关专项测试，集成前执行完整门禁：

```powershell
npm run check:architecture
npm run typecheck
npm run test:ci
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --lib
npx tauri dev
```

Rust 命令必须运行在已加载 MSVC 的环境中，或通过项目的 Tauri/MSVC 启动引导执行。

### 6.2 必须补充的测试类型

- App 启动与会话恢复特征测试。
- Pinia Store 与 Coordinator 行为测试。
- Tauri Command / HTTP Handler 同源服务契约测试。
- Rust 锁粒度与并发回归测试。
- 数据库兼容、加密字段、备份和恢复测试。
- 大型页面的纯函数、Composable 和组件测试。
- 离线、超时、401/403、缓存写入失败等故障注入测试。
- 核心导航和页面渲染的 Playwright/Tauri 冒烟测试。

### 6.3 手工验收

每个 Wave 完成后至少执行：Windows 冷启动和重启；登录、退出、切换账号；首页→成绩→课表→考试→排名→设置的完整导航；断网启动、缓存展示和恢复联网；最小化、恢复、长后台恢复；更新检查和通知轮询；Android/iOS 对应核心页面回归。

## 7. 新版 AgentDock / Reasonix 多 Agent 执行模型

### 7.1 主 Agent 职责

主 Agent 只负责：

1. 建立依赖图并冻结目标架构、公共接口和写入所有权。
2. 决定模块边界、依赖方向、命名和跨领域契约。
3. 决定哪些节点可并行、哪些节点必须串行。
4. 处理跨模块冲突、接口变更和安全/数据决策。
5. 审核每个子 Agent 的 diff、测试证据、风险和建议集成顺序。
6. 决定免费模型失败后的重试、降级或回退。
7. 决定合并、回滚、返工、Issue/PR 状态和最终发布。

主 Agent 不承担大批量机械搬运代码，不与子 Agent 抢写同一文件，也不允许子 Agent 自行改变已冻结的公共契约。

### 7.2 模型路由

| 用途 | 首选模型 | 上下文策略 | 备注 |
|---|---|---|---|
| 并行分析、编码、测试、文档子 Agent | `opencode-zen-anthropic/deepseek-v4-flash-free` | 每个任务按 **200,000 tokens 硬上限**；输入包建议不超过 120,000，至少保留 80,000 给工具结果、推理和输出 | 所有并行子代理默认且优先使用 |
| 低频规划辅助 | `opencode-go/deepseek-v4-flash` | 只用于复杂依赖图或计划复核 | 最终决策仍由主 Agent 做出 |
| 免费模型故障回退 | `deepseek-flash/deepseek-v4-flash` | 按现有 1M 配置，但任务仍保持最小必要上下文 | 只对失败任务逐个回退，不整批静默切换 |

免费模型的 Provider 配置标称约 256k，但本项目不使用其极限窗口，统一按用户指定的 **200k 可用预算**设计任务。任何单个任务预计超过 200k 时，主 Agent 必须先按领域、文件或验证阶段继续拆分，而不是依赖自动压缩硬塞进一个上下文。

### 7.3 免费优先与回退熔断

子 Agent 调度顺序固定为：

1. 使用免费模型执行一次轻量预检。
2. 正式任务失败时，先判断是代码失败还是 Provider 故障。
3. 只有出现认证、额度、限流、服务不可用、Provider 超时或模型下线等基础设施故障，才进入免费模型重试。
4. 免费模型最多重试 2 次，使用退避并保留失败回执。
5. 两次失败后，由主 Agent决定该单个任务是否回退到 `deepseek-flash/deepseek-v4-flash`。
6. 回退必须写入任务记录：失败原因、重试次数、回退模型、涉及任务和测试结果。
7. 不允许子 Agent 自行选择付费/回退模型，也不允许整个 Wave 因一个任务失败而全部切换模型。

代码测试失败、类型错误或设计错误不属于 Provider 不可用，必须由原任务修复，不能借回退模型掩盖实现问题。

### 7.4 新版原生并发机制

当前环境已更新到 AgentDock `0.7.0`，Reasonix 为 `v1.18.0`。实施时采用：

- AgentDock `task_manage`：保存父任务、步骤、完成条件、检查点和最终审查。
- Reasonix 原生 `fleet` / `runAs=subagent`：一次派发依赖图中所有无前置依赖的子任务。
- `subagent_model`：统一路由到免费模型，不再以手工 `subagent create --model deepseek-flash` 作为默认方式。
- `max_subagent_concurrency = 6`：最多 6 个子 Agent 同时运行。
- `max_parallel_writers = 3`：最多 3 个互不重叠的写入 Agent 同时运行。
- `max_subagent_depth = 1`：实现 Agent 不得继续递归创建写入 Agent；需要额外拆分时返回主 Agent重新调度。
- `write_paths` 所有权：Reasonix 对运行中的写路径加锁，重叠写入任务不得并发。
- 后台 Fleet：长任务后台运行，主 Agent通过 `wait` 收集结构化回执，不在等待期间抢写被声明的路径。

并发只用于真正独立的节点。共享入口 `App.vue`、`lib.rs`、`http_server.rs`、`db.rs` 在任一时刻只能有一个写入所有者；其他 Agent 可并行写新目录、测试或文档，但不能修改这些入口。

### 7.5 子 Agent 任务角色

新版机制优先通过 Fleet 任务描述动态创建角色，而不是预先维护大量常驻 Profile。计划使用：

- `architecture-mapper`：只读依赖与职责盘点。
- `test-guardian`：只写测试、特征契约和架构守卫。
- `frontend-app-shell`、`frontend-view-*`：按独立页面/目录写入。
- `rust-tauri-transport`、`rust-http-transport`、`rust-application`、`rust-db`：按 Rust 层级写入。
- `typescript-migration-*`：按单个 runtime 模块写入。
- `review`、`security-review`：Reasonix 内置只读审查。

每个任务必须包含：目标、非目标、依赖、允许路径、禁止路径、冻结接口、测试命令、完成条件和统一交付格式。

### 7.6 当前预检结论与 Gate 0

已确认全局 Reasonix 配置包含：

- `planner_model = "opencode-go/deepseek-v4-flash"`
- `subagent_model = "opencode-zen-anthropic/deepseek-v4-flash-free"`
- 免费 Provider：`opencode-zen-anthropic`
- 免费模型：`deepseek-v4-flash-free`
- Provider 配置窗口约 256k，本项目硬限制为 200k
- 回退 Provider：`deepseek-flash` / `deepseek-v4-flash`

但当前还存在两个真实阻塞，不能假装模型已经可用：

1. 从本仓库直接运行 CLI 时，`reasonix doctor` 只解析到 `deepseek-flash/deepseek-pro`；直接指定免费模型返回 `unknown model`，说明项目执行上下文与新版全局配置之间存在解析/覆盖问题。
2. 最近一次 Reasonix 原生 Fleet 已成功启动子任务，但免费 Provider 返回 HTTP 401，提示 `OPENCODE_API_KEY` 无效或已过期。

因此实施前必须先完成 **Gate 0：模型路由和认证修复**：

```powershell
reasonix doctor --json
reasonix -p --model opencode-zen-anthropic/deepseek-v4-flash-free --output-format json "只回复 READY"
```

随后由协调会话通过原生 Fleet 启动两个互不写入的只读任务，确认：

- 两个任务实际使用免费 Provider；
- 两个任务均成功返回；
- 并发回执、失败原因和模型信息可追踪；
- 免费模型失败时不会静默切换；
- 回退模型单独预检可用，但不在免费模型正常时调用。

Gate 0 未通过前，不创建任何实现 Worktree，不派发写入任务，不消耗回退模型。

## 8. 实施波次

### Wave 0：Gate 0、基线与保护

- 创建父 Issue 和子 Issue，但暂不启动业务实现。
- 修复项目级 Reasonix 配置解析，确保免费 Provider 与回退 Provider 同时可见。
- 更新/验证 `OPENCODE_API_KEY`，让免费模型直接预检返回 READY。
- 使用原生 Fleet 并发运行两个只读任务，验证免费模型、200k 预算、回执和写路径机制。
- 单独预检回退模型；免费模型正常时不调用回退模型执行正式任务。
- 建立干净集成 Worktree、领域 Worktree 和 `write_paths` 所有权清单。
- 冻结公共接口、行为基线和文件规模基线。
- 增加上帝文件规模守卫和关键特征测试。

### Wave 1：核心入口解耦

可并行推进：前端 AppShell/Bootstrap/Coordinator/Store 生产接入；Rust Tauri Transport 模块化；Rust HTTP Router 模块化；数据库职责盘点和仓储接口建立；四个 runtime 模块的迁移契约测试。

### Wave 2：业务迁移

- App.vue 的会话、导航、生命周期、更新、通知和页面宿主迁出。
- Tauri/HTTP 共用 Application Service 扩展到主要校园业务。
- 数据库迁移、凭据、缓存、备份和业务仓储分离。
- 四个 runtime 模块完成真实 TypeScript 实现。

### Wave 3：大型页面拆分

按冲突隔离并行推进：ScheduleView；ForumView；SettingsView / ChaoxingClassView；CourseSelectionView / AiChatView / NotificationView 等后续超限页面。

### Wave 4：最终收敛

- 删除旧入口和兼容层。
- 运行完整自动化、真机和安全测试。
- 更新架构文档和贡献指南。
- 设置 CI 行数/职责守卫。
- 完成最终 Review、Security Review 和回滚演练。

## 9. 风险与缓解

- **隐式耦合**：先绘制状态依赖图，按垂直用例迁移；Coordinator 通过显式接口接收 Store、Platform Service 和业务 Service。
- **Tauri 与 HTTP 行为漂移**：共用 Application Service，并建立同输入同结果契约测试。
- **Rust 锁和会话语义改变**：只读网络用例使用快照；状态变更用例保留独占锁；增加并发和会话回归测试。
- **数据库兼容与安全**：先保持函数签名和数据库格式不变，只移动代码；所有真实迁移单独审批。
- **UI DOM 与 CSS 回归**：初期保持无包装组件；增加 DOM 契约、截图和真机回归。
- **多 Agent 冲突**：Worktree 隔离、`write_paths` 锁、单文件唯一所有者、接口冻结、最多 3 个并行写者、主 Agent 串行集成共享入口。
- **免费 Provider 不稳定**：启动前 READY + 双只读 Fleet 预检；任务级重试和熔断；只对失败任务回退，不整批静默切换。
- **200k 上下文不足**：初始上下文控制在约 120k，预留约 80k；超限任务必须按映射、实现和验证继续拆分。

## 10. 回滚策略

- 每个子 Issue 对应独立分支和可独立回滚的提交。
- 重构 PR 不包含数据库格式变更和产品功能变更。
- 新模块接管旧入口前，保留一轮可切回的适配层。
- 删除旧实现必须在新实现通过完整门禁后单独提交。
- 发现高风险回归时优先回滚当前子 Issue，不连带回滚已验证的独立模块。

## 11. 审批内容

本规划等待审批：

1. 是否批准将“上帝文件拆除”定义为独立阶段，并暂停在这些文件中继续堆叠新功能。
2. 是否批准上述文件规模红线和目标架构。
3. 是否批准父 Issue + 13 个子 Issue 的实施形式。
4. 是否批准并行子 Agent 首选 `opencode-zen-anthropic/deepseek-v4-flash-free`，并按单任务 200k 硬预算拆分。
5. 是否批准免费模型重试耗尽后，由主 Agent只对失败任务回退到 `deepseek-flash/deepseek-v4-flash`，禁止整批静默切换。
6. 是否批准 AgentDock `task_manage` + Reasonix 原生 Fleet、最多 6 个子 Agent/3 个写者、`write_paths` 锁和独立 Worktree 的协作方式。
7. 是否确认 Gate 0 必须先修复项目配置解析和失效的 `OPENCODE_API_KEY`，未通过前不启动实现。
8. 是否确认主 Agent只做关键抉择、接口冻结、审查、冲突裁决和合并，不参与机械搬运。
9. 是否确认任何真实凭据、数据库和生产配置迁移仍需另行审批。

审批后，下一步才是创建 GitHub 父 Issue 和子 Issue；本规划阶段不创建 Issue、不修改业务代码。
