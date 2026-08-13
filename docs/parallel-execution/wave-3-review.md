# W3 Gate Review 验收记录（2026-08-14）

> 主 Agent 验收：4 个实现 Agent 并行完成（首次 spawn 因 goal 会话切换进程终止，从断点续跑成功），CI 全绿，验收通过。

## 验收结果总览

| Issue | 状态 | 关键证据 |
|---|---|---|
| #620 OIDC Provider | ✅ 通过 | core 19 文件/125 测试；27 条测试矩阵全过（Discovery 4 + AuthCode 8 + OIDC 6 + Interaction 5 + Refresh/Revoke 4）；#630 合同逐字段对齐（7 错误码矩阵） |
| #622 Device 签名批准 | ✅ 通过 | Rust 21/21 + 服务端 38/38；approve 12 步验证；Rust/Node golden fixture 双向逐字节一致 |
| #624 Developer 门户 | ✅ 通过 | web 16 文件/225 测试；Done 7 条全达成；IDOR 全套 + openid-client v6 迁移 + 3 个 cookie bug 修复 |
| #614 Event Inbox | ✅ 通过 | 前端 968/968 + Rust 279/279 + 插件 49/49；A/B/C 三场景；W2 三收口点全处理 |

## 主 Agent 收口操作（Gate 期间）

1. **#622 registerAppRoutes 挂载 merge**（核心）：激活 `core/src/api/index.ts` 中的挂载点（import + 调用），merge 后 core 125 测试全绿（设备 enrollment/approve/me/revoke 端点正式接入 Core API 组装链）
2. **核实 clippy warning 归属**：#614 报告的 235 条 unused-import 为**旧代码存量**（online_learning/debug_bridge 等），`src/identity/**` 与插件 crate 均零 warning
3. **确认契约对齐**：#620 的 RS256 决策（v9 默认 + 第三方兼容性最好）；#620 修复 6 个生产问题（koa2/3 混用、v9 prompts=consent、claims 顶层 null、proxy、grant_types 补 refresh_token、parseJsonb 双后端）；#622 正确分离 canonical scope_hash 与 DB 存储 hash 算法差异

## CI 验证结果

- 前端：**148 文件 / 968 测试全绿** + vue-tsc 0 错误
- Rust：**279/279**（+21 identity）+ command_registry 2/2 + http_route_registry 2/2 + fmt 干净 + clippy 新增零 warning
- identity-platform：core **125** + web **225** 全绿 + typecheck + build

## 剩余风险（跟踪项）

| 风险 | 责任 | 处理 |
|---|---|---|
| 真实 PG 锁语义（pg-mem 顺序执行） | CI | TEST_DATABASE_URL 可切真 PG（同套 SQL）；条件更新保证幂等 |
| Serverless 多实例下 CODE_ISSUED/CONSUMED 观测 | #620 | 进程内 session→interaction 映射，观测性质非安全边界（已注释） |
| developer 域 CSP/安全头 | #626 | proxy.ts 冻结中，W5 统一附加 |
| #610 iOS 定时通知序列化 | 跟踪 | 原生调度命令（#611 插件内），W5 前维持跟踪 |
| 真实 Core 联调（dogfood/QR/App） | W4-W6 | #623/#627/#628 阶段 |
| Vercel 部署（env/JWKS/cookie keys） | 用户 | 生产未配置 fail closed，runbook 已就绪 |

## 交付物

- 主仓库：`src-tauri/src/identity/**`（10 文件 + golden fixture）、插件 Rust 收口（bg_peek_events/bg_consume_events、runNow merge、JNI configure、iOS FFI）、`src/utils/notification_event_ledger.*` + `background_notification.*`、LifecycleCoordinator 消费链、notify_center ledger 接入
- 私有：core OIDC（provider/keys/interaction/static-clients）+ requests API + app API（设备/approve）、web developer-site 全套 + docs 四页
