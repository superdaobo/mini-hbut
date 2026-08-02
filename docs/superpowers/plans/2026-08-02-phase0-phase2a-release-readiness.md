# 阶段 0 与阶段 2A 发布就绪治理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不发布新版本的前提下，完成阶段一合并后验证、Bridge 多运行时兼容性、依赖安全治理、统一发布门禁和 Windows 正式配置干跑构建。

**Architecture:** 保持现有 Tauri 2 + Vue 3 + Capacitor 6 架构不变，通过契约测试、版本一致性检查和组合式 Node 脚本建立发布前门禁。Bridge 测试优先验证纯策略与 HTTP 行为，不依赖真实教务账号；Windows 构建通过手动 GitHub Actions 干跑生成 artifact，不创建 tag 或 Release。

**Tech Stack:** Vue 3、TypeScript、Vitest、Tauri 2、Rust、Axum、Capacitor 6、Node.js、GitHub Actions、npm audit、GitHub Dependabot API。

## Global Constraints

- 不修改 `package.json`、Tauri 配置或移动端配置中的应用版本 `1.4.4`。
- 不创建 Git tag、GitHub Release、TestFlight 上传或应用商店提交。
- 不删除或迁移用户数据库、缓存、凭据和登录状态。
- 不进行成绩业务与大型架构重构。
- 每个 Sub-issue 使用独立 commit，commit 信息包含 Issue 编号。
- `.reasonix/` 及用户已有未跟踪内容不纳入提交。
- 所有完成声明必须有本地命令或 GitHub Actions 的新鲜验证证据。

---

### Task 1: 阶段 0 合并后验证（#541）

**Files:**
- Create: `docs/release-readiness/phase0-post-merge-smoke.md`

**Interfaces:**
- Consumes: 已合并到 `main` 的 PR #539。
- Produces: 可追溯的合并后测试结果、环境限制和 GitHub CI 链接。

- [ ] 记录 `main` 合并提交、PR 状态和 #532–#538 状态。
- [ ] 运行 `npm run test:ci`，要求全部测试通过。
- [ ] 运行主应用生产构建；若 `prepare_dist.mjs` 卡住，定位原因并在 Task 4 修复。
- [ ] 运行官网三组文档契约和 `website npm run build`。
- [ ] 运行 Rust test/fmt/clippy/release check；Windows 本地缺少 MSVC 环境时，记录限制并以 GitHub CI 作为补充证据。
- [ ] 写入 smoke 记录并提交：`docs: record post-merge smoke evidence (#541)`。

### Task 2: Bridge 多运行时与流式调用兼容性（#542）

**Files:**
- Create: `src/utils/phase2a_bridge_runtime_contract.spec.ts`
- Create: `scripts/test_bridge_http_contract.mjs`
- Modify: `package.json`
- Modify: `src-tauri/src/http_server.rs`（仅在测试暴露真实缺陷时最小修改）
- Modify: `src-tauri/docs/http_bridge_security.md`

**Interfaces:**
- Consumes: `bridge_route_policy`、`is_trusted_bridge_origin`、统一鉴权 middleware、现有 `/health` 与公开嵌入路由。
- Produces: `npm run test:bridge-compat`，覆盖运行时 Origin、Bearer Token、OPTIONS、SSE/流式请求、文件下载和公开资源策略。

- [ ] 先写失败契约，枚举 Tauri、Vite、Capacitor、外部脚本的预期访问矩阵。
- [ ] 增加一个不接触真实账号的本地 HTTP smoke，验证公开 health、受保护接口 401/成功 Token、可信 Origin、错误 Origin、OPTIONS 响应和公开内容路由。
- [ ] 验证 `fetchEventSource` 请求所需 Header/Method 在 CORS 白名单内。
- [ ] 验证 `/exports/*`、`/module_bundle/content/*`、学校网站嵌入内容保持公开只读，写入接口保持受保护。
- [ ] 更新 Bridge 安全文档与外部脚本用法。
- [ ] 运行目标测试和完整前端/Rust 测试后提交：`test(bridge): cover multi-runtime compatibility (#542)`。

### Task 3: 依赖漏洞与版本一致性治理（#543）

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/check_dependency_alignment.mjs`
- Create: `docs/release-readiness/dependency-audit.md`
- Modify: `.github/dependabot.yml`（仅现有配置需要补强时）

**Interfaces:**
- Consumes: npm lockfile、Cargo.lock、GitHub Dependabot alerts、npm registry 元数据。
- Produces: `npm run check:dependency-alignment` 与审计基线文档。

- [ ] 将 `@capacitor/cli` 与 `@capacitor/core/android/ios` 固定在同一 6.2.x 主/次版本，不升级到 Capacitor 8。
- [ ] 将 `@tauri-apps/cli`、`@tauri-apps/api` 与 Rust Tauri 2.x 保持可安装且 `npm ci` 无 invalid 状态。
- [ ] 执行 `npm audit --json`、GitHub Dependabot alerts 和 RustSec 审计（优先 `cargo deny`/`cargo audit`；本机缺失工具时增加 CI 可重复检查）。
- [ ] 仅应用不改变架构和平台要求的安全升级；每次升级后运行构建和测试。
- [ ] 对无法立即修复的间接依赖记录包链、影响面、缓解措施和后续 Issue，不以忽略代替分析。
- [ ] 提交：`build(deps): align toolchains and audit risks (#543)`。

### Task 4: 统一发布门禁（#544）

**Files:**
- Create: `scripts/check_all.mjs`
- Create: `scripts/check_release.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `src/utils/release_readiness_contract.spec.ts`
- Modify: `scripts/prepare_dist.mjs`（若确认存在并发/阻塞缺陷）

**Interfaces:**
- Produces: `npm run check:all` 与 `npm run check:release`。

- [ ] `check:all` 顺序执行前端生产构建、Vitest、CI 类型检查、安全守卫、dist 边界、依赖一致性和 Rust fmt/test/clippy。
- [ ] `check:release` 在 `check:all` 基础上增加 Rust release check、官网文档测试/构建、npm 审计和发布配置验证。
- [ ] Node 编排器使用子进程透传输出、明确超时、失败即停，并避免 Windows shell 转义差异。
- [ ] 修复 `prepare_dist.mjs` 在本地长期卡住的问题，要求同一命令可重复运行且不会残留互斥锁。
- [ ] CI 改为调用统一入口或至少验证入口与现有步骤一致。
- [ ] 提交：`ci: add unified release readiness gates (#544)`。

### Task 5: Windows 正式配置无发布干跑（#545）

**Files:**
- Create: `.github/workflows/release-dry-run.yml`
- Create: `scripts/verify_release_dry_run.mjs`
- Modify: `src/utils/release_readiness_contract.spec.ts`
- Modify: `docs/release-readiness/phase0-post-merge-smoke.md`

**Interfaces:**
- Produces: 手动触发、只上传 artifact 的 `Release Dry Run` workflow。

- [ ] workflow 仅支持 `workflow_dispatch`，权限为 `contents: read`，禁止创建 tag、Release 或部署网站。
- [ ] Windows job 使用正式 release profile，运行 `npm ci`、发布前门禁适用子集并构建 NSIS；MSI 作为可选或单独验证项。
- [ ] artifact 名称包含 commit SHA，不改版本号，不签名、不上传商店。
- [ ] 触发 workflow，等待完成，下载/检查 artifact 元数据和安装包存在性。
- [ ] 在无法自动操控桌面 UI 时，以可执行文件结构、安装包生成、进程启动健康检查或 Tauri build 日志作为 smoke 证据，并明确未验证项。
- [ ] 提交：`build: add non-publishing Windows release dry run (#545)`。

### Task 6: 最终复审、PR 与 Issue 回写（#540）

**Files:**
- Modify: `docs/release-readiness/phase0-post-merge-smoke.md`
- Modify: `docs/release-readiness/dependency-audit.md`

- [ ] 从 C 端功能、Bridge 权限、依赖安全、发布权限、版本不变性、数据安全、错误处理、跨平台和回滚角度复审完整 diff。
- [ ] 运行 `npm run check:all` 与 `npm run check:release`。
- [ ] 推送分支并创建 ready-for-review PR，关联并在合并后关闭 #540–#545。
- [ ] 等待 CI、CodeQL 和 Release Dry Run 全部完成；修复实际失败。
- [ ] 用 `gh issue comment` 向每个 Issue 写入 commit、测试、workflow 和剩余风险证据。
- [ ] 确认 PR 可合并、本地与远程同步、工作树仅保留用户原有 `.reasonix/`。
