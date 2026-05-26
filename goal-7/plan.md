# 合并方案：服务统计模块 + HF 私有桶双保险存储

## 目标摘要

在 `ocr-service` 和 Tauri 前端中合并实施两条需求：

- “我的”页新增服务统计入口，直接读取 `https://mini-hbut-ocr-service.hf.space/health`，展示 OCR、课表上传、给分查询、运行时长、云同步用户数、最新版本人数和近 7 天趋势。
- HF 私有 Dataset 桶升级为全服务保险层：支持把现有 Turso / SQLPub 服务表全量导出到 HF 私有桶；之后云同步上传按“先写 HF 桶，再写数据库”的顺序执行。

## 默认假设

- 统计模块对所有登录用户可见。
- 前端只读 `/health`，不新增公开统计接口。
- 图表使用项目内轻量 SVG/CSS，不新增图表库。
- “数据库数据全部下载”按服务表全量执行，不导出与本服务无关的数据库表。
- 双保险顺序固定为“HF 桶成功后再写数据库”。
- 考试安排若源数据拿不到稳定课程 ID，上传最详细可得字段并标记缺失。
- 不把 HF token、数据库密码或任何 secret 写入仓库。
- 不直接执行生产导出、生产写入或敏感网络操作；此类操作只提供代码路径和受保护接口，真实执行前需要用户明确确认。

## 后端方案

1. 新增统一 HF 归档模块，复用 `HF_BUCKET_ID` / `HF_TOKEN`，对象路径固定为：
   - `cloud-sync/events/YYYY/MM/DD/<student_id>/<hash>.json`
   - `exports/turso/cloud_sync_records/<timestamp>.jsonl.zip`
   - `exports/sqlpub/<table>/<timestamp>.jsonl.zip`
   - `manifests/export-<timestamp>.json`
2. 云同步上传链路改为双写：
   - 先合并 payload 并生成 hash。
   - 先上传 HF 私有桶归档对象。
   - HF 成功后再写 Turso `cloud_sync_records`。
   - Turso 失败时保留 HF 对象，并在 `/health.archive_status.pending_replay_count` 中体现。
3. 全量导出范围采用“服务表全量”：
   - Turso：`cloud_sync_records`
   - SQLPub：`service_daily_stats`、`service_daily_usage`、`grade_distribution_raw`、`grade_distribution`、`game_rank_runs`、`game_rank_best`、全部 `forum_*` 表
4. 新增一次性导出脚本和受保护管理接口：
   - 脚本用于把当前 Turso / SQLPub 数据导出并上传 HF 私有桶。
   - 管理接口只允许服务端 secret 调用。
   - 默认每日执行一次定时快照。
5. 扩展 `/health`，保留现有字段并新增：
   - `service.started_at`
   - `service.uptime_seconds`
   - `service.version`
   - `daily_usage.grade_dist_query_count`
   - `cloud_sync.latest_version`
   - `cloud_sync.latest_version_user_count`
   - `trend.last_7_days`
   - `hf_bucket`
   - `archive_status`
6. 扩展统计落库：
   - `service_daily_stats` 自动补列 `latest_version`、`latest_version_user_count`
   - 定时快照保存最新版本人数和云同步总记录
   - 近 7 天趋势优先读 SQLPub，今日缺失时用内存值补齐
7. 扩展 Turso `cloud_sync_records`：
   - 新增 `client_version`
   - 新增 `payload_schema_version`
   - 旧客户端缺字段不报错
8. 最新版本人数规则：
   - 服务端解析稳定版最新正式版本。
   - 统计 `cloud_sync_records.client_version == latestVersion` 的唯一学号数。
   - 版本源短时缓存，避免每次 `/health` 打外部接口。

## 前端方案

1. “我的”页新增“服务统计”入口：
   - 登录后可见。
   - 点击进入新视图 `service_stats`。
   - 在 `App.vue` 注册异步页面和导航映射。
2. 新增统计页面：
   - 数据源固定为 `https://mini-hbut-ocr-service.hf.space/health`
   - 进入页面立即请求。
   - 停留期间每 60 秒刷新。
   - 提供手动刷新按钮。
   - 使用项目内轻量 SVG/CSS 趋势图，不新增图表库。
3. 统计页展示：
   - 运行状态、运行时长
   - OCR 今日次数
   - 课表上传今日次数
   - 给分查询今日次数
   - 云同步总记录
   - 最新版本人数
   - HF 桶状态、最近归档时间、待重放数量
   - 近 7 天 OCR / 上传 / 给分 / 云同步总记录 / 最新版本人数趋势
4. 扩展 `src/utils/cloud_sync.js` 上传 payload：
   - `client.version`
   - `client.platform`
   - `client.runtime`
   - `notify`
   - `academic.exams`
   - 成绩课程标识：保留并规范 `grade_id`、`course_id`、`course_code`
   - 课表课程标识：保留 `course_id`、`source_id`、可识别原始课程标识
5. 自动上传触发规则：
   - 登录成功后保留现有自动同步。
   - 版本号变化立即全量重传。
   - 通知快照、考试安排、成绩快照、课表快照、设置快照任一签名变化立即全量重传。
   - 同一学号已有上传任务在飞时复用任务，避免并发重复上传。
6. 本地持久化：
   - 上次成功上传版本号
   - 上次上传综合签名/hash
   - 最近一次自动重传原因

## Secrets 与部署

- 如果新增或调整后端 secret，更新本机文件：
  - `C:\Users\yangd\Desktop\mini-hbut-ocrupload-secrets.txt`
- 不把 token、数据库密码、HF token 写入代码、日志或提交内容。
- 新增推荐环境变量：
  - `HF_ARCHIVE_ENABLED=true`
  - `HF_ARCHIVE_REQUIRE_BEFORE_DB=true`
  - `HF_ARCHIVE_EXPORT_INTERVAL_SECONDS=86400`
  - `HF_ARCHIVE_ADMIN_SECRET`
  - `HF_ARCHIVE_PENDING_REPLAY_LIMIT=200`

## 风险

- 真实 HF 桶和生产数据库操作属于高风险操作；本轮默认只实现代码、测试和 dry-run 能力，不直接执行生产导出或写入。
- 前后端跨仓库，必须避免回滚用户已有脏改。
- `/health` 扩展必须保持新增字段兼容，不能替换现有健康字段。
- Cloud sync payload 兼容旧客户端，缺失新字段时不能失败。
- Tauri 版本号获取在 Web/Tauri 环境差异较大，需要做兼容兜底。

## 验证方案

- 后端：
  - `/health` 返回新增字段，且现有 `status=ok`、并发、临时存储字段不回归。
  - `service_daily_stats` 自动建表/补列成功。
  - `cloud_sync_records` 自动补列 `client_version`。
  - 新客户端上传能写入 `client_version`；旧客户端不传版本不报错。
  - HF 成功后才写 Turso；HF 失败时不写 Turso。
  - Turso 失败时 HF 对象保留，并计入待重放。
  - Turso / SQLPub 服务表全量导出生成 zip 和 manifest，表名、行数、hash 正确。
- 前端：
  - “我的”页出现“服务统计”入口，登录后可进入。
  - 统计页进入即加载，手动刷新和 60 秒自动刷新可用。
  - `/health` 缺少新字段时兼容展示，不崩溃。
  - 自动上传 payload 包含版本、通知、考试、成绩课程标识和课表课程标识。
  - 关键本地签名或版本变化时触发重传，在飞任务复用。
- 命令：
  - 前端运行相关 Vitest。
  - 后端运行新增 pytest，单项超时 60 秒。
  - 执行本地 dry-run 导出测试，不直接写生产桶。

## 回滚方案

- 前端可回退新增 `ServiceStatsView.vue`、`App.vue` 路由接入、`MeView.vue` 入口和 `cloud_sync.js` payload/签名变更。
- 后端可回退新增 HF 归档模块、`/health` 扩展、cloud sync storage schema 扩展和统计函数扩展。
- 新增数据库列为向后兼容列；如果线上不启用 HF 归档环境变量，上传链路应保持原数据库写入可用。
