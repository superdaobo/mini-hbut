# Goal 2 规划：论坛后端与 Tauri 论坛模式

## 目标原文

请你完成上述任务，并根据我现在有的tauri的登录信息进行全量测试，你可以先进行第一阶段的搭建，搭建好了测试没有问题了之后再进行前端页面的完全移植tauri。我现在登录的账号要作为管理员。现在https://huggingface.co/spaces/mini-hbut/testocr1 上面提交后端，存储桶为

## 需求拆解

1. 在现有 OCR 后端中融合论坛 API，不能破坏 `/health` 和 OCR 服务。
2. 论坛支持基础社区能力：版块、发帖、回帖、评分、反应、附件、热门帖、备份状态。
3. 当前 Tauri 登录账号 `2510231106` 必须在论坛中拥有管理员身份。
4. 数据库使用 SQLPub；本地测试可用 SQLite 兜底，生产/HF Space 必须使用 SQLPub 配置。
5. 附件和论坛快照使用 HF Private Bucket；生产缺少 Bucket 配置时不能误报成功。
6. OneDrive 通过 rclone 做灾备副本，用于降低 HF 封号或数据丢失风险。
7. Tauri 前端底部导航中心新增论坛入口，并能使用当前登录学号刷新论坛身份。
8. 本地第一阶段必须验证后端、管理员、发帖、评分和前端本地覆盖链路。
9. HF Space `mini-hbut/testocr1` 部署后必须通过只读验证；线上写入 E2E 需要单独确认。

## 当前上下文

- Tauri 项目根目录：`D:\Documents\C_learn\成绩查询\tauri-app`
- OCR 服务目录：`D:\Documents\C_learn\成绩查询\ocr-service`
- 已有 `goal-1` 是历史游戏模块任务，和本论坛目标不一致；本目标用 `goal-2` 追踪。
- `ocr-service` 已有本地提交 `d150098 fix: tolerate remote head lookup failure in forum dry run`。
- HF Space 当前只读检查显示 `/health` 可用，但 `/api/forum/categories` 仍为 `Not Found`，说明论坛后端尚未部署到线上。
- HF 推送、线上写入测试、生产数据库写入、密钥操作均属于高风险操作，需要用户明确回复“是/确认/继续”后执行。

## 默认假设

1. 当前登录账号管理员学号固定为 `2510231106`。
2. 用户尚未提供完整 HF Bucket ID，因此生产部署前必须依赖 HF Secrets 中的 `HF_BUCKET_ID` 和 `HF_TOKEN`。
3. 本地验证使用 SQLite 和 `FORUM_REQUIRE_HF_BUCKET=false`，不代表生产 Bucket 已配置。
4. 线上只读验证可以检查接口和 Bucket 配置状态；线上写入 E2E 会创建验证帖和评分，必须单独确认。
5. 不清理、不回滚 Tauri 工作区中和论坛无关的游戏模块改动。

## 执行方案

1. 核对已有后端论坛融合、部署脚本、验证脚本和测试状态。
2. 补齐部署前可离线修复的问题，保证 dry-run、preflight 和测试稳定。
3. 用本地后端启动 `127.0.0.1:7860`，使用 `2510231106` 做管理员 E2E：签发 token、读版块、发帖、评分、读详情。
4. 运行 Tauri 前端论坛回归测试，验证论坛 API client、身份刷新和底部导航安全区。
5. 用前端本地覆盖参数 `?forumApiBase=http://127.0.0.1:7860` 验证页面能绑定当前学号和请求本地后端。
6. 用户确认后执行 `python scripts\deploy_forum_to_hf_test.py --confirm-hf-write`，推送 HF Space 并自动做只读验证。
7. 用户再次确认后执行 `python scripts\verify_forum_deploy.py --confirm-write-e2e`，在线上创建验证帖并评分，确认 `2510231106` 是管理员。

## 验证方式

1. 后端：`python -m pytest tests -q`
2. 后端部署 dry-run：`python scripts\deploy_forum_to_hf_test.py`
3. 前端：`npx.cmd vitest run src\utils\forum_view_identity_contract.spec.ts src\utils\forum_api.spec.ts src\styles\bottom_tab_bar_safe_area.spec.ts --testTimeout 60000`
4. 本地 API E2E：本地启动 OCR/FastAPI 后，对 `/api/forum/auth/token`、`/categories`、`/threads`、`/scores`、`/threads/{id}` 做请求。
5. 浏览器/Tauri 页面：打开 `#/2510231106/forum` 且带本地 API 覆盖，检查身份、版块、发帖和评分。
6. 线上只读：`python scripts\verify_forum_deploy.py --wait-seconds 300 --poll-seconds 15`
7. 线上写入：`python scripts\verify_forum_deploy.py --confirm-write-e2e`

## 回滚方案

1. HF Space 部署失败时，使用远端上一提交回推恢复。
2. 若论坛 API 生产配置缺失，保持 OCR `/health` 可用，论坛接口返回明确 503。
3. 线上写入 E2E 只创建带时间戳的验证帖，便于管理员后续删除或归档。
4. 不回滚用户已有本地改动；所有本轮提交限定在论坛相关文件。

## 完成标准

1. 本地后端论坛 API 和 OCR 服务共存，后端测试通过。
2. `2510231106` 本地验证为管理员，可发帖、评分、读帖。
3. Tauri 论坛入口和身份刷新回归测试通过，并能通过本地 API 覆盖验证页面请求后端。
4. HF Space 部署后 `/api/forum/categories`、`/threads/hot`、`/backups` 只读验证通过，且 HF Bucket 显示 configured。
5. 经用户确认后，线上写入 E2E 证明 `2510231106` 是管理员且发帖评分成功。
6. 明确记录生产必需 Secrets 和 OneDrive 灾备配置，不把未配置 Bucket 或 OneDrive 误报为成功。
