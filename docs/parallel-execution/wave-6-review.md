# W6 Gate Review 验收记录（2026-08-14）

> 主 Agent 验收：2 个实现 Agent 并行完成，CI 全绿，验收通过。

## 验收结果总览

| Issue | 状态 | 关键证据 |
|---|---|---|
| #628 测试与上线门禁 | ✅ 通过 | core 209 + web 283 + Playwright E2E 22/22（QR 双 context 6）+ smoke 10/10 + Negative matrix 4 项补齐；runbook §11-14（流水线/12 步/5 种 kill switch/SLO）；real-device checklist |
| #629 HF Resource Server 迁移 | ✅ 通过 | ocr-service 159 测试（+41）；双轨验证结构性防降级；feature flags 默认 disabled；forum.admin=HF role table；Rollout 6 步 + 6 指标；客户端 1060 测试 |

## 主 Agent 收口操作（Gate 期间）

1. **核实 core flaky**：`bad port` 再出现一次（Windows 高并发端口时序，与 W4 同源）——重跑 209/209 全绿；已在 wave-4 登记，建议 CI 真 PG 环境观察
2. **确认 #628 的 gen/android scheme blocker**：本地 gen 是过期产物，guard 如实报出（设计如此）；`tauri-plugin-deep-link` build.rs 在 Android cargo 构建时注入 scheme——已建议 CI android job 构建后运行 `check_mobile_scheme_contract.mjs`（收尾检查，登记）
3. **契约确认**：#629 双轨验证结构性安全（JWT 形状决定通道）；Rollout 前置（Core scope/audience 注册）已文档化；#628 的 L0-L8 与既有测试基线无冲突

## CI 验证结果

- 前端：**155 文件 / 1060 测试全绿** + vue-tsc 0 错误
- Rust：**279/279** + fmt 干净
- identity-platform：core **209** + web **283** 全绿 + Playwright E2E 22/22
- ocr-service（独立仓库）：**159** pytest 全绿

## 登记项（最终验收/用户执行）

| 项 | 处理 |
|---|---|
| Production 部署/切流量（Vercel 12 步、DNS、Preview） | 用户明确确认后按 runbook §13 执行 |
| Real-device checklist（Android/iOS 真机矩阵） | 用户执行（checklist 已交付） |
| CI 加 android scheme guard | 主 Agent 在 W7 收尾登记（.github 建议项） |
| Rollout 前置：Core 注册 forum.*/cloud_sync.* scope | #629 文档已标注 |
| CORS 收紧单独 PR | #629 第 6 步后 |
| Rust modules/notification.rs 死代码清理 | 建议项 |

## 交付物

- 主仓库：`scripts/check_mobile_scheme_contract.mjs`、`scripts/identity_deep_link_smoke.mjs`、`docs/release-readiness/identity-testing-gate.md`、`identity-real-device-checklist.md`、`src/utils/identity_access_token.ts`（7 单测）、forum_api.js/cloud_sync_transport.ts 双轨改造
- 私有：runbook §11-14、`identity-platform/e2e/**`（Playwright 22 用例 + demo-client）、native-negative-matrix.test.ts
- 独立仓库 ocr-service：`identity_auth/**`（config/jwks/validator/claims/dependencies/metrics）、main.py/runtime 双轨 + 41 测试、Rollout 文档
