# 23 个 Open Issues 多 Agent 并行执行规划

> **主 Agent**：ZCode（策划、执行协调、Wave 门禁、最终审查验收）
> **日期**：2026-08-13
> **范围**：superdaobo/mini-hbut 全部 open issues（23 个：Identity 14 + Notifications 9）
> **并行度**：单 Wave 峰值 5 个实现 Agent 并行；两个板块全程互不阻塞

---

## 1. 板块划分与依赖图

### 板块 A：Identity 统一身份平台（#617–#630）

```
#617 Parent（总纲，随子 issue 完成而关闭）
  └─ #618 Infra（Vercel 骨架/三域名/环境分层）← 最先，零依赖
       ├─ #619 Data（12 表 + oidc-provider Postgres Adapter）
       │    ├─ #620 OIDC（oidc-provider + Code/PKCE/Discovery/JWKS/UserInfo）
       │    │    ├─ #624 Developer 门户 → #625 Admin 审核
       │    │    └─ #630 Web Handoff 接力页
       │    └─ #621 Tauri Deep Link/Single Instance
       │         └─ #622 设备 Enrollment/Ed25519 签名
       │              └─ #623 App 授权确认 UX → #627 跨设备 QR
       └─ …（以上全部）→ #626 Security 硬化（横切收尾，release blocker）
            → #628 E2E/上线/回滚门禁（#626 必须通过）
            → #629 HF Forum/Cloud Sync 后置迁移（Post-MVP，唯一不阻塞主线）
```

### 板块 B：Notifications 后台检测（#608–#616）

```
#608 Parent（Epic，随子 issue 完成而关闭）
  ├─ #609 统一后台检查领域契约（PlatformBridge 状态模型）
  ├─ #611 tauri-plugin-hbut-background 插件骨架（与 #609 对齐 DTO）
  └─ #610 课程/考试系统预调度 Local Notification（低风险高收益）
       ├─ #612 Android WorkManager MVP（依赖 609+611）
       ├─ #613 iOS BGAppRefresh MVP（依赖 609+611，共用 GradeSignatureV1 fixture）
       │    └─ #614 Event Inbox + 通知去重/Resume 最终一致性（612/613 至少一端产 event）
       │         └─ #615 考试安排变化 + 学校消息后台检测
       │              └─ #616 退役 Capacitor BackgroundFetch/ForegroundService + 发布回归
```

**跨板块**：A 与 B 完全独立，全程并行。

---

## 2. 并行执行 Wave 计划

| Wave | 并行 Agent | 任务 | 依赖 |
|---|---|---|---|
| **W1** | 4 | #618 Infra、#609 契约、#610 预调度、#611 插件骨架 | 无（#618 是 A 板地基；609/610/611 为 B 板地基） |
| **W2** | 5 | #619 Data、#621 Deep Link、#612 Android、#613 iOS、#630 Web Handoff | ← W1 |
| **W3** | 4 | #620 OIDC、#622 Device、#624 Developer 门户、#614 Event Inbox | ← W2 |
| **W4** | 3 | #623 App UX、#625 Admin、#615 考试/学校消息扩展 | ← W3 |
| **W5** | 3 | #626 Security 硬化、#627 跨设备 QR、#616 Capacitor 退役+回归 | ← W4 |
| **W6** | 2 | #628 E2E/上线门禁、#629 HF 迁移 | ← W5（#626 必须通过） |
| **W7** | 收口 | 主 Agent 最终总验收：全部验收标准核对、威胁模型复查、代码审查、回归、文档同步、issue 关闭 | ← W6 |

同 Wave 内存在"微依赖"的两对，由主 Agent 协调：
- **#619 ↔ #621**（W2）：619 先行冻结 AuthRequest schema 合同，621 的对接部分随后完成（621 主体 parser/lifecycle 先行）
- **#620 ↔ #624**（W3）：620 先出 OIDC 配置与 Client 注册 API，624 的 dogfood 登录后接

---

## 3. 写边界与协调机制

### 高风险写冲突（必须遵守）

| 文件 | 涉及 issue | 边界规则 |
|---|---|---|
| `src/platform/types.ts` | 609/610/611/614 | **契约定义由 #609 独占**；610 只实现 scheduled 分支、611/614 只读引用 |
| `src/platform/adapters/tauri.ts` | 609/610/611/614/616 | 609 改状态映射；610 加 scheduled 实现；611 插件封装由插件 agent 自带 JS；禁止重叠段 |
| `src-tauri/Cargo.toml` + `lib.rs` | 611/621 | 611 加插件 workspace；621 加 deep-link 插件；**注册顺序由主 Agent 在 W1→W2 交接时统一 merge** |
| `NotificationView.vue` / `notify_center_checks.ts` | 609/610/614/615/616 | 609 只做状态映射修正；610 只做提醒调度；614/615/616 在后续 Wave，主 Agent 逐 Wave 收口 |
| `src-tauri/gen/android/**` | 611/612/616 | 611 建 Kotlin skeleton 时不得覆盖 widget 代码；612 在其上实现；616 最后清理（widget 必须保留） |

### 协调机制
1. 每个 Wave 的 agent 按上述边界开工；契约依赖处若对方未完成，先实现自身独立部分 + 留清晰 TODO
2. Wave 结束后主 Agent 做 **Gate Review**：CI 全绿（vitest/vue-tsc/cargo test/clippy/build）+ diff 审查 + 契约 merge
3. 每个 agent 交付报告：验收标准逐条核对 + 测试结果 + 剩余风险

---

## 4. 验收与门禁机制

### Wave Gate（每 Wave 必做）
- 前端：`npm run test:ci`（vitest 全量 + vue-tsc + 守卫）
- Rust：`cargo test --manifest-path src-tauri/Cargo.toml --lib` + fmt + clippy
- 构建：`pnpm build` / `cargo check`（Windows）
- 主 Agent diff 审查：命名、抽象、边界、无越权改动

### issue 关闭规则
- 只有该 issue **全部验收标准满足 + 相关测试通过** 才 `gh issue close`，关闭 comment 附验收证据摘要
- Parent issue（#617/#608）在全部子 issue 完成后关闭

### 最终总验收（W7）
全面 Review 清单：C 端 UX、代码质量、安全性（threat model 复查）、数据一致性、权限、错误处理、测试、构建、文档、回滚方案——无已知高风险问题后才算完成。

---

## 5. 执行约束与风险

| 约束/风险 | 处理 |
|---|---|
| **Production 部署**（Vercel prod、真实域名、DNS） | issue 明确要求用户确认；默认只做本地 + Preview 验证，标记"待用户确认" |
| **真实 secret/密钥** | 一律不写入代码/仓库；KEK、JWKS 等用占位 + 环境变量 |
| **iOS 构建**（Xcode/签名/TestFlight） | Windows 无法本地构建；依赖 `ios-testflight.yml`（manual）+ 用户 Apple 凭据；本地只做代码级验证 |
| **真机矩阵**（Android/iOS 后台行为） | 代码 + CI 单测全覆盖，真机记录由用户配合，标记为验收记录项 |
| **PNPM/Node 环境** | identity-platform 使用 pnpm，agent 自行确认可用性 |
| **Vercel Preview 部署** | 需 Vercel 凭据；agent 完成 `vercel dev` 本地验证，Preview 部署留待用户环境 |

---

## 6. 状态跟踪

| Wave | 状态 | 完成时间 | 验收记录 |
|---|---|---|---|
| W1 | ✅ 通过 | 2026-08-13 | docs/parallel-execution/wave-1-review.md |
| W2 | ⬜ | | |
| W3 | ⬜ | | |
| W4 | ⬜ | | |
| W5 | ⬜ | | |
| W6 | ⬜ | | |
| W7 | ⬜ | | |
