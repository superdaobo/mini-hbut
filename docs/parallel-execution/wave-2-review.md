# W2 Gate Review 验收记录（2026-08-13）

> 主 Agent 验收：5 个实现 Agent 并行完成（#630 因模型故障重派 2 次后成功），CI 全绿，验收通过。

## 验收结果总览

| Issue | 状态 | 关键证据 |
|---|---|---|
| #619 Identity 数据模型 | ✅ 通过 | core 10 文件/53 测试；12 表 DDL + rollback；Adapter 契约 8 条 + 真实 oidc-provider v9.11.3 集成（非 mock）；DB 8 条 + Subject 4 条全过；contract.md 冻结 |
| #621 Tauri Deep Link | ✅ 通过 | 146/928 前端测试；Windows 真机 smoke（单实例保持 1 进程）；Parser 11 项 + Lifecycle 全过；IdentityIntent 合同冻结 |
| #612 Android WorkManager | ✅ 通过 | Kotlin 77/77 单测实跑；GradeSignatureV1 fixture 冻结（7 case）；Worker 全链路 + 4 线程并发防重 |
| #613 iOS BGAppRefresh | ✅ 通过 | 7 Swift 源文件 + 30+ 测试用例；BGTask 全生命周期；与 #612 fixture 逐位对齐；INTEGRATION.md |
| #630 Web Handoff | ✅ 通过 | web 110/110 测试 + production smoke；10 态状态机 + 短轮询 + resume 幂等；security headers 实测 |

## 主 Agent 收口操作（Gate 期间）

1. **request_id 前缀统一**（关键契约修复）：#619 冻结 `ar_`+base64url(16B) 格式，但 #621 客户端实现为 `req_` 前缀（并行开发契约漂移）——已统一 `deep_link.ts` 正则 + 4 个 spec 文件 fixture 为 `ar_`，928 测试复跑全绿
2. **确认无其他契约漂移**：GradeSignatureV1 fixture #612↔#613 7 case 逐位一致（Node 独立复算）；#630 Core API 合同（`/api/v1/requests/:id|status|resume` + `x-identity-handoff` 头）已冻结，W3 #620 实现时按此对齐
3. **#612 gen/android 3 处追加**（sourceSets 直引 + POST_NOTIFICATIONS 权限 + onCreate 调度同步）已记录——`src-tauri/gen/**` 被 gitignore，**Tauri 工程重建后需重做**（写入 #612 报告，重建风险登记）
4. **附带修复**：#612 修复 #611 遗留的 `File.renameTo` 原子写 bug + fixture 路径 bug

## CI 验证结果

- 前端：**146 文件 / 928 测试全绿** + vue-tsc 0 错误
- Rust：**258/258** + command_registry 2/2 + http_route_registry 2/2 + fmt 干净
- identity-platform：core **53** + web **110** 测试全绿 + typecheck + build

## 收口点登记（转交 W3 #614 处理）

| 收口点 | 来源 | 处理 |
|---|---|---|
| Rust `perform_run_now` 用内存 events 覆写盘上 events.json（App 运行中 runNow 事件重启前可能被覆盖） | #612 | #614 Event Inbox 时 Rust 侧改从盘 reload |
| Rust `bg_configure` 只落盘不调 JNI → 首次 enable 可能不注册周期 work | #612 | #614 补 JNI configure 调用 |
| #613 Rust `mobile.rs` iOS 分支仍 synthetic，FFI 接入 + setSecureEnvelope | #613 | 后续 Wave 收口 src/** 边界 |

## 剩余风险（跟踪项）

| 风险 | 责任 | 处理 |
|---|---|---|
| pg-mem 并发顺序执行（真实锁语义建议 CI 配真 PG） | #620 | 条件更新设计已保证幂等，SQL 双后端同源 |
| #619 生产 KEK/JWKS/pairwise key 仍占位 | #626 | W5 统一管理 |
| Swift/Kotlin 平台测试需 macOS/Android SDK 环境 | CI | 源码+配置已交付 |
| 真机矩阵（Android 7 类 / iOS 6 类 / Windows 热启动 UI 级） | 用户 | 人工清单已写入各 INTEGRATION 文档 |
| iOS 定时通知（#610 遗留，插件序列化不兼容） | #614 收口 | 原生调度命令需补 |

## 交付物

- 主仓库：`deep_link.ts`/`identityIntentStore`/`IdentityCoordinator`（#621）+ Cargo.toml/lib.rs/tauri.conf.json/capabilities（deep-link 插件）+ `src-tauri/plugins/tauri-plugin-hbut-background/` android+ios+contract-fixtures（#612/#613）
- 私有：`identity-platform/core/`（12 表 + Adapter + contract.md）、`identity-platform/web/`（auth-site 接力页 + BFF）
