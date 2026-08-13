# modules/notification.rs

## 状态（#616 已更新）

> ⚠️ **本 Rust 模块为历史遗留，未在 `lib.rs` 中注册执行。**
> `init_background_task` 是旧桌面时代的内置轮询骨架（30 分钟循环查成绩/考试），
> 目前没有任何调用方，**不作为正式后台通知基础设施**（#608 红线 5）。

## 功能概述（历史）

- 曾经的桌面后台轮询骨架：`init_background_task` 启动 30 分钟循环，调用
  `check_grades` / `check_exams` 并通过 `tauri-plugin-notification` 弹本地通知。

## 当前正式通知架构（#608/#609–#615）

三层模型（正式能力全部在 `transport/tauri/notification.rs` 与
`tauri-plugin-hbut-background` 插件中）：

1. **已知时间提醒**：课程/考试提醒 → 系统预调度 Local Notification
   （前端 `src/utils/local_reminder_scheduler.ts` ↔ `schedule_local_notification_native`）。
2. **未知时间变化**：成绩 / 考试安排 / 学校消息 → Android WorkManager /
   iOS BGAppRefresh（`tauri-plugin-hbut-background`，baseline/diff + 本地通知）。
3. **最终一致性**：App launch/resume/foreground → Rust 业务层完整同步
   （`sync_grades` 等），事件经 #614 Event Inbox + Notification Event Ledger 去重。

## 迁移历史

- #616 已退役旧 Capacitor BackgroundFetch / Headless / KeepAliveForegroundService /
  `hbu_bg_*` 状态；本模块（旧 `init_background_task`）与正式架构无关联。
- 若后续清理本模块，需同步更新本文档与 `lib.rs` 模块声明；**禁止**重新启用
  进程内轮询作为移动后台方案。
