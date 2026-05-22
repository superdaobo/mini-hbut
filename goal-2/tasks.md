# Goal 2 任务清单

## Task 1：校准论坛目标与当前实现状态

- [x] 状态：完成
- 范围：读取规范、当前工作区、已有论坛提交、HF 线上只读状态。
- 执行记录：
  - 已确认 `goal-1` 是游戏模块历史任务，和当前论坛目标不一致。
  - 已创建 `goal-2` 作为论坛目标追踪目录。
  - 已确认 HF 线上 `/health` 可用，但 `/api/forum/categories` 返回 `Not Found`，论坛后端尚未部署到 Space。
  - 已确认 HF push 和线上写入 E2E 都属于高风险外部写入，需要用户明确确认。
- 验证结果：
  - `ocr-service` 当前 HEAD：`d150098 fix: tolerate remote head lookup failure in forum dry run`。
  - `tauri-app` 历史中存在论坛前端提交：`89bb069`、`3cc6305`、`3d333cc`、`937602b`。
- 剩余风险：
  - 线上部署尚未执行。
  - 用户目标中的“存储桶为”后面缺少具体 Bucket ID；生产必须从 HF Secrets 提供。
- 下一步：执行 Task 2，本地全链路验证当前登录学号管理员论坛功能。

## Task 2：本地全链路验证当前登录学号管理员论坛功能

- [x] 状态：完成
- 范围：本地 OCR/论坛后端、管理员 token、发帖、评分、前端论坛回归和浏览器页面。
- 目标：证明第一阶段本地搭建可用，且 `2510231106` 是管理员。
- 执行记录：
  - 启动本地 OCR/论坛后端：`127.0.0.1:7860`，环境使用 `FORUM_ADMIN_STUDENT_IDS=2510231106`、SQLite、本地禁用 HF Bucket 强制要求。
  - 本地 `/health` 返回 200，证明 OCR 服务入口未被论坛融合破坏。
  - 本地 `/api/forum/categories` 返回四个默认版块：`campus`、`study`、`life`、`help`。
  - 用 `2510231106` 请求 `/api/forum/auth/token`，断言 `is_admin=true`。
  - 通过本地 API 创建管理员验证帖并评分 10 分，随后读取详情确认作者学号、标题和 `score_avg=10.0`。
  - 浏览器打开 `http://127.0.0.1:1420/?forumApiBase=http%3A%2F%2F127.0.0.1%3A7860#/2510231106/forum`，页面显示“社区身份 2510231106 / 已绑定当前登录学号”。
  - UI 发帖时发现真实问题：前端缓存旧论坛 token，本地后端重启后写接口返回“令牌签名无效”。读接口不带 token，所以问题只在写入链路暴露。
  - 按 TDD 修复 `src/utils/forum_api.js`：授权请求遇到 401 时清除缓存 token、重新签发 token，并只重试一次。
  - 新增 `src/utils/forum_api.spec.ts` 回归，覆盖旧 token 被拒后自动刷新并重试写入。
  - 刷新前端到 `1420` 后再次通过 UI 创建“本地 Goal2 前端验证 2059”并评分 10 分，列表变为 3 条，详情 API 确认作者 `2510231106`、`score_avg=10.0`。
- 验证结果：
  - 前端红灯：`npx.cmd vitest run src\utils\forum_api.spec.ts --testTimeout 60000` 初始失败，错误为“令牌签名无效”。
  - 前端绿灯：`npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_view_identity_contract.spec.ts src\styles\bottom_tab_bar_safe_area.spec.ts --testTimeout 60000` 通过：3 个测试文件、18 个测试全部通过。
  - 本地 API E2E 输出证明：`admin=true`、版块包含 `campus/study/life/help`、创建帖子并得到 `score_avg=10.0`。
  - 浏览器 UI 验证证明：页面身份为 `2510231106`，新帖“本地 Goal2 前端验证 2059”出现并显示 10 分。
  - 详情接口验证：`GET /api/forum/threads/3` 返回 `author_student_id=2510231106`、`score_avg=10.0`。
- 剩余风险：
  - 本地验证使用 SQLite 和 `FORUM_REQUIRE_HF_BUCKET=false`，不代表生产 SQLPub/HF Bucket 已经配置。
  - 浏览器验证使用本地 Vite dev server 和 Chrome DevTools，不等同于打包后的真实 Tauri WebView 全量设备矩阵。
  - 本轮本地 E2E 会在本地 SQLite 中留下验证帖，属于本地测试数据，不会上传线上。
- 下一步：
  - 执行 Task 3：部署前最终本地检查，重新跑后端 dry-run、前端论坛回归、工作区状态和本地服务清理。

## Task 3：部署前最终本地检查

- [x] 状态：完成
- 范围：后端测试、部署 dry-run、前端论坛测试、工作区状态。
- 目标：确认可以进入 HF 写入确认门。
- 执行记录：
  - 重新执行后端部署 dry-run：`python scripts\deploy_forum_to_hf_test.py`。
  - 重新执行前端论坛回归：`npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_view_identity_contract.spec.ts src\styles\bottom_tab_bar_safe_area.spec.ts --testTimeout 60000`。
  - 复查线上只读状态：HF Space `/health` 可用，但 `/api/forum/categories` 仍是 `Not Found`，证明线上仍未部署论坛后端。
  - 复查本地服务清理：停止本轮本地论坛后端 PID `168648`，随后 `curl http://127.0.0.1:7860/health` 返回失败，说明 7860 已关闭。
  - 复查工作区隔离：`ocr-service` 只剩未跟踪 `scripts/utf8.ps1`；`tauri-app` 仍有历史游戏模块改动和临时截图/Playwright 文件，本轮未纳入论坛提交。
  - 补充执行前端生产构建：`npm.cmd run build`，确认论坛页面能进入生产产物。
  - 补充执行线上只读验证：`python scripts\verify_forum_deploy.py`，当前失败在 `/api/forum/categories` 404，符合“尚未部署论坛后端”的线上状态。
- 验证结果：
  - 后端 dry-run：preflight ok，pytest `25 passed`，`local_head=d150098`，`remote_head=03621cf`，`dry_run=ok`，`push_skipped=missing --confirm-hf-write`。
  - 前端论坛回归：3 个测试文件通过，18 个测试通过。
  - 前端生产构建：`npm.cmd run build` 成功，Vite 构建完成并生成 `ForumView` 对应 CSS/JS chunk；仅保留既有 CSS `@media` minify warning 和动态/静态混合导入 warning。
  - 线上只读验证：`/health` 为 200，但 `/api/forum/categories` 为 404，因此线上仍未完成论坛部署。
  - `tauri-app` 论坛最新提交：`985f328 fix: refresh stale forum auth token`。
  - `ocr-service` 论坛最新提交：`d150098 fix: tolerate remote head lookup failure in forum dry run`。
- 剩余风险：
  - 尚未执行 HF 写入部署；线上论坛接口仍未可用。
  - HF Secrets 中的 `HF_BUCKET_ID`、`HF_TOKEN`、SQLPub 和 OneDrive/rclone 配置是否完整，当前只能由 preflight 警告提示，不能从本地证明。
  - 线上写入 E2E 会创建验证帖和评分，必须单独确认后执行。
- 下一步：
  - 进入 HF 写入确认门：用户明确回复“是/确认/继续”后，执行 `python scripts\deploy_forum_to_hf_test.py --confirm-hf-write`。

## 大型检查 A：完成 Task 1-3 后执行

- [x] 状态：完成
- 检查项：需求偏离、OCR 兼容性、管理员权限、数据存储、HF Bucket、OneDrive 灾备、前端 Tauri 集成、安全边界。
- 执行记录：
  - 需求偏离检查：本轮只推进论坛目标，未继续执行历史 `goal-1` 游戏任务，也未回滚游戏相关工作区改动。
  - OCR 兼容性检查：后端 dry-run 中 `/health` 相关集成测试通过；线上 `/health` 当前可用。
  - 管理员权限检查：本地 API E2E 和 UI E2E 均使用 `2510231106`，本地 token 返回 `is_admin=true`。
  - 数据存储检查：本地使用 SQLite；生产/HF 已通过测试要求 SQLPub 配置，缺少配置时论坛不可用但 OCR 不崩溃。
  - HF Bucket 检查：生产上传和备份路径已要求 HF Bucket；部署只读验证会强制检查 `/api/forum/backups` 中 `storage.hf_bucket.configured=true`。
  - OneDrive 灾备检查：Dockerfile/preflight 已检查 rclone；缺少 OneDrive 配置时只标记灾备副本不可用，不误报成功。
  - 前端 Tauri 集成检查：底部论坛入口、当前学号绑定、forumApiBase 本地覆盖、旧 token 自动刷新均有回归测试或浏览器证据。
  - 安全边界检查：非 loopback 的 `forumApiBase` 覆盖会被忽略；线上写入和 HF push 继续要求明确确认。
- 结论：
  - 第一阶段本地搭建和本地全链路测试已经完成：后端、管理员、发帖、评分、前端页面读写链路均有当前证据。
  - 目标整体尚未完成：HF Space 还没有论坛接口，线上存储桶配置和线上写入 E2E 还未验证。
- 修复项：
  - 后端部署 dry-run 增强：远端 HEAD 查询 TLS 抖动时 dry-run 继续输出本地验证结果，真实 push 仍严格失败。
  - 前端论坛 API 修复：旧 token 被 401 拒绝后自动清缓存、重新签发 token 并重试一次，解决后端重启/密钥变更后的 UI 写入失败。

## Task 4：HF Space 只读部署验证

- [x] 状态：完成
- 前置：用户明确回复“是/确认/继续”允许 HF 写入部署。
- 范围：推送 `ocr-service` 到 `mini-hbut/testocr1` 并等待 Space 重建。
- 验证：`/health`、`/api/forum/categories`、`/api/forum/threads/hot`、`/api/forum/backups`，且 HF Bucket configured。
- 执行记录：
  - 已执行 SQLPub Secrets 写入：`python scripts\configure_hf_sqlpub_secrets.py --secrets-file C:\Users\yangd\Desktop\mini-hbut-ocrupload-secrets.txt --hf-token-from-git-remote hf-test --confirm-hf-secret-write`，输出显示 `SQLPUB_HOST/PORT/DATABASE/USER/PASSWORD=SET`。
  - 根据用户补充要求，已把论坛运行时 Secrets 同步写入本地 `C:\Users\yangd\Desktop\mini-hbut-ocrupload-secrets.txt`，并写入 HF Space Secrets：`FORUM_AUTH_SECRET`、`FORUM_ADMIN_STUDENT_IDS`、`FORUM_DB_BACKEND`、`HF_BUCKET_ID`、`HF_TOKEN`。
  - 本地 secrets 文件只补齐缺失键，未覆盖既有 `HF_TOKEN` 和 SQLPub 配置；命令输出未打印任何密钥值。
  - 新增并提交后端脚本修复：`a101591 chore: persist forum runtime secrets locally`，保证以后重跑运行时 Secret 配置时会复用本地 `FORUM_AUTH_SECRET`。
  - 执行 `python scripts\deploy_forum_to_hf_test.py --confirm-hf-write`，推送 `ocr-service` 到 HF Space `mini-hbut/testocr1`。
  - HF push 结果：`1a89a94..a101591 HEAD -> main`。
  - HF API 当前显示 Space `runtime.stage=RUNNING`，线上 sha 为 `a101591775b0d7621d2293e84135b3b546cf777f`，bucket volume 挂载源为 `mini-hbut/testocr1-storage`，挂载路径为 `/data`。
- 验证结果：
  - 部署脚本内置后端全量测试：`python -m pytest tests -q` 通过，`39 passed, 24 warnings`；warnings 为既有 FastAPI `on_event` deprecation。
  - 部署后只读验证通过：
    - `/health`：200
    - `/api/forum/categories`：200，默认版块为 `campus,study,life,help`
    - `/api/forum/threads/hot?limit=5`：200
    - `/api/forum/backups?limit=3`：200
  - `/api/forum/backups` 返回 `storage.hf_bucket.configured=true`，`bucket_id=mini-hbut/testocr1-storage`。
- 剩余风险：
  - OneDrive/rclone 灾备当前仍未配置，`storage.onedrive.configured=false`；这不影响论坛主链路，但不应把 OneDrive 灾备误报为已完成。
  - HF Space 使用 HF Bucket 作为主对象存储仍有平台账号风险；后续应补齐 OneDrive 或其他外部备份。
- 下一步：
  - 执行 Task 5：线上写入 E2E，确认 `2510231106` 管理员身份和 SQLPub 独立 `forum_*` 表写入链路。

## Task 5：线上写入 E2E 与管理员确认

- [x] 状态：完成
- 前置：用户单独明确确认允许线上写入。
- 范围：线上签发 token、确认 `2510231106` 管理员、创建验证帖、评分、读详情。
- 执行记录：
  - 执行 `python scripts\verify_forum_deploy.py --confirm-write-e2e`。
  - 线上签发 `2510231106` token，并确认 `forum_admin=true`。
  - 在线上创建部署验证帖，随后对该帖评分 10 分，再读取帖子详情确认写入链路。
  - 写入数据进入 SQLPub 中独立的 `forum_*` 表族，不混入给分记录和排行榜表；相关表隔离由后端测试 `tests/test_forum_deploy_contract.py` 锁定。
- 验证结果：
  - 只读部分继续通过：
    - `health_status=200`
    - `forum_categories_status=200`
    - `forum_hot_status=200`
    - `forum_backups_status=200`
  - 写入部分通过：
    - `forum_token_status=200`
    - `forum_admin=true`
    - `forum_create_thread_status=200`
    - `forum_score_thread_status=200`
    - `forum_thread_detail_status=200`
  - E2E 证据：`thread_id=1`，`score_avg=10.0`，标题为部署后验证帖。
- 剩余风险：
  - 线上验证帖是真实测试数据，后续可以在管理后台或数据库中归档/删除。
  - 当前验证覆盖管理员发帖、评分和读帖；大流量压测、举报审核工作流、私信通知等长链路尚未做线上压力验证。
- 下一步：
  - 汇总最终完成审计，确认 `goal-2/plan.md` 的完成标准是否满足。

## 最终完成审计

- [x] 状态：完成
- 要求：逐条对照 `goal-2/input.md` 和 `goal-2/plan.md` 的完成标准，只有证据充分时才能标记 goal complete。
- 执行记录：
  - 完成标准 1：本地后端论坛 API 和 OCR 服务共存，后端全量测试通过；线上 `/health` 也保持 200。
  - 完成标准 2：`2510231106` 本地和线上均验证为管理员，可发帖、评分、读帖。
  - 完成标准 3：Tauri 论坛入口、身份绑定、旧 token 自动刷新和本地 API 覆盖已通过前端回归与本地浏览器验证。
  - 完成标准 4：HF Space 已部署到 `a101591`，`/categories`、`/threads/hot`、`/backups` 只读验证通过，HF Bucket 显示 configured。
  - 完成标准 5：经用户确认后，线上写入 E2E 已证明管理员发帖和评分成功。
  - 完成标准 6：已记录生产必需 Secrets；OneDrive/rclone 灾备明确标记为未配置，未误报成功。
  - 额外补充：论坛运行时 Secrets 已按用户要求写入本地 `mini-hbut-ocrupload-secrets.txt`，便于后续复用同一个 `FORUM_AUTH_SECRET`。
  - 最终前端复验：`npx.cmd vitest run --testTimeout 60000` 通过，27 个测试文件、158 个测试全部通过。
  - 最终前端构建：`npm.cmd run build` 成功，生产产物包含 `ForumView` CSS/JS chunk；仍有既有 CSS `@media` minify warning 和动态/静态混合导入 warning。
- 结论：
  - Goal 2 第一阶段后端、HF 部署、SQLPub 写入、HF Bucket 配置、Tauri 论坛入口与管理员全链路验证均已完成。
  - 剩余可作为后续阶段继续增强：OneDrive/rclone 灾备实装、线上压力测试、社区管理后台细化、图床/附件上传前端完整 UI。
