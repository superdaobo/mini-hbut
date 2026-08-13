# W1 Gate Review 验收记录（2026-08-13）

> 主 Agent 验收：4 个实现 Agent 并行完成，CI 全绿，验收通过。

## 验收结果总览

| Issue | 状态 | 关键证据 |
|---|---|---|
| #618 Identity Infra | ✅ 通过 | 10/10 验收标准；core 13 测试 + web 14 测试；healthz/readyz 实测；Host 矩阵 9 用例 |
| #609 通知领域契约 | ✅ 通过 | 10 条验收；14 个新测试；三端 adapter 真实状态 + 安全降级 |
| #610 系统预调度提醒 | ✅ 通过 | 33 个新 spec；Rust 3 命令 + 258 测试；iOS 定时调研结论已记录 |
| #611 后台插件骨架 | ✅ 通过 | 40/40 插件测试 + 三端 DTO fixture；runNow 闭环测试；依赖树 0 外部新增 |

## 主 Agent 收口操作（Gate 期间）

1. **`src-tauri/tests/command_baseline.txt`**：登记 #610 的 3 个新命令（`schedule_local_notification_native`/`get_pending_local_notifications_native`/`cancel_local_notifications_native`），修正为与 lib.rs 一致顺序（保序校验）
2. **`NotificationView.vue` 文案收口**（#609 遗留）：删除 `runtime === 'tauri'` 伪报分支"桌面前台轮询（已启用）"，unsupported 状态改显示真实 reason
3. **`cargo fmt` 自动格式化** `notification.rs`（#610 代码）
4. **契约合并确认**：`types.ts`（#609 `ScheduledReminderInput.reminderKey`）↔ `local_reminder_scheduler.ts`（#610 `buildReminderKey` 同构）↔ 插件 DTO（#611 camelCase + schemaVersion）三方对齐

## CI 验证结果

- 前端：**142 文件 / 871 测试全绿**（新增 50 测试）
- vue-tsc：0 错误
- Rust lib：**258/258** + command_registry 2/2 + http_route_registry 2/2
- cargo fmt：干净；clippy：新增代码零 warning（存量 warning 为历史代码，非本次引入）
- identity-platform：`pnpm check` 全绿（typecheck + 27 测试 + next build + vercel.json 校验）

## 剩余风险（跟踪项）

| 风险 | 责任 | 处理 |
|---|---|---|
| iOS 定时通知不可用（插件 Rust 序列化 9 位小数 vs iOS 3 位） | #611→W2 | 需插件内原生调度命令（iOS UNCalendarNotificationTrigger），前端接口已预留 |
| Android 定时通知依赖 Jackson ISO-8601 回退 | 真机 | 需用户真机验证"锁屏到点弹出" |
| Android JNI / Kotlin / Swift 单测未在本机执行（无 SDK/Xcode） | CI/macOS | 源码+构建配置已交付，待 #612 首次构建验证 |
| Vercel Preview/Production 部署 | 用户环境 | 未执行（需用户确认 + 凭据），runbook 已就绪 |
| iOS 工程（gen/ios）不存在 | #613 | 由 W2 #613 生成 |

## 交付物

- 主仓库改动：19 文件 +920/-21 行（.gitignore、SecretGuard、通知域、平台契约、Rust 调度命令、插件注册）
- 新增目录：`src-tauri/plugins/tauri-plugin-hbut-background/`（Rust + Kotlin + Swift + js + contract-fixtures）
- 私有目录：`identity-platform/`（55 文件，主仓库 .gitignore 忽略，不进 GitHub）
