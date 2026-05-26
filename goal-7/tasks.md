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
