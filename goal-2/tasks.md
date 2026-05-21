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

- [ ] 状态：未完成
- 范围：后端测试、部署 dry-run、前端论坛测试、工作区状态。
- 目标：确认可以进入 HF 写入确认门。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型检查 A：完成 Task 1-3 后执行

- [ ] 状态：未完成
- 检查项：需求偏离、OCR 兼容性、管理员权限、数据存储、HF Bucket、OneDrive 灾备、前端 Tauri 集成、安全边界。
- 执行记录：
- 结论：
- 修复项：

## Task 4：HF Space 只读部署验证

- [ ] 状态：未完成
- 前置：用户明确回复“是/确认/继续”允许 HF 写入部署。
- 范围：推送 `ocr-service` 到 `mini-hbut/testocr1` 并等待 Space 重建。
- 验证：`/health`、`/api/forum/categories`、`/api/forum/threads/hot`、`/api/forum/backups`，且 HF Bucket configured。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 5：线上写入 E2E 与管理员确认

- [ ] 状态：未完成
- 前置：用户单独明确确认允许线上写入。
- 范围：线上签发 token、确认 `2510231106` 管理员、创建验证帖、评分、读详情。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## 最终完成审计

- [ ] 状态：未完成
- 要求：逐条对照 `goal-2/input.md` 和 `goal-2/plan.md` 的完成标准，只有证据充分时才能标记 goal complete。
- 执行记录：
- 结论：
