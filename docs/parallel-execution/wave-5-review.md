# W5 Gate Review 验收记录（2026-08-14）

> 主 Agent 验收：3 个实现 Agent 并行完成（#626 首次模型故障，从断点续跑成功），CI 全绿，验收通过。

## 验收结果总览

| Issue | 状态 | 关键证据 |
|---|---|---|
| #626 Security 硬化 | ✅ 通过 | core 205 + web 283；16 条 Security Test Gate 全自动化（gate.test.ts 16/16）；threat-model.md；Postgres 原子限流；BFF→Core 服务令牌；rotation runbook；SecretGuard 扩展（9cb91b8f） |
| #627 跨设备 QR | ✅ 通过 | App 1029 + Web 269；与 Deep Link 共用 AuthRequest（逐字段 toEqual）；fallback 实装；8 项跨设备场景 + 46 QR 测试 |
| #616 Capacitor 退役 | ✅ 通过 | 1053 测试；11 文件删除 + 依赖退出（npm ls empty）；迁移幂等 5 单测；widget 零改动；文档三处更新 |

## 主 Agent 收口操作（Gate 期间）

1. **修复 #627 遗留的 3 个 vue-tsc 错误**（#627 报告的"vue-tsc 零错误"不实）：2 个 spec 的联合类型访问（`MiniHbutDeepLink` 需在 identity 分支内访问）+ 1 个死代码（`handlePickImage`/`fileInputRef` 未使用，模板已用 label 直触）——修复后 vue-tsc 0 错误 + 1053 测试复跑全绿
2. **确认 #616 报告的 5 个 qr 错误**已随 #627 最终版解决（#616 跑 vue-tsc 时 #627 尚在 WIP）
3. **核实 #626 agent 独立提交 9cb91b8f**：内容干净（仅 SecretGuard 扩展 2 文件），保留
4. **契约确认**：#627 fallback 链接（fragment 内 secret，query 出现凭据 fail closed）；#616 保留清单合规（widget/桌面 keep-screen-on/电容适配器均非目标）；#626 developer 域 CSP 经 next.config.ts headers 落地（proxy.ts 保持冻结）

## CI 验证结果

- 前端：**154 文件 / 1053 测试全绿** + vue-tsc 0 错误
- Rust：**279/279** + command_registry 2/2 + fmt 干净
- identity-platform：core **205** + web **283** 全绿 + pnpm audit 0 漏洞

## 登记项（转交 W6）

| 项 | 来源 | 处理 |
|---|---|---|
| Production E2E 门禁需 #626 通过 | #626 | #628 前置条件（已满足） |
| 真机矩阵（QR 扫码/新装升级/WorkManager 迁移） | #627/#616 | #628 checklist + 用户配合 |
| Trusted Types 默认关闭 | #626 | Next RSC 兼容后再启用（开关已留） |
| Rust modules/notification.rs 死代码 | #616 | 建议清理（非本次边界） |

## 交付物

- 主仓库：`src/features/identity/qr/`（8 文件 + 3 spec 46 用例）、App.vue/SettingsView 入口、background_fetch.ts 删除、legacy_background_migration.ts、android/ios 遗留清理（11 文件）、package.json 依赖退出、CAPACITOR_MIGRATION.md/notification.md 更新、SecretGuard 扩展
- 私有：threat-model.md、限流中间件 + migration 0003、BFF 服务令牌、core security tests 45 项、web security 26 项、runbook §9 rotation
