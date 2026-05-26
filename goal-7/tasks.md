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

- [x] 状态：已完成
- 目标：定位 `MeView.vue`、`App.vue`、`cloud_sync.js`、通知/考试/成绩/课表缓存来源。
- 验证：记录关键文件、函数、缓存 key 和当前缺口；不修改业务代码。
- 实际变更：只读检查 Tauri 前端代码，定位“我的”页功能宫格、应用视图注册、云同步 payload 构造、自动登录上传、通知快照、考试/成绩/课表缓存来源；本轮未修改 `src/`、`src-tauri/` 或 OCR 后端业务代码。
- 验证结果：
  - “我的”页入口位于 `src/components/MeView.vue`。`defineEmits` 当前包含 `navigate`，已有 `goStudentInfo()` 发出 `studentinfo`、`handleOpenExport()` 发出 `export_center`、`handleOpenMore()` 发出 `more`；功能宫格在 `MeView.vue:134` 起，当前已有官方帖子、设置中心、导出中心、配置工具、检查更新、意见反馈、开源协议、赞助、更多，尚无“服务统计”入口。后续应新增登录后可见的按钮，点击 `emit('navigate', 'service_stats')`。
  - `src/App.vue` 的异步页面注册在 `App.vue:63` 到 `App.vue:123`，当前没有 `loadServiceStatsView` / `ServiceStatsView`；`ME_SUB_VIEWS` 位于 `App.vue:161` 到 `App.vue:170`，当前没有 `service_stats`；`HIERARCHICAL_PARENT_VIEW_MAP` 位于 `App.vue:172` 到 `App.vue:185`，当前没有 `service_stats: 'me'`；`VIEW_PREFETCHERS` 位于 `App.vue:192` 到 `App.vue:223`，当前没有 `service_stats`；模板分支在 `App.vue:2691` 到 `App.vue:2756` 附近，当前只有 `MeView`、`OfficialView`、`FeedbackView`、`ConfigEditor`、`SettingsView`、`ExportCenterView`、`MoreView` 等，没有统计页分支。
  - `App.vue` 导航机制已支持普通子视图：`handleNavigate()` 位于 `App.vue:1446` 起，最终走 `goToView()` / `goToViewInternal()`；`applyViewState()` 在 `App.vue:1228` 到 `App.vue:1242` 中通过 `ME_SUB_VIEWS` 把子页面归属到 `me` tab；`resolveParentView()` 依赖 `HIERARCHICAL_PARENT_VIEW_MAP`。因此 `service_stats` 只需按现有子页面接入，不应成为底部 tab。
  - 视图门禁当前为空：`src/utils/daily_access_key.js:10` 到 `daily_access_key.js:12` 的 `PROTECTED_VIEWS` 是空数组；因此“服务统计”入口的登录限制应放在 `MeView.vue` 的按钮 `v-if="isLoggedIn"` 或统计页自身空态，不需要接每日秘钥门禁。
  - 当前版本号入口已存在：`src/utils/updater.js:477` 到 `updater.js:485` 的 `getCurrentVersion()` 优先读 `import.meta.env.VITE_APP_VERSION`，再通过 `src/platform/native.ts:80` 到 `native.ts:94` 的 `getNativeAppVersion()` 兼容 Tauri `@tauri-apps/api/app.getVersion` 和 Capacitor `App.getInfo().version`，Web 回退 `1.0.0`。后续云同步 `client.version` 可复用该函数。
  - 本地缓存格式由 `src/utils/api.js` 统一维护：`getCacheKey(key)` 返回 `cache:${key}`，`getCachedData()` 读取 `{ data, timestamp }`，`setCachedData()` 写入同结构。后续云同步读考试、成绩、课表缓存时应沿用 `cache:` 前缀和该结构，避免直接假设裸数据。
  - `src/utils/cloud_sync.js` 当前 `SYNC_SCHEMA_VERSION = 3`；`buildSyncPayload()` 位于 `cloud_sync.js:729` 到 `cloud_sync.js:762`，当前只写 `v`、`sid`、`ts`、`did`，可选 `settings`、`courses`、`academic`，尚无 `client`、`notify`、`academic.exams`。后续应升级 schema 到 4，并兼容旧 payload。
  - 当前设置快照在 `buildSyncPayload()` 内直接读取 `hbu_app_settings_v1`、`hbu_ui_settings_v2`、`hbu_font_settings_v1`、`hbu_login_entry_mode`、`hbu_login_method`、`hbu_remember`；可作为综合签名的一部分。
  - 成绩快照由 `normalizeGradeItem()`、`buildGradeSnapshot()` 生成。`normalizeGradeItem()` 当前保留原始 item，显式规范 `grade_id` 和 `course_code`，但没有显式规范 `course_id`；后续应补充 `course_id: item.course_id || item.courseId || item.kcid || item.kch_id` 等稳定标识，同时继续保留原始字段。
  - 课表快照由 `buildScheduleSnapshot()` 读取 `schedule:${sid}:${semester}` 缓存并通过 `normalizeSchedulePayload()` 基本原样保存；缓存来源可见于 `src/utils/schedule_prefetch.js:514` 到 `schedule_prefetch.js:518`，同时维护 `schedule:${sid}:${semester}` 和 `schedule:${sid}`。自定义课程上传走 `fetchAllCustomCourses()` 和 `normalizeCloudCourse()`，但 `normalizeCloudCourse()` 当前只保留 `name/teacher/room/weekday/period/djs/weeks`，丢失 `course_id/source_id/id`，后续必须补齐课程标识。
  - 考试缓存来源有两条：`src/components/ExamView.vue:130` 使用 `exams:${studentId}:${selectedSemester || 'current'}`；`src/utils/notify_center.js:590` 使用 `exams:${studentId}:current`。`cloud_sync.js` 当前 `primeAcademicCaches()` 只拉取 `/v2/quick_fetch`、`/v2/student_info`、`/v2/schedule/query`、`/v2/ranking`，没有拉取 `/v2/exams`，`buildAcademicSnapshot()` 也没有 `exams` 字段；后续需要新增考试缓存预热和 `buildExamSnapshot()`。
  - 通知快照入口已存在：`src/utils/notify_center.js:28` 导出 `NOTIFY_SNAPSHOT_EVENT`，`snapshotKeyFor()` 使用 `hbu_notify_snapshot:${studentId}`，`gradeSigKeyFor()` 使用 `hbu_notify_grade_signature:${studentId}`，`examSigKeyFor()` 使用 `hbu_notify_exam_tomorrow:${studentId}`；`getLastNotifySnapshot(studentId)` 和 `getNotificationMonitorSettings()` 在 `notify_center.js:1252` 到 `notify_center.js:1254` 导出，可供云同步 payload 和签名使用。
  - 自动上传链路在 `src/utils/cloud_sync.js:1481` 到 `cloud_sync.js:1548` 的 `runAutoCloudSyncAfterLogin()`。现有同学号在飞任务复用逻辑已存在：`autoCloudSyncInFlight.studentId/promise`；登录后触发点在 `src/App.vue:1379` 到 `App.vue:1420`，恢复/重登录触发点在 `App.vue:1663` 到 `App.vue:1670`、`App.vue:2165` 到 `App.vue:2172`。当前没有监听 `NOTIFY_SNAPSHOT_EVENT` 或本地综合签名变化，也没有持久化“上次成功上传版本号 / 综合签名 / 最近重传原因”。
  - `runCloudSyncUpload()` 位于 `cloud_sync.js:1195` 到 `cloud_sync.js:1306`，当前请求 body 包含 `student_id`、`device_id`、`reason`、`payload`、`client_time`、`secret_ref`、`sections`、`custom_courses_mode`，没有顶层 `client_version`。后续应在 payload 内写 `client.version`，同时在 body 顶层写 `client_version` 供后端直接入列统计。
  - 现有前端测试没有覆盖 `cloud_sync.js`：`rg` 只找到 `updater_download_sources.spec.ts`、`SettingsView.spec.ts`、若干 widget/forum 测试；没有 `cloud_sync`、`MeView`、`App.vue service_stats` 相关契约测试。Task 8/10 需要新增文本契约或轻量单测作为红灯测试。
  - 当前工作区有大量用户/历史脏改和删除项，包括 `.playwright-mcp/*.yml`、`debug-captures/*`、`tmp-live-home.js`、`src-tauri/Cargo.toml`、`src/components/RankingView.vue`、`src/components/UpdateDialog.vue`、`src/utils/updater_download_sources.spec.ts`、未跟踪 `RELEASE_v1.4.0.md` 与 `src/utils/ranking_view_contract.spec.ts`；本轮没有修改这些文件，后续提交必须继续只暂存本任务相关文件。
- 剩余风险：当前仍是现状定位，尚未新增统计页、payload 字段、考试预热、通知签名监听或本地重传记录；`cloud_sync.js` 里的多个构造函数未导出，后续写单测可能需要谨慎选择“文本契约测试”或最小导出辅助函数，避免大范围重构。自动重传若监听过多本地事件，可能引发登录后短时间多次上传，后续实现必须复用现有在飞任务并做签名去重。
- 下一步：执行“大型全面检查 1”，核对 Task 1-3 的需求边界、前后端数据流、风险和测试拆分是否完整，然后再进入后端红灯测试 Task 4。

## 大型全面检查 1（Task 1-3 后）

- [x] 状态：已完成
- 检查范围：需求边界、数据流、风险、测试入口和是否需要拆分任务。
- 检查结果：
  - 需求边界未偏离：Task 1-3 只完成 goal 建立和前后端现状定位，尚未把“服务统计页、/health 扩展、HF 私有桶双保险、云同步 payload 扩展、本地重传检测、secrets 文件更新、最终验证”错误缩小为较小目标。
  - 后端数据流已足够支撑 Task 4 红灯测试：`runtime/entrypoint.py` 的 `/health`、`modules/service_stats.py` 的 `service_daily_stats/service_daily_usage`、`modules/cloud_sync_storage.py` 的 `cloud_sync_records`、现有 `HFPrivateBucketStorage` 和论坛/服务表来源均已定位；缺口与后续测试目标一致。
  - 前端数据流已足够支撑 Task 8/10 红灯测试：`MeView.vue` 入口、`App.vue` 子视图机制、`cloud_sync.js` payload/自动上传链路、`notify_center.js` 通知快照、考试/成绩/课表缓存 key、版本号获取入口均已定位；缺口与后续测试目标一致。
  - 风险边界明确：真实 HF 私有桶写入、生产 Turso/SQLPub 导出、数据库结构变更和 secret 变更都属于高风险操作；实现阶段必须先走测试、dry-run、本地 fake 或受保护接口，不能在未确认前执行生产写入或导出。
  - 当前工作区存在大量与本 goal 无关的脏改/删除项，`tauri-app` 包括 `.playwright-mcp/*` 删除、`debug-captures/*` 删除、`src-tauri/Cargo.toml`、`RankingView.vue`、`UpdateDialog.vue`、`updater_download_sources.spec.ts` 等；`ocr-service` 有未跟踪 `data/` 和 `scripts/utf8.ps1`。后续每轮提交必须只暂存本任务相关文件。
  - 测试拆分总体可执行：Task 4/5 覆盖 `/health` 与统计 schema；Task 6/7 覆盖 cloud sync 版本列、HF 先写、导出能力；Task 8/9 覆盖统计页；Task 10/11 覆盖前端自动上传和重传签名；Task 12-15 覆盖 secrets 与项目级验证。
  - 需要特别关注的拆分风险：Task 7 同时包含 HF archive 模块、云同步双写、导出脚本/管理接口和 health 状态，实际执行时应在同一任务内按“归档基础 -> 上传链路 -> 导出 dry-run -> health 状态”小步落地，并避免一次性大改无测试支撑。
- 修复动作：本轮不修改业务代码；只把前三个任务后的全面检查结果写入任务清单，保留后续红灯测试先行顺序，并明确 Task 7 的内部小步执行约束。
- 剩余风险：尚未运行后端/前端测试，因为本轮是计划检查任务；后续 Task 4 开始必须先新增失败测试。生产 HF 桶与数据库仍未触碰，最终实现前必须继续确认仓库 diff 不含 secret，且 secrets 文件更新只能写本机提示键名或占位说明。

## Task 4 - 后端红灯测试：health 趋势与统计 schema

- [x] 状态：已完成
- 目标：新增/扩展 pytest，要求 `/health` 支持新增字段、`service_daily_stats` 自动补列并返回 7 天趋势。
- 验证：测试先失败，失败原因指向缺少字段/函数。
- 实际变更：
  - 在 `D:\Documents\C_learn\成绩查询\ocr-service\tests\test_service_stats_persistence.py` 新增 `test_ensure_table_backfills_latest_version_snapshot_columns`，要求 `ensure_table()` 除建表外还对既有 `service_daily_stats` 自动补列 `latest_version` 和 `latest_version_user_count`。
  - 在同一文件新增 `test_get_health_trend_returns_usage_and_snapshot_totals`，要求 `modules.service_stats.get_health_trend(days, end_day)` 返回近 7 天 health 趋势所需字段：`ocr_count`、`upload_count`、`grade_dist_query_count`、`cloud_sync_total`、`latest_version`、`latest_version_user_count`。
  - 新增 `D:\Documents\C_learn\成绩查询\ocr-service\tests\test_service_health_contract.py`，用 `TestClient` 请求 OCR 主 `/health`，断言保留 `status`、`ocr_concurrency`、`upload_concurrency`、`temp_storage`，并新增 `service`、`daily_usage.grade_dist_query_count`、`cloud_sync.latest_version`、`cloud_sync.latest_version_user_count`、`trend.last_7_days`、`hf_bucket`、`archive_status` 契约。
- 验证结果：
  - 已运行：`python -m pytest tests/test_service_stats_persistence.py tests/test_service_health_contract.py -q`
  - 结果：`3 failed, 8 passed, 32 warnings in 5.14s`，符合红灯预期。
  - 失败 1：`test_ensure_table_backfills_latest_version_snapshot_columns` 断言失败，当前 `ensure_table()` 只执行 `CREATE TABLE`，没有 `ADD COLUMN latest_version` / `ADD COLUMN latest_version_user_count`。
  - 失败 2：`test_get_health_trend_returns_usage_and_snapshot_totals` 抛出 `AttributeError: module 'modules.service_stats' has no attribute 'get_health_trend'`，说明 health 趋势查询函数尚未实现。
  - 失败 3：`test_health_exposes_service_stats_and_trend_contract` 抛出 `KeyError: 'service'`，说明 `/health` 尚未返回新增 `service` 块和后续统计/归档字段。
- 剩余风险：当前仅新增红灯测试，没有实现任何生产代码；测试中对 `_get_latest_version_summary` 使用 `raising=False` 做未来接口契约占位，Task 5 实现时需要决定该函数的真实名称/职责，并保持测试表达的外部契约不变。测试运行日志有 Windows 控制台编码乱码和 FastAPI `on_event` deprecation warning，但不影响红灯判断。
- 下一步：Task 5 实现 `service_stats` 补列、`get_health_trend()`、`/health` 新增字段、运行时长、最新版本人数占位/查询入口，并让 Task 4 新增测试通过且现有健康字段不回归。

## Task 5 - 后端实现：service_stats 与 /health 扩展

- [x] 状态：已完成
- 目标：实现统计表补列、趋势查询、运行时长、最新版本人数在 `/health` 中兼容返回。
- 验证：Task 4 测试通过；现有健康字段不回归。
- 实际变更：
  - 修改 `D:\Documents\C_learn\成绩查询\ocr-service\modules\service_stats.py`：`service_daily_stats` 新增 `latest_version`、`latest_version_user_count` 字段；`ensure_table()` 启动时自动补列并兼容重复列；`save_snapshot()` 保存最新版本摘要；新增 `get_health_trend()` 聚合 `service_daily_usage` 与每日最新快照；`get_recent_stats()` 返回新增字段。
  - 修改 `D:\Documents\C_learn\成绩查询\ocr-service\runtime\entrypoint.py`：`/health` 保留原有 `status`、`ocr_maintenance`、`daily_usage`、`cloud_sync`、`grade_distribution`、并发与临时存储字段，并新增 `service`、`daily_usage.grade_dist_query_count`、`cloud_sync.latest_version`、`cloud_sync.latest_version_user_count`、`trend.last_7_days`、`hf_bucket`、`archive_status`。
  - `runtime/entrypoint.py` 新增最新版本摘要查询入口、HF 桶只读状态占位、归档状态占位、趋势行规范化和今日内存统计补齐；`_stats_save_loop()` 保存快照时同步写入最新版本摘要。
- 验证结果：
  - 已运行 `python -m pytest tests/test_service_stats_persistence.py tests/test_service_health_contract.py -q`，结果 `11 passed, 32 warnings in 1.56s`。
  - 已运行 `python -m pytest tests/test_forum_integration.py tests/test_service_stats_persistence.py tests/test_service_health_contract.py -q`，结果 `14 passed, 44 warnings in 2.57s`。
  - 已运行 `git diff --check -- modules\service_stats.py runtime\entrypoint.py`，退出码 0；仅有 Windows 换行提示，无空白错误。
- 剩余风险：
  - `_get_latest_version_summary()` 当前只支持从环境变量读取最新稳定版本并按 `client_version` 查询；`cloud_sync_records.client_version` 补列和正式更新源解析将在 Task 6/7 继续实现。
  - `hf_bucket` 与 `archive_status` 当前是只读/占位状态，未执行 HF 上传或生产数据库导出，真正双保险链路留给后续任务。
  - 测试仍有 FastAPI `on_event` deprecation warning，属于既有框架迁移提醒，本任务不处理。
- 下一步：Task 6 新增后端红灯测试，覆盖 `cloud_sync_records` 版本列、payload schema 列以及“HF 归档成功后才写数据库”的顺序契约。

## Task 6 - 后端红灯测试：cloud_sync 版本列与 HF 先写

- [x] 状态：已完成
- 目标：测试 `cloud_sync_records` 自动补列 `client_version`/`payload_schema_version`，以及 HF 归档成功后才写数据库。
- 验证：测试先失败，失败原因指向缺少 schema/归档顺序。
- 实际变更：
  - 新增 `D:\Documents\C_learn\成绩查询\ocr-service\tests\test_cloud_sync_archive_contract.py`，覆盖 Turso `cloud_sync_records` schema 自动补列 `client_version` 和 `payload_schema_version`。
  - 同一测试文件新增 cloud-sync 上传顺序契约：HF 归档必须先于 Turso 写入；如果 HF 归档失败且 `HF_ARCHIVE_REQUIRE_BEFORE_DB=true`，接口应返回错误且不能写 Turso。
  - 测试使用 monkeypatch/fake storage，不访问真实 HF Bucket、Turso 或 SQLPub。
- 验证结果：
  - 已运行 `python -m pytest tests/test_cloud_sync_archive_contract.py -q`，结果 `3 failed, 12 warnings in 1.25s`，符合红灯预期。
  - 失败 1：`test_turso_cloud_sync_schema_backfills_client_version_columns` 断言 `client_version` 不在建表/补列 SQL 中，说明 schema 尚未扩展。
  - 失败 2：`test_cloud_sync_upload_archives_to_hf_before_turso` 事件顺序实际只有 `db`，没有先执行 `hf`，说明上传链路还未接入 HF 归档前置。
  - 失败 3：`test_cloud_sync_upload_rejects_when_hf_archive_fails` 实际返回 200，说明 HF 归档失败时当前仍会继续写库。
- 剩余风险：当前只是红灯测试，没有实现 HF 归档模块、pending replay 状态、cloud_sync_records 补列、client_version 写入或导出 dry-run；后续 Task 7 必须让这些测试转绿，并继续避免真实生产写入。
- 下一步：执行“大型全面检查 2”，复核 Task 4-6 的红绿闭环、后端兼容性和是否触碰生产数据；之后进入 Task 7 实现。

## 大型全面检查 2（Task 4-6 后）

- [x] 状态：已完成
- 检查范围：后端测试红绿完整性、向后兼容、是否触碰生产数据。
- 检查结果：
  - Task 4/5 的后端健康统计实现仍保持绿灯：已复跑 `python -m pytest tests/test_forum_integration.py tests/test_service_stats_persistence.py tests/test_service_health_contract.py -q`，结果 `14 passed, 44 warnings in 2.17s`。
  - Task 6 的后端红灯测试仍准确失败：已复跑 `python -m pytest tests/test_cloud_sync_archive_contract.py -q`，结果 `3 failed, 12 warnings in 1.13s`。
  - 红灯失败原因与需求缺口一致：Turso `cloud_sync_records` 尚未包含 `client_version` / `payload_schema_version`；cloud-sync 上传尚未先执行 HF 归档；HF 归档失败时当前仍会继续写 Turso。
  - 向后兼容检查：`/health`、`service_daily_stats`、论坛集成相关测试未回归；新增 Task 6 测试使用 fake storage 和 monkeypatch，没有访问真实 HF Bucket、Turso 或 SQLPub。
  - 生产数据边界检查：本阶段没有执行生产数据库导出、生产写入、HF 上传或 secrets 修改；`ocr-service` 当前仅有未跟踪 `data/`、`scripts/utf8.ps1`，未纳入本 goal 提交。
- 修复动作：
  - 本轮不修改业务代码，只做检查记录；确认 Task 7 需要按“schema 补列 -> client_version 写入 -> HF 归档前置 -> pending replay/health 状态 -> dry-run 导出”顺序小步实现。
- 剩余风险：
  - Task 7 范围较大，必须继续避免真实生产写入；HF 归档实现需要 fake storage 测试先行，并保证 `HF_ARCHIVE_ENABLED=false` 时旧上传链路可用。
  - 当前 `archive_status.pending_replay_count` 仍是占位，尚未与 Turso 失败后的 HF 对象保留状态联动。
  - FastAPI `on_event` deprecation warning 仍存在，属于既有框架迁移提醒，本阶段不处理。

## Task 7 - 后端实现：HF 归档模块、云同步双写、全量导出能力

- [x] 状态：已完成
- 目标：新增 HF archive 模块，接入上传链路，提供导出脚本/受保护接口和 health 状态。
- 验证：Task 6 测试通过；导出 dry-run 本地可测。
- 实际变更：
  - 新增 `D:\Documents\C_learn\成绩查询\ocr-service\modules\service_archive.py`，定义 Turso/SQLPub 服务表导出清单、cloud-sync 事件远端路径、HF 私有桶事件归档封装，以及 `create_service_export_dry_run()` 本地 dry-run 导出能力；dry-run 只生成本地 zip 与 manifest，不读取真实数据库、不上传 HF。
  - 修改 `D:\Documents\C_learn\成绩查询\ocr-service\modules\cloud_sync_storage.py`：`cloud_sync_records` 建表和启动补列新增 `client_version`、`payload_schema_version`；`upload()` 支持写入顶层版本号和 payload schema 版本，旧客户端缺字段时从 payload 或默认值兼容。
  - 修改 `D:\Documents\C_learn\成绩查询\ocr-service\runtime\entrypoint.py`：`CloudSyncUploadRequest` 新增 `client_version`；上传合并逻辑保留顶层 `client` 元数据；Turso 上传链路改为先执行 `_archive_cloud_sync_upload()`，成功后才写 Turso；HF 归档失败且 `HF_ARCHIVE_REQUIRE_BEFORE_DB=true` 时直接返回 503，不写数据库。
  - `runtime/entrypoint.py` 新增归档运行状态：`pending_replay_count`、`last_archive_at`、`last_archive_path`、`last_error`；当 HF 已归档但 Turso 后续失败时增加待重放计数，供 `/health.archive_status` 展示。
  - 新增受保护管理接口 `POST /api/admin/service-archive/export`，必须配置并传入 `HF_ARCHIVE_ADMIN_SECRET`，当前只允许 `dry_run=true`；导出目录由 `HF_ARCHIVE_EXPORT_DIR` 控制；`stamp` 限定为 `YYYYMMDD-HHMMSS`，避免路径穿越。
  - 新增/扩展 `D:\Documents\C_learn\成绩查询\ocr-service\tests\test_service_archive_export.py`，覆盖 dry-run manifest/zip 产物、管理接口 secret 保护、非法 stamp 返回 400。
- 验证结果：
  - 红灯确认：`python -m pytest tests/test_service_archive_export.py -q` 初始失败于 `ModuleNotFoundError: No module named 'modules.service_archive'`；`python -m pytest tests/test_cloud_sync_archive_contract.py -q` 初始 3 项失败，分别指向 schema 缺列、未先 HF 归档、HF 失败仍写库。
  - 聚焦验证：`python -m pytest tests/test_cloud_sync_archive_contract.py tests/test_service_archive_export.py -q` 通过，`4 passed, 13 warnings`。
  - 管理接口安全红灯：新增 `stamp="../escape"` 用例后先失败为 500；补白名单校验后 `python -m pytest tests/test_service_archive_export.py -q` 通过，`2 passed, 8 warnings`。
  - cloud-sync 聚焦验证：`python -m pytest tests/test_cloud_sync_archive_contract.py -q` 通过，`3 passed, 12 warnings`。
  - 后端回归：`python -m pytest tests/test_forum_integration.py tests/test_service_stats_persistence.py tests/test_service_health_contract.py tests/test_cloud_sync_archive_contract.py tests/test_service_archive_export.py -q` 通过，`19 passed, 56 warnings in 2.81s`。
  - 空白检查：`git diff --check -- modules/cloud_sync_storage.py runtime/entrypoint.py modules/service_archive.py tests/test_service_archive_export.py` 退出码 0。
  - secret 检查：只发现环境变量名、原有脱敏日志字段和配置读取代码，没有新增真实 token、数据库密码或 HF token。
- 剩余风险：
  - 当前只实现并验证 dry-run 导出和 cloud-sync 单事件 HF 前置归档；真实 Turso/SQLPub 全量读取并上传 HF 私有桶、定时导出任务仍未执行，生产导出仍需后续显式确认或后续任务补充。
  - `pending_replay_count` 目前是进程内状态，服务重启后不持久化；后续若要真实补偿重放，需要落本地或表内队列。
  - `HF_ARCHIVE_ENABLED=false` 时保持旧上传链路；线上启用 `HF_ARCHIVE_REQUIRE_BEFORE_DB=true` 后，如果 HF token/bucket 配置不完整，cloud-sync Turso 上传会被 503 阻断，需要部署前确认环境变量。
  - FastAPI `on_event` deprecation warning 仍为既有框架迁移提醒，本任务不处理。
- 下一步：Task 8 新增前端红灯测试，覆盖“我的”页服务统计入口、`App.vue` 的 `service_stats` 路由映射，以及统计页对旧 `/health` 返回的兼容解析。

## Task 8 - 前端红灯测试：服务统计页路由与 health 兼容解析

- [x] 状态：已完成
- 目标：新增/扩展 Vitest，要求 `MeView` 有服务统计入口、`App.vue` 支持 `service_stats`、统计页兼容旧 `/health`。
- 验证：测试先失败，失败原因指向缺少页面/路由/解析。
- 实际变更：
  - 新增 `src/utils/service_stats_view_contract.spec.ts`，采用项目现有源码契约测试风格，覆盖三条前端契约：
    - `MeView.vue` 登录后应显示“服务统计”入口，并通过 `emit('navigate', 'service_stats')` 进入统计页。
    - `App.vue` 应注册 `loadServiceStatsView` / `ServiceStatsView`，把 `service_stats` 纳入 `ME_SUB_VIEWS`、`HIERARCHICAL_PARENT_VIEW_MAP`、`VIEW_PREFETCHERS` 和模板渲染分支。
    - `ServiceStatsView.vue` 应固定读取 `https://mini-hbut-ocr-service.hf.space/health`，提供 `normalizeServiceHealth`，兼容缺少 `trend.last_7_days`、`latest_version_user_count` 等旧 `/health` 字段，并具备加载失败、趋势空态和 60 秒刷新契约。
- 验证结果：
  - 已运行 `npx vitest run src/utils/service_stats_view_contract.spec.ts`。
  - 结果：`1 failed` test file，`3 failed` tests，符合 Task 8 红灯预期。
  - 失败 1：`adds a logged-in Me page entry that navigates to service_stats`，当前 `MeView.vue` 缺少 `handleOpenServiceStats`、`@click="handleOpenServiceStats"` 和“服务统计”入口。
  - 失败 2：`registers service_stats as a Me sub view in App.vue`，当前 `App.vue` 缺少 `loadServiceStatsView`、`ServiceStatsView`、`service_stats` 子视图映射和模板分支。
  - 失败 3：`provides a service stats page that tolerates old /health responses`，当前 `src/components/ServiceStatsView.vue` 文件不存在。
- 剩余风险：
  - 当前只新增红灯测试，没有实现统计入口、页面、请求、刷新、错误态或兼容解析；Task 9 必须让这些契约转绿。
  - 源码契约测试对字符串比较较敏感，Task 9 实现时要么按契约命名，要么同步调整测试到同等明确的可验证契约。
  - 工作区仍有大量与本 goal 无关的删除/修改项，本轮提交只应包含 `src/utils/service_stats_view_contract.spec.ts` 和 `goal-7/tasks.md`。
- 下一步：Task 9 实现 `ServiceStatsView.vue`，在 `MeView.vue` 和 `App.vue` 接入 `service_stats`，并运行新增 Vitest 让红灯测试转绿。

## Task 9 - 前端实现：服务统计入口与独立统计页

- [x] 状态：已完成
- 目标：新增 `ServiceStatsView.vue`，接入 `MeView.vue` 与 `App.vue`，实现总览和 7 天趋势。
- 验证：Task 8 测试通过；页面加载/刷新/错误态逻辑可测。
- 实际变更：
- 修改 `src/components/MeView.vue`：新增登录后可见的“服务统计”功能宫格入口，点击后通过 `emit('navigate', 'service_stats')` 进入统计页。
- 修改 `src/App.vue`：新增 `loadServiceStatsView` / `ServiceStatsView` 异步页面注册，把 `service_stats` 纳入 `ME_SUB_VIEWS`、`HIERARCHICAL_PARENT_VIEW_MAP`、`VIEW_PREFETCHERS`，并在模板中接入 `ServiceStatsView` 与 `@back="handleBackToMe"`。
- 新增 `src/components/ServiceStatsView.vue`：固定读取 `https://mini-hbut-ocr-service.hf.space/health`，进入页面立即加载、每 60 秒自动刷新并支持手动刷新；展示服务状态、运行时长、OCR 今日次数、课表上传、给分查询、云同步总记录、最新版本人数、HF 桶/归档状态和近 7 天轻量 SVG 趋势图。
- `ServiceStatsView.vue` 内部实现 `normalizeServiceHealth()`，兼容旧 `/health` 缺少 `trend.last_7_days`、`latest_version_user_count`、`hf_bucket` 或 `archive_status` 的情况；请求失败时显示“读取服务状态失败”，缺少趋势时显示“趋势数据暂不可用”。
- 验证结果：
- 已运行 `npx vitest run src/utils/service_stats_view_contract.spec.ts`，结果 `1 passed` test file，`3 passed` tests。
- 已运行 `git diff --check -- src/components/MeView.vue src/App.vue src/components/ServiceStatsView.vue src/utils/service_stats_view_contract.spec.ts`，退出码 0；仅出现 `App.vue` / `MeView.vue` 的 CRLF 换行提示，无空白错误。
- 已运行 `node -e "import('node:fs').then(fs=>import('@vue/compiler-sfc').then(({parse})=>{const file='src/components/ServiceStatsView.vue';const result=parse(fs.readFileSync(file,'utf8'),{filename:file});if(result.errors.length){console.error(result.errors);process.exit(1)}console.log('ServiceStatsView.vue SFC parse ok')}))"`，输出 `ServiceStatsView.vue SFC parse ok`。
- 剩余风险：
- 本轮只做源码契约测试和 SFC 解析验证，没有启动完整 Vite 页面做真机视觉验证；后续 Task 14 项目级前端验证需要覆盖构建或更大范围测试。
- 统计页直接读取线上 `/health`，若部署端 CORS 或网络访问异常，页面会进入错误态但不会影响“我的”页其它功能。
- 当前工作区仍存在大量与本 goal 无关的脏改/删除项，本轮提交需继续只暂存 Task 9 相关文件。
- 下一步：执行“大型全面检查 3”，复核 Task 7-9 的前后端接口契约、UI/UX、错误态和旧 `/health` 兼容性，然后再进入 Task 10 前端红灯测试。

## 大型全面检查 3（Task 7-9 后）

- [x] 状态：已完成
- 检查范围：前后端接口契约、UI/UX、错误态、兼容旧 health 返回。
- 检查结果：
- Task 7-9 的本地后端/前端契约仍保持一致：`runtime/entrypoint.py` 返回 `service`、`daily_usage.grade_dist_query_count`、`cloud_sync.latest_version_user_count`、`trend.last_7_days`、`hf_bucket`、`archive_status`；`ServiceStatsView.vue` 读取同一批字段并对缺失字段做默认值兼容。
- 已复跑后端相关测试：`python -m pytest tests/test_forum_integration.py tests/test_service_stats_persistence.py tests/test_service_health_contract.py tests/test_cloud_sync_archive_contract.py tests/test_service_archive_export.py -q`，结果 `19 passed, 56 warnings in 3.07s`。warnings 仍为既有 FastAPI `on_event` deprecation 提醒，不影响本轮检查结论。
- 已复跑前端统计页契约：`npx vitest run src/utils/service_stats_view_contract.spec.ts`，结果 `1 passed` test file，`3 passed` tests。
- 已复跑新统计页 SFC 解析：`ServiceStatsView.vue SFC parse ok`，未发现模板或 `<script setup>` 语法错误。
- 源码检查确认“我的”页入口只在登录后显示：`MeView.vue` 使用 `v-if="isLoggedIn"` 和 `handleOpenServiceStats`；`App.vue` 将 `service_stats` 注册为 `me` 子视图，不会成为底部 tab。
- UI/UX 检查：统计页为紧凑卡片式移动端仪表盘，使用 Material Symbols 图标和轻量 SVG 折线图，没有新增图表依赖；保留错误横幅、空趋势态和手动刷新按钮。未做真机视觉截图，因此完整视觉验证留到 Task 14。
- 线上只读检查 `https://mini-hbut-ocr-service.hf.space/health` 当前 HTTP 200，但返回仍是旧结构，只包含 `cloud_sync,daily_usage,grade_distribution,ocr_concurrency,ocr_maintenance,status,temp_storage,upload_concurrency`，缺少 `service,trend,hf_bucket,archive_status`。这说明线上 HF Space 尚未部署后端新代码；前端兼容旧结构，不会因此崩溃，但统计数据会显示默认值和“趋势数据暂不可用”。
- 生产数据边界：本轮没有执行生产 HF 写入、Turso/SQLPub 导出、数据库迁移或 secrets 修改；线上检查仅为 `/health` GET 只读请求。
- 修复动作：
- 本轮未修改业务代码；只执行检查、记录证据和部署态风险。
- 将线上 `/health` 仍为旧结构记录为后续部署/项目级验证风险，不能据此把整个 goal 标记完成。
- 剩余风险：
- 线上后端尚未体现 Task 5/7 的 `/health` 新字段和归档状态，最终完成前必须部署或通过等效环境验证。
- Task 10/11 尚未实现前端 cloud_sync payload 扩展和本地重传签名，因此“客户端版本号、通知、考试、成绩/课表课程标识上传”和“版本/数据变化立即重传”仍未完成。
- Task 14 还需要跑更大范围前端验证或构建，当前统计页 UI 只完成源码与契约级检查。
- 下一步：Task 10 新增前端红灯测试，锁定 `cloud_sync.js` 的 client/notify/exams/课程标识 payload、版本/本地签名重传和在飞任务复用契约。

## Task 10 - 前端红灯测试：cloud_sync payload 与本地重传签名

- [x] 状态：已完成
- 目标：测试上传 payload 包含 client/notify/exams/课程标识，关键签名或版本变化触发重传，在飞任务复用。
- 验证：测试先失败，失败原因指向缺少 payload 字段/签名逻辑。
- 实际变更：
- 新增 `src/utils/cloud_sync_payload_contract.spec.ts`，采用源码契约测试锁定 Task 11 需要实现的 cloud sync 上传行为。
- 测试覆盖 schema v4 和客户端元数据：要求 `SYNC_SCHEMA_VERSION = 4`，从 `getCurrentVersion()` 读取当前版本，通过 `detectRuntime()` 采集运行环境，并在上传 body 顶层传递 `client_version`。
- 测试覆盖通知与考试 payload：要求接入 `NOTIFY_SNAPSHOT_EVENT`、`getLastNotifySnapshot()`、`getNotificationMonitorSettings()`，新增 `buildNotifySnapshot()` 和 `buildExamSnapshot()`，并把 `notify` 与 `academic.exams` 写入上传 payload。
- 测试覆盖课程稳定标识：要求成绩规范化保留 `grade_id`、`course_id`、`course_code`；自定义课程保留 `course_id`、`source_id`；课表快照保留课程原始标识。
- 测试覆盖本地变化触发：要求新增自动上传元数据前缀、综合签名构建、上次上传版本/签名/原因持久化，监听通知快照变更并复用同学号在飞任务。
- 验证结果：
- 已运行 `npx vitest run src/utils/cloud_sync_payload_contract.spec.ts`。
- 结果：`1 failed` test file，`4 failed` tests，符合 Task 10 红灯预期。
- 失败 1：`builds schema v4 payloads with explicit client version and runtime metadata`，当前仍是 `SYNC_SCHEMA_VERSION = 3`，没有 client snapshot、版本/运行时采集和顶层 `client_version`。
- 失败 2：`uploads notification snapshots and exam arrangements as first-class payload sections`，当前 `cloud_sync.js` 未接入通知快照事件/读取器，也没有 `notify` 或 `academic.exams`。
- 失败 3：`keeps stable course identifiers for grades, custom courses, and schedule courses`，当前成绩未规范 `course_id`，自定义课程未保留 `course_id/source_id`，课表课程标识契约未锁定。
- 失败 4：`detects local signature or version changes and reuses in-flight auto upload tasks`，当前没有自动上传元数据、综合签名、上次版本/签名/原因持久化或通知变化监听；已有同学号在飞任务复用逻辑存在，Task 11 实现时需要保留。
- 剩余风险：
- 当前只新增红灯测试，没有修改 `cloud_sync.js` 生产逻辑；Task 11 必须让该测试转绿并尽量补充可执行行为验证。
- 源码契约测试会对命名有一定约束，Task 11 如采用不同命名，需要同步调整测试到同等明确的行为契约。
- 本轮未访问网络、后端或任何生产数据。
- 下一步：Task 11 实现 `cloud_sync.js`：采集版本、通知、考试、课程标识，扩展上传 body 顶层 `client_version`，新增本地综合签名/版本变化立即重传和元数据持久化。

## Task 11 - 前端实现：自动上传 payload 扩展与本地变化检测

- [x] 状态：已完成
- 目标：扩展 `cloud_sync.js`，采集版本、通知、考试、成绩/课表课程标识，并持久化上传签名/版本/原因。
- 验证：Task 10 测试通过；旧数据缺失不崩溃。
- 实际变更：
- 修改 `src/utils/cloud_sync.js`：云同步 schema 升级到 v4，上传 payload 新增 `client.version/platform/runtime` 与 `notify.snapshot/settings`，上传 body 顶层新增 `client_version`，便于后端直接统计版本人数。
- 扩展学业快照：成绩规范化保留 `course_id`、`grade_id`、`course_code`；课表快照规范保留 `course_id`、`source_id`、`raw_course_id`；自动缓存预热新增 `/v2/exams` 并把考试安排写入 `academic.exams`。
- 新增本地自动上传元数据：`lastUploadVersion`、`lastUploadSignature`、`lastAutoResyncReason`、待上传版本/签名和最近上传时间；综合签名覆盖版本、设置、通知、考试、成绩、课表等关键快照。
- 自动同步逻辑保留登录后原有“先下载再上传”，并在版本变化或本地签名变化时把上传 reason 标记为 `auto-version-change` / `auto-signature-change`；同学号在飞任务复用逻辑保留。
- 监听 `NOTIFY_SNAPSHOT_EVENT`：通知快照变化时触发一次只上传、不先下载的自动同步，避免云端旧数据覆盖本地刚变化的通知快照。
- 验证结果：
- 红灯验证已在 Task 10 完成：`npx vitest run src/utils/cloud_sync_payload_contract.spec.ts` 初始 4 项失败，指向 schema v4、client/notify/exams、课程标识和自动上传元数据缺失。
- 聚焦验证：`npx vitest run src/utils/cloud_sync_payload_contract.spec.ts` 通过，`1 passed` test file，`4 passed` tests。
- 回归验证：`npx vitest run src/platform/runtime.spec.ts src/utils/cloud_sync_payload_contract.spec.ts src/utils/service_stats_view_contract.spec.ts` 通过，`3 passed` test files，`9 passed` tests。
- 空白检查：`git diff --check -- src/utils/cloud_sync.js src/utils/cloud_sync_payload_contract.spec.ts goal-7/tasks.md` 退出码 0；仅提示 `cloud_sync.js` 将被 Git 触碰时转换为 CRLF，无空白错误。
- 剩余风险：
- 目前新增的是前端本地签名与上传链路，尚未跑完整前端构建；Task 14 需要做更大范围前端验证。
- 通知快照变化会立即触发自动上传，并通过同学号在飞任务复用降低并发风险；如果通知模块短时间连续多次派发事件，仍可能在前一轮结束后再次上传，后续全面检查需要关注频率。
- 上传 payload 包含更完整的学业/通知快照，属于用户已有云同步数据范围扩展；Task 12/大型检查 4 仍需继续检查 secrets、隐私与部署配置。
- 下一步：Task 12 更新本机 secrets 提示文件和配置说明，确保新增 HF 归档环境变量只写本机提示、不把真实敏感值提交到仓库。

## Task 12 - secrets 文件与配置文档更新

- [x] 状态：已完成
- 目标：如新增环境变量，更新本机 secrets 提示文件，不写入真实敏感值到仓库。
- 验证：本机文件包含新增 env key 说明；仓库 diff 不含 secret。
- 实际变更：
- 更新本机文件 `C:\Users\yangd\Desktop\mini-hbut-ocrupload-secrets.txt`，只追加缺失的 HF 归档配置键名与非敏感占位值/说明：
  - `HF_ARCHIVE_ENABLED=true`
  - `HF_ARCHIVE_REQUIRE_BEFORE_DB=true`
  - `HF_ARCHIVE_PENDING_REPLAY_LIMIT=200`
  - `HF_ARCHIVE_ADMIN_SECRET=TODO_GENERATE_STRONG_RANDOM_SECRET`
  - `HF_ARCHIVE_EXPORT_DIR=data/service-archive-exports`
  - `HF_ARCHIVE_EXPORT_INTERVAL_SECONDS=86400`
- 没有输出、提交或写入真实 HF token、数据库密码、SQLPub 密码；本机文件已有 `HF_TOKEN`、`HF_BUCKET_ID`、SQLPub 连接键时只做键名存在性确认。
- 验证结果：
- 脱敏键名检查确认以下键存在：`HF_TOKEN`、`HF_BUCKET_ID`、`SQLPUB_HOST`、`SQLPUB_PORT`、`SQLPUB_DATABASE`、`SQLPUB_USER`、`SQLPUB_PASSWORD`、`HF_ARCHIVE_ENABLED`、`HF_ARCHIVE_REQUIRE_BEFORE_DB`、`HF_ARCHIVE_PENDING_REPLAY_LIMIT`、`HF_ARCHIVE_ADMIN_SECRET`、`HF_ARCHIVE_EXPORT_DIR`、`HF_ARCHIVE_EXPORT_INTERVAL_SECONDS`。
- `git diff --name-only` 未出现 `C:\Users\yangd\Desktop\mini-hbut-ocrupload-secrets.txt` 或任何 secrets 文件路径；本机 secrets 文件位于仓库外。
- 后端代码只读检索确认当前新增归档配置入口来自 `ocr-service/runtime/entrypoint.py` 的 `HF_ARCHIVE_ENABLED`、`HF_ARCHIVE_REQUIRE_BEFORE_DB`、`HF_ARCHIVE_PENDING_REPLAY_LIMIT`、`HF_ARCHIVE_ADMIN_SECRET`、`HF_ARCHIVE_EXPORT_DIR`，计划中的 `HF_ARCHIVE_EXPORT_INTERVAL_SECONDS` 作为部署提示键保留。
- 剩余风险：
- `HF_ARCHIVE_ADMIN_SECRET` 仍是本机占位值，真实部署前必须替换为强随机值并配置到 HF Space secrets；本轮不生成、不上传真实 secret。
- 本轮未执行生产 HF 写入、Turso/SQLPub 导出或线上部署；后续 Task 13-15 仍需做后端/前端项目级验证和最终审查。
- 下一步：执行“大型全面检查 4”，重点复核上传数据隐私、secret 泄露、自动重传并发和旧客户端兼容。

## 大型全面检查 4（Task 10-12 后）

- [x] 状态：已完成
- 检查范围：上传数据隐私、secret 泄露、自动重传并发、兼容旧客户端。
- 检查结果：
- 隐私检查发现 `normalizePersonalInfoPayload()` 原本会把直接身份/联系方式字段纳入云同步个人信息快照，包括 `id_number`、`idNumber`、`id_card`、`phone`、`email`。这些字段不属于本轮“统计/同步触发/课程标识”必要数据，继续上传会扩大隐私面。
- 已新增前端契约测试 `does not upload direct personal identity or contact fields`，锁定云同步个人信息快照不得包含身份证号、手机号和邮箱字段，同时保留 `student_id` 用于按学号范围恢复。
- secret 扫描未发现真实 HF token、Turso token、SQLPub 密码或明文 `password/token` 被写入仓库 diff 或源码；本机 secrets 文件仍位于仓库外。
- 自动重传并发复核通过：`runAutoCloudSyncAfterLogin()` 仍按同一学号复用 `autoCloudSyncInFlight.promise`；通知快照监听触发 `reason: 'auto-signature-change'` 时使用 `skipDownload: true`，避免本地通知变化被旧云端数据覆盖后再上传。
- 旧客户端兼容复核通过：后端 `CloudSyncUploadRequest.client_version` 为可选字段，`cloud_sync_storage.upload()` 对缺失 `client_version` 和 `payload_schema_version` 使用默认值/回退提取，不会因旧客户端缺少新字段而拒绝上传。
- 聚焦验证通过：`npx vitest run src/utils/cloud_sync_payload_contract.spec.ts src/utils/service_stats_view_contract.spec.ts src/platform/runtime.spec.ts`，结果 `3 passed` test files，`10 passed` tests。
- 后端回归验证通过：`python -m pytest tests/test_forum_integration.py tests/test_service_stats_persistence.py tests/test_service_health_contract.py tests/test_cloud_sync_archive_contract.py tests/test_service_archive_export.py -q`，结果 `19 passed, 56 warnings in 2.85s`；warnings 为既有 FastAPI `on_event` deprecation。
- 空白检查通过：`git diff --check -- src/utils/cloud_sync.js src/utils/cloud_sync_payload_contract.spec.ts goal-7/tasks.md` 退出码 0。
- 修复动作：
- 修改 `src/utils/cloud_sync.js`，从 `normalizePersonalInfoPayload()` 中移除直接身份/联系方式字段：`id_number`、`phone`、`email`，同时也不再读取 camelCase/legacy 身份证字段。
- 修改 `src/utils/cloud_sync_payload_contract.spec.ts`，新增隐私契约测试，防止后续把身份证号、手机号、邮箱重新放回云同步 payload。
- 剩余风险：
- `normalizePersonalInfoPayload()` 仍保留 `birth_date`、学院、专业、班级、入学日期等学籍字段；这些不是直接联系方式或证件号，但仍属于个人数据，后续若要进一步最小化云同步范围，需要单独做产品决策和兼容迁移。
- `HF_ARCHIVE_ADMIN_SECRET` 在本机 secrets 提示文件中仍是占位值，真实部署前必须替换为强随机值并配置到 HF Space secrets。
- 本轮没有执行生产 HF 私有桶写入、Turso/SQLPub 生产导出或线上部署；后续项目级验证仍需确认代码路径和部署环境。
- FastAPI `on_event` deprecation warning 仍存在，属于既有框架迁移风险，本 goal 不处理。
- 下一步：Task 13 执行后端项目级验证，继续记录 pytest/静态检查结果与任何剩余问题。

## Task 13 - 后端项目级验证

- [x] 状态：已完成
- 目标：运行后端相关 pytest/静态检查，单命令不超过 60 秒。
- 验证：记录通过/失败与根因。
- 实际变更：
- 本轮未修改 OCR 后端业务代码，只执行项目级验证并记录结果。
- 检查 OCR 后端仓库状态：当前只有 `data/` 和 `scripts/utf8.ps1` 未跟踪，未发现后端业务文件脏改；这些本地文件不纳入本轮提交。
- 验证结果：
- 完整后端测试通过：在 `D:\Documents\C_learn\成绩查询\ocr-service` 运行 `python -m pytest -q`，结果 `84 passed, 1 skipped, 64 warnings in 16.03s`。
- Python 语法编译检查通过：运行 `python -m compileall -q runtime modules forum_backend scripts`，退出码 0。
- 静态检查入口确认：仓库仅发现 `requirements.txt`、`requirements-gpu.txt`，未发现 `pyproject.toml`、`pytest.ini`、`tox.ini`、`setup.cfg`、`ruff.toml` 等 lint/type-check 配置；检索 `ruff|flake8|mypy|pyright|pylint` 无匹配，因此本轮没有额外可复用 lint 命令。
- pytest warnings 仍为既有 FastAPI `on_event` deprecation 警告，未出现测试失败。
- 剩余风险：
- 生产 HF 私有桶写入、Turso/SQLPub 真实导出和线上部署仍未执行；本轮只验证本地后端代码与 dry-run/contract 测试。
- 后端缺少统一 lint/type-check 配置，当前项目级静态验证只能覆盖 Python 语法编译，不能替代 ruff/mypy 等更强检查。
- FastAPI `on_event` deprecation warning 后续仍建议迁移到 lifespan，但不是本 goal 的必要变更。
- 下一步：Task 14 执行前端项目级验证，覆盖 Vitest、构建或类型检查，并记录任何失败根因。

## Task 14 - 前端项目级验证

- [x] 状态：已完成
- 目标：运行前端相关 Vitest、构建或类型检查，单命令不超过 60 秒。
- 验证：记录通过/失败与根因。
- 实际变更：
- 本轮未修改前端业务代码，只执行项目级验证并记录结果。
- 检查 `package.json`：当前可复用脚本包含 `npm test` 和 `npm run build`；仓库没有独立 lint/typecheck 脚本，但 devDependencies 中包含 `vue-tsc`，因此额外尝试了 `npx vue-tsc --noEmit -p tsconfig.json`。
- 验证结果：
- 完整前端测试未通过：运行 `npm test` 后，Vitest 结果为 `4 failed | 31 passed` test files，`11 failed | 207 passed` tests。
- 完整 Vitest 失败集中在既有游戏/模块中心测试：
  - `src/utils/module_center.spec.ts` 与 `src/utils/remote_config.spec.ts`：当前默认模块列表包含 `hbut_gomoku`，测试期望列表仍少一项。
  - `src/utils/hbut_memory_match_game.spec.ts`：当前记忆牌初始状态为 `preview`，测试期望 `playing`，且翻牌步数断言与当前实现不一致。
  - `src/utils/hbut_monopoly_game.spec.ts`：大富翁胜负/重开状态断言与当前实现不一致，且样式测试期望 `body { padding: 0; }`，当前样式把安全区 padding 放在 `#app`。
- 失败相关文件本轮没有未提交 diff：检查 `module_center`、`remote_config`、`hbut_memory_match`、`hbut_monopoly` 相关源码和测试，未发现本 goal 本轮改动；这些失败不指向服务统计页或云同步 payload 变更。
- Goal 相关聚焦测试通过：运行 `npx vitest run src/utils/cloud_sync_payload_contract.spec.ts src/utils/service_stats_view_contract.spec.ts src/platform/runtime.spec.ts`，结果 `3 passed` test files，`10 passed` tests。
- 前端生产构建通过：运行 `npm run build`，`vite build` 完成 `549 modules transformed`，输出包含 `ServiceStatsView` chunk；构建退出码 0。
- 构建 warnings：CSS 压缩阶段出现多个 `Unexpected "@media"` warning，Vite reporter 还提示 Capacitor/Tauri/widget bridge 动静态 import 混用不会拆分到独立 chunk；这些是 warning，未阻断构建。
- 类型检查未完成：运行 `npx vue-tsc --noEmit -p tsconfig.json` 失败于工具链内部错误 `Search string not found: "/supportedTSExtensions = .*(?=;)/"`，环境为 Node `v24.12.0`、npm `11.6.2`、TypeScript `5.9.3`、vue-tsc `1.8.27`。该错误发生在 `node_modules/vue-tsc/bin/vue-tsc.js`，未输出业务类型错误。
- 剩余风险：
- 前端完整 Vitest 当前仍有 11 个失败，虽然不属于服务统计/云同步本 goal 直接改动，但在最终 review 前必须决定修复这些既有测试期望，或明确把它们作为非本 goal 阻断项处理。
- `vue-tsc@1.8.27` 与当前 TypeScript `5.9.3` / Node `24.12.0` 组合存在兼容问题；需要升级 vue-tsc 或锁定兼容 TypeScript/Node 后才能得到有效类型检查结果。
- 构建存在 CSS `@media` minify warning，当前不阻断构建，但最终 review 仍应确认是否来自既有 CSS 嵌套/语法问题。
- 下一步：Task 15 执行最终 review，按完整目标逐项审计 C 端体验、代码、安全性、数据一致性、权限、错误处理、测试、构建、文档和回滚；不得在完整 Vitest/vue-tsc 问题未处理或明确结论前把 goal 标记完成。

## Task 15 - 最终 review、提交与 goal 完成

- [x] 状态：已完成
- 目标：全面 review C 端体验、代码、安全性、数据一致性、权限、错误处理、测试、构建、文档和回滚；若有代码修改则提交。
- 验证：无已知高风险问题；goal 标记完成。
- 实际变更：
- 在 `ocr-service` 收口 HF 私有桶全量归档导出代码路径，新增真实导出实现、Turso/SQLPub 白名单表源、HF 上传 manifest、受保护管理接口真实导出分支、每日定时导出任务入口和默认 dry-run CLI 脚本 `scripts/export_service_archive_to_hf.py`。
- 修复 Turso 导出行列映射，确保 libsql 返回 tuple row 时使用 `result.columns` 生成稳定 JSON 字段名。
- 提交并推送 HF Space：`ocr-service` commit `c23b6dfa4fc1ef07eb0465d6b9ff2a31c713ed8e` 已推送到 `mini-hbut/ocr-service` 的 `main`。
- 没有修改或提交游戏/模块中心相关文件；没有暂存 `ocr-service/data/`、`ocr-service/scripts/utf8.ps1` 或 Tauri 工作区里的无关调试删除项。
- 验证结果：
- 后端归档导出聚焦测试通过：`python -m pytest tests/test_service_archive_export.py -q`，结果 `6 passed, 12 warnings`。
- 后端目标相关测试通过：`python -m pytest tests/test_forum_integration.py tests/test_service_stats_persistence.py tests/test_service_health_contract.py tests/test_cloud_sync_archive_contract.py tests/test_service_archive_export.py -q`，结果 `23 passed, 60 warnings`。
- 后端完整测试通过：`python -m pytest -q`，结果 `88 passed, 1 skipped, 68 warnings`。
- Python 编译检查通过：`python -m compileall -q runtime modules forum_backend scripts`，退出码 0。
- HF 线上只读 `/health` 验证通过，返回新结构：`service`、`daily_usage.grade_dist_query_count`、`cloud_sync`、`trend.last_7_days`、`hf_bucket`、`archive_status` 均存在；线上当前 `hf_bucket.configured=true`，`archive_status.enabled=false`。
- Tauri 本地目标相关前端测试通过：`npx vitest run src/utils/service_stats_view_contract.spec.ts src/utils/cloud_sync_payload_contract.spec.ts src/platform/runtime.spec.ts`，结果 `3 passed` test files，`10 passed` tests。
- Tauri 前端生产构建通过：`npm run build`，`vite build` 成功，输出包含 `ServiceStatsView` chunk；仍有既有 CSS `Unexpected "@media"` 和动静态 import 混用 warning，但未阻断构建。
- `git ls-remote origin refs/heads/main` 确认 HF 远端 `main` 指向 `c23b6dfa4fc1ef07eb0465d6b9ff2a31c713ed8e`。
- 剩余风险：
- 线上 `HF_ARCHIVE_ENABLED=false`，所以当前线上已经能展示统计模块读取的 `/health` 新结构，但“上传前强制先写 HF 私有桶”和每日真实全量归档尚未启用；启用需要在 HF Space 配置 `HF_ARCHIVE_ENABLED=true`、`HF_ARCHIVE_ADMIN_SECRET` 等生产 secrets，属于生产配置/数据写入高风险操作，本轮没有擅自执行。
- 本轮没有执行生产 Turso/SQLPub 全量导出到 HF 私有桶；真实导出必须通过受保护接口或 CLI 显式确认后执行。
- Tauri 完整 `npm test` 仍有既有游戏/模块中心测试失败，已确认不属于本 goal 改动，本轮按用户要求不再触碰游戏相关文件。
- `vue-tsc@1.8.27` 与当前 TypeScript/Node 组合仍存在工具链内部兼容错误，未得到有效业务类型检查。
- FastAPI `on_event` deprecation warning 仍存在，属于既有框架迁移事项。
- 下一步：如需真正启用线上双保险写入，需要用户明确确认后再改 HF Space secrets 并执行受保护 dry-run/真实导出。

## 最终最大 review

- [x] 状态：已完成
- 检查范围：C 端体验、代码质量、安全性、数据一致性、权限、错误处理、测试、构建、文档、回滚。
- 检查结果：
- C 端体验：统计页目标相关测试与生产构建通过，线上 `/health` 已返回统计页需要的新结构，本地可构建可使用。
- 代码质量：后端导出表名使用白名单，CLI 默认 dry-run，真实导出通过受保护接口和显式确认参数，避免误触发生产导出。
- 安全性：本轮未提交真实 HF token、Turso token、SQLPub 密码；归档管理接口要求 `X-Archive-Admin-Secret`。
- 数据一致性：云同步上传的 HF 事件归档路径、全量导出 manifest 和 JSONL zip 路径均有测试覆盖；Turso tuple row 已按列名导出。
- 权限与错误处理：管理接口未配置密钥返回 503，密钥错误返回 403，stamp 非法返回 400，真实导出异常会写入 `archive_status.last_error`。
- 测试与构建：后端完整 pytest、编译检查、前端目标 Vitest、前端生产构建均通过；完整前端 Vitest 的游戏/模块中心失败保持为非本 goal 风险。
- 回滚：可通过回退 `ocr-service` commit `c23b6dfa4fc1ef07eb0465d6b9ff2a31c713ed8e` 关闭新真实导出代码路径；线上未启用 `HF_ARCHIVE_ENABLED` 时不会强制改变云同步写入顺序。
- 修复动作：
- 修复并提交 `ocr-service` 的全量归档导出收尾缺口，推送 HF 后验证线上 `/health` 已生效。
- 最终结论：
- 本轮用户要求的“推送 HF 并反馈本地能否使用”已完成：HF 线上新 `/health` 已可读，本地目标测试和生产构建通过。完整 goal 中“生产启用 HF 双保险和真实全量导出”仍需用户明确确认生产 secrets/数据写入后才能执行。
