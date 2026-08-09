# Phase 0 状态核验表（2026-08-09）

> 依据：GitHub open issues（superdaobo/mini-hbut）+ 本地 `main` 工作区只读核验。
> 用途：作为后续各实现 Agent 的输入依据；标注每个 open issue 的实现状态与剩余工作。
> 基线：以当前 `main` 为基线（Phase 4/5 工作已通过 PR #570/#585 合入），不重新采用旧 `phase5/*` 分支。

## 状态汇总

| Issue | 标题 | 状态 | 证据/剩余工作 |
|---|---|---|---|
| #552 | Phase 4 路线图（父） | ✅ 子项已实现 | 父 issue，待关闭 |
| #553 | Phase 4A AppShell/Pinia | ✅ 已实现 | `src/shell/AppShell.vue`、`src/stores/`（auth/grade/lifecycle/navigation/update）、`src/app/coordinators/` 8 个协调器 |
| #554 | Phase 4B Rust Application Layer | ✅ 已实现 | `src-tauri/src/application/`、`transport/tauri/` 16 领域模块、`http_server/routes/` 10 文件、db.rs 薄 facade |
| #555 | Phase 4C JS→TS 迁移 | ✅ 核心已实现 | credential_storage/api/axios_adapter/remote_config/cloud_sync/notify_center/updater/background_fetch 均已为真实 .ts；剩余 utils/ 下非核心 .js 属 #580 范围外的存量 |
| #556 | Phase 4D 真机验证 | 🔶 需人工 | 产出可执行验证清单（Phase 5），真机/真实账号由用户执行 |
| #557 | Phase 4E 凭据加密迁移 | 🔶 大部分已实现 | keyring 密码存储、敏感字段主密钥、v2 Base64→keyring 显式迁移、secret_envelope AES+HMAC、cookie/token 加密信封、备份加密已存在；需用户确认后才执行真实数据迁移 |
| #571 | Phase 5 父 issue | 🔶 待收口 | Sub-issues 大部分已实现，待 #584 收口后关闭 |
| #572 | 行为基线/守卫 | ✅ 已实现 | `scripts/check_god_files.mjs --strict` violations=0；`check_arch_guards.mjs` 8 项通过；`check_god_files.test.mjs` 4/4（可机械失败）；`god_file_debt.json`=[] |
| #573 | DeepSeek 路由/编排 | 🔶 配置已落地 | reasonix.toml 免费模型+并发参数；doctor 预检通过、双免费模型只读并发成功；回退 provider（deepseek-flash）无 key，回退路径不可用（环境限制，不写入仓库） |
| #574 | App.vue 拆分 | ✅ 已实现 | App.vue 746 行（≤800）；协调器已拆至 `src/app/coordinators/` |
| #575 | Pinia 生产接入/AppViewHost | 🔶 待核验补齐 | 5 个 store 存在；App.vue 自身仍是视图主机，需核验 Grade/Update store 生产使用与重复状态消除 |
| #576 | Tauri Command Transport | ✅ 已实现 | `transport/tauri/` 16 领域模块；lib.rs 564 行（≤1200） |
| #577 | HTTP Router Transport | ✅ 已实现 | `http_server/routes/` 10 文件；mod.rs 组合 8 领域 router + 3 debug router；http_server.rs 已不存在（拆分完成） |
| #578 | Application Service 扩展 | 🔶 部分实现 | `application/` 仅 academic/context/error/session 4 文件，只覆盖少量用例；主要业务仍散落 transport/底层，待扩展 |
| #579 | db.rs 拆分/仓储 | ✅ 已实现 | db.rs 19 行 facade；`infrastructure/db/` connection/migrations/credential/cache/backup/repositories |
| #580 | 四个 runtime.js 迁移 | ✅ 已实现 | 无 `*runtime*.js` 文件；grep 无 `.runtime.js` import/require/动态加载残留；TS 版本（cloud_sync/notify_center/remote_config/updater）存在 |
| #581 | ScheduleView 拆分 | ✅ 已实现 | ScheduleView.vue 646 行（≤1500）；`features/schedule/` composables+utils+components 完整 |
| #582 | ForumView 拆分 | 🔶 行数达标、职责未拆 | ForumView.vue 999 行（≤1500）；但 `features/forum` 不存在，列表/详情/评论/媒体仍单文件混合 |
| #583 | Settings/Chaoxing 超限页 | 🔶 行数达标、需核验 | SettingsView 1043、ChaoxingHubView 1429（均 ≤1500）；21 个 src 文件 >1000 行但未超 1500 红线；需核验"入口只组合/能力走 service/纯函数有测试" |
| #584 | 删除兼容层/最终验证 | ❌ 未实现 | Phase 5 收口任务，依赖 C-L 完成后执行 |
| #589 | Mobile Size 父 issue | ❌ 未实现 | 2026-08-09 创建，Sub-issues 全部未实现 |
| #590 | 包体基线与回归检查 | ❌ 未实现 | report_bundle_sizes.mjs 已有基础；同 commit A/B 口径未建立；构建以 CI 产物为准 |
| #591 | 前端发布边界 | ❌ 未实现 | viewRegistry.ts 仍静态 import CourseSelectionView/ForumView/MoreModuleHostView/MoreChaoxingCheckinView 并进入 prefetch |
| #592 | Chaoxing 能力矩阵 | ❌ 未实现 | 需产出能力-消费者-平台矩阵；禁止整块删除 online_learning |
| #593 | Bridge 平台矩阵 | ❌ 未实现 | 需核对 Android Release（Bridge 关）/iOS（Bridge 开）的真实路由消费者 |
| #594 | Rust 编译裁剪 | ❌ 未实现 | 依赖 #592/#593 矩阵 + #591 结论；Cargo features 无业务级边界 |
| #595 | CI 发布集成 | ❌ 未实现 | 依赖 #590-594；三个 workflow 参数差异需统一 |

## Gate 0 预检结果（#573）

- `reasonix doctor --json`：v1.18.0，默认模型 `opencode-zen-anthropic/deepseek-v4-flash-free` 解析成功。
- Provider key 状态：`opencode-zen-anthropic` key=✓（免费模型可用）；`opencode-go` key=✓；`deepseek-flash`/`deepseek-pro` key=✗（回退路径不可用，主 Agent 决策时需考虑）。
- 双免费模型只读并发实测：2/2 成功（前端 features 结构 + Rust 路由组合审计），证明免费模型可并发工作。
- 待实施阶段验证：写路径重叠阻止/串行化（max_parallel_writers=3）、Worktree 隔离、故障回退记录。

## Gate 0 收尾（2026-08-09 完成）

- **写路径重叠阻止/串行化**：✅ 已实测——Phase 1 fleet 双写入 Agent（src/ 前端 vs src-tauri/ Rust，write_paths 互斥）与 Phase 3 双审计 Agent（两份矩阵文档，write_paths 互斥）均并行成功；fleet 的 write_paths 冲突检测生效，无共享文件写冲突。
- **Worktree 隔离**：本工作流未使用 git worktree，改用「同一工作区 + 互斥 write_paths」等价实现（多写入 Agent 声明不重叠路径，单文件唯一 owner）；符合本仓库既有并行惯例。
- **免费模型故障回退**：回退 provider `deepseek-flash`/`deepseek-pro` 无 key（环境限制，不写入仓库）——免费模型故障时由主 Agent 决策（任务级重试/降级），已在 Phase 0-5 全程实践。
- **双免费模型并发**：Phase 0 Gate 0 实测 2/2 成功；Phase 1/3 的 4 个写入/审计 Agent 均以免费模型完成。

## 关键行数基线（红线对照）

| 文件 | 行数 | 红线 |
|---|---|---|
| src/App.vue | 746 | 800 |
| src-tauri/src/lib.rs | 564 | 1200 |
| src-tauri/src/http_server.rs | 不存在（已拆分） | 1200 |
| src-tauri/src/db.rs | 19 | 1000 |
| ScheduleView.vue | 646 | 1500 |
| ForumView.vue | 999 | 1500 |
| SettingsView.vue | 1043 | 1500 |
| ChaoxingHubView.vue | 1429 | 1500 |

## 下一步（Phase 1+）

1. Phase 1：#582 职责拆分（features/forum/**）、#583 核验补齐、#575 AppViewHost 收敛、#578 Application Service 扩展，最后 #584 收口。
2. Phase 2-4：Mobile Size 系列（#590 基线 → #591 前端边界 → #592/#593 审计 → #594 Rust 裁剪 → #595 CI 集成）。
3. Phase 5：#556 真机清单、#557 用户确认后执行、#573 回退补 key（用户侧）、全局审查与 issue 关闭。
