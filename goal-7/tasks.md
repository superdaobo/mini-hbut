# 服务统计模块 + HF 私有桶双保险任务清单

> 每轮优先执行第一个未完成任务。每个任务完成后记录：实际变更、验证结果、剩余风险、下一步。每三个任务后进行一次大型全面检查。

## Task 1 - 建立当前 goal 文件并核对上下文

- [x] 状态：已完成
- 目标：创建并读取 `goal-7/input.md`、`goal-7/plan.md`、`goal-7/tasks.md`，确认当前任务边界与 active goal 一致。
- 验证：三份文件可读；未修改前后端业务代码。
- 实际变更：新增 `goal-7/input.md`、`goal-7/plan.md`、`goal-7/tasks.md`，把用户合并后的“服务统计模块 + HF 私有桶双保险”需求、执行方案、风险、验证方式和任务拆解落盘。
- 验证结果：已完整读取三份文件；内容与当前 active goal 的目标一致；本轮没有修改 `src/`、`src-tauri/`、`ocr-service/runtime/`、`ocr-service/modules/` 等前后端业务代码。
- 剩余风险：当前只完成 goal 边界建立，尚未定位后端 `/health`、云同步、Turso/SQLPub、HF bucket 的具体实现入口；生产 HF 桶和数据库导出仍未执行，后续也需要先通过测试与受保护接口实现，不能直接写线上数据。
- 下一步：Task 2 定位后端统计与存储现状，记录 `/health`、云同步上传、Turso storage、SQLPub stats、HF bucket 现有代码入口和缺口。

## Task 2 - 后端统计与存储现状定位

- [x] 状态：已完成
- 目标：定位 `/health`、云同步上传、Turso storage、SQLPub stats、HF bucket 现有代码入口。
- 验证：记录关键文件、函数、表结构和当前缺口；不修改业务代码。
- 实际变更：只读检查 `D:\Documents\C_learn\成绩查询\ocr-service` 后端代码，定位 OCR 主服务、统计表、Turso 云同步表、论坛 SQLPub 表和 HF 私有桶现有实现；未修改 `runtime/`、`modules/`、`forum_backend/`、`scripts/`、`tests/` 的业务代码。
- 验证结果：
  - OCR 主入口是 `runtime/entrypoint.py`，FastAPI app 版本定义在 `entrypoint.py:94`，论坛路由通过 `register_forum_routes(app)` 注册在 `entrypoint.py:104` 到 `entrypoint.py:105`；论坛自身 health 默认 `include_health=False`，因此不会覆盖 OCR 主 `/health`。
  - OCR 主 `/health` 位于 `runtime/entrypoint.py:2367` 到 `entrypoint.py:2438`，当前返回 `status`、`ocr_maintenance`、`daily_usage.date/ocr_count/upload_count/timezone`、`cloud_sync.total_records`、`grade_distribution.total_records/query_today/query_total`、`ocr_concurrency`、`upload_concurrency`、`temp_storage`；缺少 `service.started_at`、`service.uptime_seconds`、`service.version`、`daily_usage.grade_dist_query_count`、`cloud_sync.latest_version`、`cloud_sync.latest_version_user_count`、`trend.last_7_days`、`hf_bucket`、`archive_status`。
  - 服务用量和快照模块是 `modules/service_stats.py`。`service_daily_stats` DDL 在 `service_stats.py:20` 到 `service_stats.py:33`，当前列为 `ocr_count`、`upload_count`、`cloud_sync_total`、`grade_dist_total`、`grade_dist_query_today`、`grade_dist_query_total`，缺少 `latest_version`、`latest_version_user_count`；`service_daily_usage` DDL 在 `service_stats.py:36` 到 `service_stats.py:43`，已有 `grade_dist_query_count`。
  - 统计写入链路在 `runtime/entrypoint.py:2140` 到 `entrypoint.py:2198` 的 `_stats_save_loop()`，当前定时调用 `ensure_table()`、`_flush_metric_deltas()`、`_get_turso_record_count()`、`get_grade_dist_total()`、`save_snapshot(...)`；尚未计算或保存最新版本人数。
  - 给分查询计数入口在 `runtime/entrypoint.py:3178` 到 `entrypoint.py:3190`，`grade_distribution_query()` 调用 `_record_gd_query_usage()`，说明给分查询今日数已有内存/SQLPub 增量基础。
  - Cloud sync 请求模型在 `runtime/entrypoint.py:381` 到 `entrypoint.py:389` 的 `CloudSyncUploadRequest`，当前没有顶层 `client_version` 字段；`client_version/platform/runtime` 字段出现在后面的 `GameRankSubmitRequest`，不是 CloudSync。
  - Cloud sync 上传入口在 `runtime/entrypoint.py:2718` 到 `entrypoint.py:2866`，当前先合并 payload，再直接调用 `_CLOUD_SYNC_TURSO_STORAGE.upload(...)`；没有 HF 归档前置写入，也没有 `archive_status.pending_replay_count` 的状态来源。
  - Turso cloud sync storage 在 `modules/cloud_sync_storage.py`。`cloud_sync_records` DDL 在 `cloud_sync_storage.py:300` 到 `cloud_sync_storage.py:315`，当前列为 `student_id`、`payload_codec`、`payload_blob`、`payload_hash`、`payload_size`、`updated_at`、`reason`、`device_id`、`client_time`、`schema_version`；缺少 `client_version` 和 `payload_schema_version`。`upload()` 在 `cloud_sync_storage.py:510` 到 `cloud_sync_storage.py:574`，当前 upsert 没有写版本列。
  - Turso 总记录统计函数 `_get_turso_record_count()` 位于 `runtime/entrypoint.py:2349` 到 `entrypoint.py:2364`，只执行 `SELECT COUNT(*) FROM cloud_sync_records`；后续可在同一 storage/secret 体系下扩展版本人数统计。
  - HF 私有桶封装目前在 `forum_backend/object_storage.py` 的 `HFPrivateBucketStorage`，状态检查和 `upload_file()` 使用 `HF_BUCKET_ID` / `HF_TOKEN` 并写入 HF Dataset；这是可复用基础，但当前只服务论坛附件/备份，没有通用归档模块。
  - 论坛备份在 `forum_backend/backup.py`，`ForumBackupService.upload_archive()` 当前远端路径是 `snapshots/<archive.name>`；论坛 store 已有 `export_snapshot()`，SQLite 版在 `forum_backend/storage/sqlite_store.py:775` 到 `sqlite_store.py:792`，SQLPub 版在 `forum_backend/storage/sqlpub_store.py:660` 到 `sqlpub_store.py:676`，均只导出 forum 表为 zip，不覆盖 OCR 服务表和 Turso 表。
  - 论坛 SQLPub 表清单 `FORUM_TABLES` 位于 `forum_backend/storage/sqlite_store.py:18` 到 `sqlite_store.py:36`，包含 `forum_profiles`、`forum_categories`、`forum_threads`、`forum_posts`、`forum_reactions`、`forum_bookmarks`、`forum_follows`、`forum_reports`、`forum_notifications`、`forum_messages`、`forum_checkins`、`forum_badges`、`forum_attachments`、`forum_backups`、`forum_polls`、`forum_poll_options`、`forum_poll_votes`。
  - 其他 SQLPub 服务表来源已定位：`service_daily_stats` / `service_daily_usage` 在 `modules/service_stats.py`，`grade_distribution_raw` / `grade_distribution` 在 `scripts/grade_distribution_schema.sql`，`game_rank_runs` / `game_rank_best` 在 `modules/game_ranking_storage.py:185` 和 `game_ranking_storage.py:211`。
  - 现有相关测试：`tests/test_service_stats_persistence.py` 覆盖 `add_usage_delta()`、`get_daily_usage()`、`get_daily_usage_trend()` 和日报读取 SQLPub 日累计；`tests/test_forum_integration.py` 已断言 OCR `/health` 保留 `status=ok` 和 `ocr_concurrency`；`tests/test_forum_backup.py` 覆盖论坛 HF backup 基础。
- 剩余风险：当前只是后端现状定位，尚未新增红灯测试、schema 补列、health 趋势、HF 通用归档、云同步双写或导出脚本；生产 HF 桶与数据库没有执行任何真实导出或写入。后续实现需要特别注意 CloudSync 旧 Proxy 回退逻辑和 “HF 成功后才写 Turso” 的顺序冲突。
- 下一步：Task 3 定位前端统计入口与自动上传现状，确认 `MeView.vue`、`App.vue`、`cloud_sync.js`、通知/考试/成绩/课表缓存来源和缺口。

## Task 3 - 前端统计入口与自动上传现状定位

- [ ] 状态：未完成
- 目标：定位 `MeView.vue`、`App.vue`、`cloud_sync.js`、通知/考试/成绩/课表缓存来源。
- 验证：记录关键文件、函数、缓存 key 和当前缺口；不修改业务代码。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查 1（Task 1-3 后）

- [ ] 状态：未完成
- 检查范围：需求边界、数据流、风险、测试入口和是否需要拆分任务。
- 检查结果：
- 修复动作：
- 剩余风险：

## Task 4 - 后端红灯测试：health 趋势与统计 schema

- [ ] 状态：未完成
- 目标：新增/扩展 pytest，要求 `/health` 支持新增字段、`service_daily_stats` 自动补列并返回 7 天趋势。
- 验证：测试先失败，失败原因指向缺少字段/函数。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 5 - 后端实现：service_stats 与 /health 扩展

- [ ] 状态：未完成
- 目标：实现统计表补列、趋势查询、运行时长、最新版本人数在 `/health` 中兼容返回。
- 验证：Task 4 测试通过；现有健康字段不回归。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 6 - 后端红灯测试：cloud_sync 版本列与 HF 先写

- [ ] 状态：未完成
- 目标：测试 `cloud_sync_records` 自动补列 `client_version`/`payload_schema_version`，以及 HF 归档成功后才写数据库。
- 验证：测试先失败，失败原因指向缺少 schema/归档顺序。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查 2（Task 4-6 后）

- [ ] 状态：未完成
- 检查范围：后端测试红绿完整性、向后兼容、是否触碰生产数据。
- 检查结果：
- 修复动作：
- 剩余风险：

## Task 7 - 后端实现：HF 归档模块、云同步双写、全量导出能力

- [ ] 状态：未完成
- 目标：新增 HF archive 模块，接入上传链路，提供导出脚本/受保护接口和 health 状态。
- 验证：Task 6 测试通过；导出 dry-run 本地可测。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 8 - 前端红灯测试：服务统计页路由与 health 兼容解析

- [ ] 状态：未完成
- 目标：新增/扩展 Vitest，要求 `MeView` 有服务统计入口、`App.vue` 支持 `service_stats`、统计页兼容旧 `/health`。
- 验证：测试先失败，失败原因指向缺少页面/路由/解析。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 9 - 前端实现：服务统计入口与独立统计页

- [ ] 状态：未完成
- 目标：新增 `ServiceStatsView.vue`，接入 `MeView.vue` 与 `App.vue`，实现总览和 7 天趋势。
- 验证：Task 8 测试通过；页面加载/刷新/错误态逻辑可测。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查 3（Task 7-9 后）

- [ ] 状态：未完成
- 检查范围：前后端接口契约、UI/UX、错误态、兼容旧 health 返回。
- 检查结果：
- 修复动作：
- 剩余风险：

## Task 10 - 前端红灯测试：cloud_sync payload 与本地重传签名

- [ ] 状态：未完成
- 目标：测试上传 payload 包含 client/notify/exams/课程标识，关键签名或版本变化触发重传，在飞任务复用。
- 验证：测试先失败，失败原因指向缺少 payload 字段/签名逻辑。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 11 - 前端实现：自动上传 payload 扩展与本地变化检测

- [ ] 状态：未完成
- 目标：扩展 `cloud_sync.js`，采集版本、通知、考试、成绩/课表课程标识，并持久化上传签名/版本/原因。
- 验证：Task 10 测试通过；旧数据缺失不崩溃。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 12 - secrets 文件与配置文档更新

- [ ] 状态：未完成
- 目标：如新增环境变量，更新本机 secrets 提示文件，不写入真实敏感值到仓库。
- 验证：本机文件包含新增 env key 说明；仓库 diff 不含 secret。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查 4（Task 10-12 后）

- [ ] 状态：未完成
- 检查范围：上传数据隐私、secret 泄露、自动重传并发、兼容旧客户端。
- 检查结果：
- 修复动作：
- 剩余风险：

## Task 13 - 后端项目级验证

- [ ] 状态：未完成
- 目标：运行后端相关 pytest/静态检查，单命令不超过 60 秒。
- 验证：记录通过/失败与根因。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 14 - 前端项目级验证

- [ ] 状态：未完成
- 目标：运行前端相关 Vitest、构建或类型检查，单命令不超过 60 秒。
- 验证：记录通过/失败与根因。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 15 - 最终 review、提交与 goal 完成

- [ ] 状态：未完成
- 目标：全面 review C 端体验、代码、安全性、数据一致性、权限、错误处理、测试、构建、文档和回滚；若有代码修改则提交。
- 验证：无已知高风险问题；goal 标记完成。
- 实际变更：
- 验证结果：
- 剩余风险：
- 下一步：

## 最终最大 review

- [ ] 状态：未完成
- 检查范围：C 端体验、代码质量、安全性、数据一致性、权限、错误处理、测试、构建、文档、回滚。
- 检查结果：
- 修复动作：
- 最终结论：
