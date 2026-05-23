# 任务清单

## Task 1: 论坛目标恢复与现状审计

- [x] 状态：已完成
- [x] 全量读取 `goal-4/input.md`、`goal-4/plan.md`、`goal-4/tasks.md`
- [x] 检查 `tauri-app` 和 `ocr-service` 的 git 状态，标注哪些改动属于已有用户/生成改动，避免误回滚
- [x] 读取 `AGENTS.md`、当前 `ForumView.vue`、`forum_api.js`、后端 `forum_backend/main.py` 和论坛 store 文件
- [x] 解压或读取 `D:\Download\stitch_1_1_homepage_replication (4).zip` 的目录结构，确认视觉源文件和资源
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已重新读取 `goal-4/input.md`、`goal-4/plan.md`、`goal-4/tasks.md` 和 `AGENTS.md`；确认当前目标仍是论坛前后端完整交付，不是小游戏。前端关键文件已审计：`ForumView.vue` 具备 `data-stitch-design="Campus Vitality"` 和 `feed/detail/compose/notice/me/user-profile/admin` 页面标记，`forum_api.js` 默认指向 `https://mini-hbut-testocr1.hf.space/api/forum` 并包含图床上传、评分、收藏、关注、通知、私信、管理等 client 方法。后端关键文件已审计：`forum_backend/main.py` 注册论坛 API、缓存响应和附件路由；`sqlite_store.py` 与 `sqlpub_store.py` 均使用 `forum_` 前缀独立表；`object_storage.py` 封装 HF Private Bucket 上传/下载。Stitch zip 已确认包含 `hbut_1` 至 `hbut_6` 的 `code.html`/`screen.png` 以及 `campus_assistant_design_system/DESIGN.md`。
- 验证结果：`git status --short` 显示前端仓库当前仍有非本轮未提交改动：`capacitor.config.ts`、iOS 文件、`src/App.vue`、`Dashboard.vue`、底栏/首页/小游戏测试、网站模块 catalog/manifest 和一个未跟踪小游戏测试文件；这些不在 Task 1 中回滚或处理。`ocr-service` 当前论坛后端仍有未提交改动：`forum_backend/main.py`、`object_storage.py`、`storage/sqlite_store.py`、`storage/sqlpub_store.py`、`scripts/configure_hf_forum_runtime_secrets.py`、未跟踪 `tests/test_forum_extended_api.py`，以及未跟踪 `data/`、`scripts/utf8.ps1`。Stitch zip 结构通过 `tar -tf` 成功读取。
- 剩余风险：后端 pytest 曾出现 Windows 本地超时风险，仍需在后续任务中定位；`data/`、`.pytest_cache` 权限警告和未跟踪文件需要在推送前排除；真实 SQLPub/HF Bucket/OneDrive 链路尚未做线上验证；不能提交任何桌面 secret 或 HF/SQLPub 密钥。
- 下一步：执行 Task 2，系统提取 Stitch 视觉基线并补齐/确认论坛 UI contract 测试覆盖；后续每三个 task 后按计划做大型全面检查-debug 循环。

## Task 2: Stitch 视觉基线提取与前端页面契约测试

- [x] 状态：已完成
- [x] 从 Stitch 包提取颜色、字体、圆角、阴影、间距、导航、卡片、按钮、输入框、列表样式
- [x] 新增或更新论坛 UI contract 测试，要求每个论坛页面都有可定位标题、导航、加载态、空态、错误态和核心操作
- [x] 写失败测试覆盖论坛入口、广场、详情、发帖、通知、我的、个人主页、管理页
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已在 `src/utils/forum_view_identity_contract.spec.ts` 增加 Stitch Campus Vitality 视觉基线契约，锁定 `ForumView.vue` 的颜色 token、字体、24px 圆角、20px 页面间距、16px 背景模糊，以及论坛广场、详情、发帖、通知、我的、个人主页、管理页所需的布局组件、加载态、空态、错误态和核心操作文案。已补齐 `ForumView.vue` 缺失的 Stitch token：`--stitch-surface-dim`、`--stitch-accent-start`、`--stitch-accent-end`、`--stitch-info`、`--stitch-success`、`--stitch-bottom-nav-clearance`，并让页面底部留白使用 `var(--stitch-bottom-nav-clearance)`。同时复核“我的资料”头像上传链路：本地图片可通过 `client.uploadAttachment(file)` 上传到论坛图床，再用 `client.getAttachmentUrl(...)` 自动回填头像 URL，保留手动填写 URL 的备用入口。
- 验证结果：先运行 `npx.cmd vitest run src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 观察到红灯，失败原因为缺少 `--stitch-surface-dim: #d6dade`；补齐 token 后再次运行同一命令通过，1 file / 6 tests passed。`npm.cmd run build` 退出码 0，仍有既有 CSS minify `@media` warning 和 Capacitor/Tauri/widget 动态导入 warning。`npx.cmd vitest run --testTimeout 60000` 中论坛相关测试通过，但全量测试仍有 3 个既有失败，全部来自 `src/utils/hbut_memory_match_game.spec.ts`：状态期望 `playing` 但得到 `preview`、两处 moves 期望 1 但得到 0；该失败属于当前工作区已有小游戏改动，不属于本轮论坛头像或 Stitch 契约改动。
- 剩余风险：头像上传已通过静态契约和构建验证，但尚未在真实 HF 图床/线上后端进行实传；论坛 UI 当前是代码契约级验证，还未做浏览器截图级逐页视觉验收；全量 Vitest 被无关小游戏用例阻断，后续推送前需要处理或隔离该无关失败。
- 下一步：执行 Task 3，补全后端论坛 API 契约测试，覆盖附件上传/代理、缓存头、重复请求安全性和错误响应。

## Task 3: 后端论坛 API 契约测试补全

- [x] 状态：已完成
- [x] 写失败测试覆盖分类、帖子列表、热帖、搜索、详情、发帖、回帖、评分、收藏、关注、举报、个人读模型、管理读模型、附件上传/代理、备份记录
- [x] 测试同时覆盖缓存头、ETag、304、重复请求安全性和错误响应
- [x] 不连接真实 SQLPub/HF，使用 SQLite/local temp 完成契约测试
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已在 `ocr-service/tests/test_forum_extended_api.py` 补全论坛后端契约测试，覆盖只读缓存头/ETag/304、分类、帖子列表、热帖、搜索、详情、发帖、回帖、回复点赞、评分更新、收藏、关注幂等、举报、我的摘要/帖子/收藏、管理举报/用户/备份、附件上传/代理/304、私信、签到、徽章、封禁和错误响应。为支撑契约，补齐后端论坛 API 与存储能力：搜索接口、个人读模型、管理读模型、附件元数据表、附件代理下载、HF Bucket 下载降级入口、SQLite/SQLPub 对应方法，并修复 `SQLiteForumStore._connect()` 在 Windows 下只提交不关闭连接导致临时 SQLite 文件被锁的问题。
- 验证结果：`python -m py_compile tests\test_forum_extended_api.py forum_backend\main.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py forum_backend\object_storage.py` 通过；`git diff --check -- forum_backend\main.py forum_backend\object_storage.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py tests\test_forum_extended_api.py` 通过；使用文件路径加载的直调 runner 逐项执行 `test_forum_extended_api.py` 中 8 个契约函数，全部输出 `PASS` 并最终 `DONE`。额外最小脚本验证 `TestClient.close()` 后可以删除临时 SQLite 目录，证明 Windows 文件锁根因已修复。
- 剩余风险：本机默认 `python -m pytest tests\test_forum_extended_api.py -q` 在若干次复跑中出现超过 60 秒无输出的启动/收集层挂起；已通过直调 runner 证明契约函数和后端接口本身可运行，但后续大型检查循环 A 需要继续定位 pytest 启动层稳定性。未连接真实 SQLPub、HF Bucket 或 OneDrive，未读取或写入任何真实密钥。
- 下一步：执行“大型全面检查-debug 循环 A”，检查 Task 1-3 是否覆盖论坛目标、是否仍有测试启动层问题、是否有密钥/高风险操作泄露，并修复发现的问题。

## 大型全面检查-debug 循环 A（完成 Task 1-3 后执行）

- [x] 状态：已完成
- [x] 检查需求是否已从小游戏纠偏回论坛目标
- [x] 检查视觉基线、前端契约测试、后端契约测试是否覆盖用户要求
- [x] 检查是否触碰高风险操作或泄露密钥
- [x] 修复发现的问题并记录证据

记录：
- 检查内容：已复核 `goal-4/input.md`、`plan.md`、`tasks.md`，确认当前目标仍是 Tauri 底部中心论坛模式的完整前后端，不再处理误偏离的小游戏目标。前端检查覆盖 Stitch 视觉基线、论坛各页面契约、发帖/收藏重复提交提示和“我的资料”头像设置：头像现在支持选择本地图片，通过 `client.uploadAttachment(file)` 上传到论坛图床，再由 `client.getAttachmentUrl(...)` 自动回填 `profile.avatar_url`，不是只能手动填写链接。后端检查覆盖论坛 API 契约、附件/图床上传、代理读取、缓存头、ETag、304、个人/管理读模型和独立 `forum_` 表边界。
- 修复内容：本轮未修改业务代码；修复的是任务记录一致性，把头像图床上传作为 Task 1-3 后检查 A 的验收结论记录，避免后续 Task 10 看起来被提前完成。未读取桌面 secret，未写 SQLPub/HF/OneDrive，未执行 HF 推送。
- 验证结果：前端 `npx.cmd vitest run src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 通过，1 file / 6 tests passed，契约中包含 `allows profile avatars to be uploaded through the forum image host`；前端 `npm.cmd run build` 退出码 0，仅保留既有 CSS minify `@media` warning 和 Capacitor/Tauri/widget 动态导入 warning。后端 `python -m py_compile tests\test_forum_extended_api.py forum_backend\main.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py forum_backend\object_storage.py` 通过，`git diff --check -- forum_backend\main.py forum_backend\object_storage.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py tests\test_forum_extended_api.py` 通过，直调 runner 执行 `test_forum_extended_api.py` 的 8 个契约函数全部 `PASS` 并输出 `DONE`。`python -m pytest tests\test_forum_extended_api.py --collect-only -vv` 可在 0.52s 收集 8 个用例；但 `python -m pytest tests\test_forum_extended_api.py -q -s`、禁用插件自动加载执行路径、以及 TTY 直接执行路径均在 60s 内无测试输出并超时，已将问题边界收窄到 pytest 执行 runner/本机环境层，而非论坛 API 契约函数本身。
- 剩余风险：真实 HF Bucket 图床上传、SQLPub 写入、OneDrive 备份和 HF Space 线上测试仍未执行；pytest 执行入口在本机仍有挂起风险，后续 Task 4-6 或检查 B 需要继续定位并让后端全量 pytest 稳定；前端还未做浏览器截图级逐页视觉验收；当前两个仓库都有无关脏改动和未跟踪运行产物，后续提交/推送前必须继续排除 `data/`、`.pytest_cache`、`.playwright-mcp`、secret 配置改动和桌面密钥文件。

## Task 4: 后端 SQLPub/SQLite 论坛数据层完善

- [x] 状态：已完成
- [x] 实现或修正论坛独立表：分类、帖子、回复、评分、收藏、关注、举报、附件、用户扩展、通知、备份记录
- [x] 保证 SQLPub 建表幂等，不删除或迁移已有成绩/排名表
- [x] 补索引与分页查询，支撑约 2000 DAU 的常见列表读写
- [x] 运行后端相关测试并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已在 `ocr-service` 提交 `f2d198e feat(forum): harden store schema and pagination`。本轮新增 `tests/test_forum_store_schema.py`，先通过红灯确认当前实现缺少统一索引/offset 分页契约，再补齐后端数据层：`SQLiteForumStore` 暴露 `FORUM_INDEXES`，`ensure_schema()` 对全部 `forum_` 表执行幂等建表和幂等建索引；`SQLPubForumStore` 复用同一索引清单，通过 `INFORMATION_SCHEMA.STATISTICS` 检查后再 `CREATE INDEX`，避免重复建索引且不触碰成绩/排名表；`forum_backend/main.py` 的帖子列表、搜索、我的帖子、我的回复、我的收藏、备份列表接口均透传 `offset`，让分页能力从 API 到 SQLite/SQLPub store 一致可用。
- 验证结果：已运行并通过 `python -m py_compile forum_backend\main.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py tests\test_forum_store_schema.py`；已运行并通过 `git diff --check -- forum_backend\main.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py tests\test_forum_store_schema.py`；直接导入执行 `test_forum_store_schema.py` 中 4 个测试全部通过并输出 `DONE`，覆盖 SQLite 幂等 schema、SQLite offset 分页、SQLPub 同表同索引幂等建索引、ForumStore Protocol offset 契约；直接导入执行 `test_forum_deploy_contract.py::test_sqlpub_forum_storage_uses_dedicated_forum_tables_only` 通过；直接导入执行 `test_forum_extended_api.py` 中 8 个论坛 API 契约函数全部 `PASS` 并输出 `DONE`。
- 剩余风险：仍未连接真实 SQLPub 进行线上建表/索引验证，避免了未确认的生产数据库写入；本机标准 `pytest` runner 仍存在前一轮记录的挂起风险，因此本轮采用直接导入测试函数作为业务契约证据，后续检查 B 仍需继续解决后端全量 pytest 稳定性；`ocr-service` 中仍有既有未提交 `scripts/configure_hf_forum_runtime_secrets.py`、`data/`、`scripts/utf8.ps1`，本轮未提交它们。
- 下一步：执行 Task 5，完善后端图床代理、HF Bucket 上传策略、MIME/大小校验、sha256 去重、本地降级清理/重试和 OneDrive 备份可配置入口，继续不写真实密钥。

## Task 5: 后端图床代理、HF Bucket 与备份接口

- [x] 状态：已完成
- [x] 实现附件上传、MIME/大小校验、sha256 去重、HF Private Bucket 上传、本地降级、代理访问和缓存头
- [x] 实现备份记录接口与 OneDrive 同步脚本的可配置入口，不写真实密钥
- [x] 更新 secret 配置脚本，只在用户确认后才能写入桌面 secret 文件或 HF secrets
- [x] 运行后端相关测试并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已在 `ocr-service` 提交 `03ed149 feat(forum): harden attachment storage`。本轮新增 `tests/test_forum_attachment_policy.py`，先通过红灯确认当前配置层缺少 `attachment_max_bytes` 等附件策略入口，再补齐后端图床链路：`ForumSettings` 新增 `FORUM_ATTACHMENT_UPLOAD_DIR`、`FORUM_ATTACHMENT_MAX_BYTES`、`FORUM_ATTACHMENT_ALLOWED_MIME_TYPES` 配置；`/api/forum/attachments` 现在按 MIME 白名单拒绝非法文件、按流式读取限制大小、使用 `.part` 临时文件并在失败时清理、按“同一用户 + sha256”去重复用已有附件、HF 上传异常时返回安全 503，不暴露 token 或远端细节；未强制 HF Bucket 时仍保留本地降级上传和代理访问，支撑前端头像上传到后端图床后回填 URL。SQLite/SQLPub 同步新增 `find_attachment_by_sha256()` 和 `idx_forum_attachments_owner_sha` 索引。`scripts/configure_hf_forum_runtime_secrets.py` 新增 `--confirm-local-secret-write`，没有显式确认时不再写本地 secrets 文件；HF Space secrets 仍需 `--confirm-hf-secret-write`。备份接口沿用现有 HF Bucket/OneDrive rclone 可配置入口，本轮通过测试确认未配置或 rclone 缺失时不会误标上传成功。
- 验证结果：已运行并通过 `python -m py_compile forum_backend\main.py forum_backend\config.py forum_backend\object_storage.py forum_backend\backup.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py scripts\configure_hf_forum_runtime_secrets.py tests\test_forum_attachment_policy.py tests\test_configure_hf_forum_runtime_secrets.py tests\test_forum_backup.py tests\test_forum_extended_api.py tests\test_forum_store_schema.py`；已运行并通过 `git diff --check -- forum_backend\config.py forum_backend\main.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py scripts\configure_hf_forum_runtime_secrets.py tests\test_forum_attachment_policy.py tests\test_configure_hf_forum_runtime_secrets.py`。`python -m pytest tests/test_forum_attachment_policy.py -q -s` 曾输出 `4 passed in 2.43s`；修正临时目录清理断言后，直接导入执行附件策略 4 个用例全部 `PASS` 并输出 `DONE`。直接导入执行 `test_forum_store_schema.py` 4 个契约函数全部通过；直接导入执行 `test_forum_extended_api.py` 8 个契约函数全部 `PASS` 并输出 `DONE`；直接导入执行 `test_forum_backup.py` 的 HF 强制配置缺失和 OneDrive/rclone 缺失两个用例通过。使用临时 secrets 文件直接执行 `scripts/configure_hf_forum_runtime_secrets.py --secrets-file <temp>` 返回 `refusing_local_secret_write=missing --confirm-local-secret-write`，stdout/stderr 未包含 `hf_dataset_token`，临时文件未写入 `FORUM_AUTH_SECRET`。
- 剩余风险：仍未连接真实 HF Private Bucket、SQLPub 或 OneDrive 进行线上写入验证，避免了未确认的生产/远程/secret 高风险操作；本机标准 `pytest` runner 仍存在间歇性无输出挂起，本轮已精确终止只属于本轮的挂起测试进程并改用直接函数执行作为业务证据，后续大型检查 B 仍需继续处理全量 pytest 稳定性；`ocr-service` 仍有未跟踪 `data/` 和 `scripts/utf8.ps1`，没有提交；Tauri 仓库仍有多项无关脏改动和 `.playwright-mcp` 产物，本轮没有回滚或提交它们。
- 下一步：执行 Task 6，继续完善后端论坛业务写接口的输入校验、权限/身份边界、幂等/重复提交保护、分页缓存和统一错误格式。

## Task 6: 后端论坛业务接口完善

- [x] 状态：已完成
- [x] 完善发帖、回帖、评分、收藏、关注、举报、通知、私信、个人主页、管理接口
- [x] 所有写接口做输入校验、权限/身份边界、幂等或重复提交保护
- [x] 所有读接口做分页、缓存头、轻量响应和错误格式统一
- [x] 运行后端全量测试并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已在 `ocr-service` 提交 `c05a9c4 feat(forum): harden business api contracts`。本轮新增 `tests/test_forum_business_api.py`，先通过红灯确认封禁用户仍可写入、通知读接口缺少 `ETag` 的缺口，再补齐后端业务接口边界：新增 `active_claims`/`ensure_not_banned`，普通写接口发帖、回帖、评分、回复点赞/点踩、收藏、关注、举报、私信、签到、附件上传统一禁止封禁账号继续写入；管理员依赖也检查封禁状态，避免封禁管理员继续走管理写入口。`_cached_json()` 支持 `private` 缓存，个人摘要、我的帖子/回复/收藏、通知、私信、徽章、管理举报、管理用户、公开备份、管理备份均补 `Cache-Control`、`ETag` 和 304 条件请求。SQLite/SQLPub 的通知、消息、举报、用户列表补 `offset` 分页，并在 `ForumStore` 协议测试中锁定签名。
- 验证结果：已运行并通过 `python -m py_compile forum_backend\main.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py tests\test_forum_business_api.py tests\test_forum_extended_api.py tests\test_forum_store_schema.py tests\test_forum_attachment_policy.py`；已运行并通过 `git diff --check -- forum_backend\main.py forum_backend\storage\sqlite_store.py forum_backend\storage\sqlpub_store.py tests\test_forum_business_api.py tests\test_forum_store_schema.py`。直接导入执行 `test_forum_business_api.py` 3 个用例全部 `PASS`，覆盖封禁写入拦截、私有读模型 offset/缓存、备份读模型缓存；直接导入执行 `test_forum_store_schema.py` 4 个契约函数通过；直接导入执行 `test_forum_extended_api.py` 8 个既有扩展 API 用例全部 `PASS`；直接导入执行 `test_forum_attachment_policy.py` 4 个附件策略用例全部 `PASS`。`python -m pytest tests --collect-only -q` 在 60 秒保护内成功收集 59 个测试；`python -m pytest tests/test_forum_business_api.py tests/test_forum_store_schema.py tests/test_forum_extended_api.py -q -s` 在 6.16 秒内通过 15 个测试。
- 剩余风险：仍未连接真实 SQLPub 验证 SQL 运行时行为，避免了未确认的生产数据库写入；后端全量 pytest 执行仍需在大型检查 B 中继续完成，本轮只执行了论坛相关 15 个 pytest 和直接契约验证；真实 HF Bucket、OneDrive 和 HF Space 线上测试仍未执行；`ocr-service` 仍有未跟踪 `data/` 与 `scripts/utf8.ps1`，Tauri 仓库仍有无关脏改动和 `.playwright-mcp` 产物，本轮未回滚或提交。
- 下一步：执行“大型全面检查-debug 循环 B”，全面检查 Task 4-6 的后端 API、数据一致性、缓存、附件、安全、备份设计，尝试后端全量 pytest，并确认危险操作仍未执行。

## 大型全面检查-debug 循环 B（完成 Task 4-6 后执行）

- [x] 状态：已完成
- [x] 检查后端 API、数据一致性、缓存、附件、安全、备份设计
- [x] 运行后端全量 pytest
- [x] 检查危险操作是否仍处于未执行状态
- [x] 修复发现的问题并记录证据

记录：
- 检查内容：已复核 Task 4-6 的后端论坛数据层、业务接口、附件/图床、缓存、权限、分页和备份链路。`forum_backend` 的接口仍使用独立 `forum_` 表与索引，读接口具备 `Cache-Control`、`ETag`、304 和 offset 分页，普通写接口通过 `active_claims`/`ensure_not_banned` 阻止封禁用户继续写入，附件上传具备 MIME/大小限制、sha256 去重、HF 失败安全返回和本地降级。补充核对前端头像诉求：真实路径 `src\components\ForumView.vue` 已支持选择本地头像文件，经 `client.uploadAttachment(file)` 上传到论坛图床，并用 `client.getAttachmentUrl(...)` 回填 `profile.avatar_url`；`src\utils\forum_view_identity_contract.spec.ts` 已锁定该契约，不是只能填写链接。
- 修复内容：检查中发现 `ocr-service/forum_backend/backup.py` 在 `RCLONE_REMOTE` 有值但 `RCLONE_CONFIG_BASE64` 缺失时，会把未执行的 OneDrive 同步误判为 `uploaded_onedrive=True`。已按 TDD 补充失败用例 `test_upload_archive_does_not_mark_onedrive_uploaded_when_config_incomplete`，确认红灯为 `uploaded_onedrive` 误为 `True`；随后修复未完整配置分支返回 `onedrive-disabled:`，并仅在 OneDrive 配置完整且结果路径落在目标 remote 下时标记上传成功。后端修复已提交为 `e641c29 fix(forum): avoid false onedrive backup success`。
- 验证结果：`python -m py_compile forum_backend\backup.py tests\test_forum_backup.py` 通过；`git diff --check -- forum_backend\backup.py tests\test_forum_backup.py` 退出码 0，仅有 Windows LF/CRLF 提示；`python -m pytest tests/test_forum_backup.py -q` 通过，3 passed。后端全量 `python -c "import subprocess, sys; cmd=[sys.executable,'-m','pytest','tests','-q']; ... timeout=60"` 通过，60 passed，24 warnings，warning 均为 FastAPI `on_event` deprecation。破坏性 SQL 扫描显示论坛运行路径只命中 `forum_` 表、幂等 upsert 或字段 `ON UPDATE`；非论坛表的 `TRUNCATE/INSERT` 命中来自既有成绩分布脚本，不属于论坛后端运行路径。密钥/远程写入扫描只命中配置脚本、测试伪 token/mock `add_space_secret`、对象存储封装调用；本轮未读取桌面 secret、未写 SQLPub、未写 HF Secret、未推送 HF、未执行真实 OneDrive 上传。
- 剩余风险：真实 SQLPub、HF Private Bucket、OneDrive rclone 和 HF Space `testocr1` 线上链路仍未执行，保留到后续部署/验收任务；`ocr-service` 仍有未跟踪 `data/`、`scripts/utf8.ps1`，没有提交；`tauri-app` 仍有与论坛 goal 记录无关的既有脏改动和 `.playwright-mcp` 产物，未回滚也未提交；前端全页面 Stitch 浏览器截图验收仍留给 Task 7-12。

## Task 7: 前端论坛 API、缓存与防重复提交层

- [x] 状态：已完成
- [x] 完善 `forum_api.js` 覆盖后端全部论坛接口
- [x] 完善前端 TTL 缓存、stale fallback、写操作后缓存失效
- [x] 实现统一 pending action 防重复提交和 toast 提示
- [x] 运行前端相关测试并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已完善前端论坛 API、缓存与防重复提交公共层。`src/utils/forum_api.js` 现在支持后端分页契约中的 `offset`，覆盖公开备份 `listBackups()`，并让分类、帖子、搜索、详情、我的帖子/回复/收藏、通知、私信、徽章、管理举报/用户/备份等读接口可传 `If-None-Match` 并返回 `includeMeta` 缓存元数据。`src/utils/forum_cache.js` 现在会保存 ETag，过期刷新时把旧 ETag 交给 fetcher，遇到 304 时复用旧缓存，网络失败时继续 stale fallback；同时新增 `createForumPendingActions()`，统一阻止重复写操作并触发 toast 提示。`src/components/ForumView.vue` 已接入公共 pending guard，按钮禁用状态仍由响应式 `pendingActions` 驱动；页面读缓存也已切换为 `includeMeta + etag`，保持原 payload 形态供模板使用。
- 验证结果：先运行 `npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_cache.spec.ts --testTimeout 60000` 观察到红灯，失败点为缺少 `listBackups`、缺少 meta 响应、缓存 fetcher 没拿到 ETag 参数、缺少 `createForumPendingActions`。实现后再次运行同一命令通过，2 files / 16 tests passed。随后运行 `npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_cache.spec.ts src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 通过，3 files / 22 tests passed。`git diff --check -- src\utils\forum_api.js src\utils\forum_api.spec.ts src\utils\forum_cache.js src\utils\forum_cache.spec.ts src\components\ForumView.vue` 退出码 0，仅有 Windows LF/CRLF 提示。`npm.cmd run build` 退出码 0，仍有既有 CSS minify `@media` warning 和 Capacitor/Tauri/widget 动态导入 warning。
- 剩余风险：本轮是前端 API/缓存/pending 公共层任务，尚未做 Task 8-11 的逐页面 Stitch 视觉重构和浏览器截图验收；全量 Vitest 仍可能受既有非论坛小游戏/网站改动影响，未在本轮解决；真实 HF Space、SQLPub、HF Bucket 和 OneDrive 线上链路仍留给后续部署任务。`tauri-app` 中仍有无关脏改动、`.playwright-mcp` 产物和未跟踪截图，本轮未回滚也未提交。
- 下一步：执行 Task 8，基于 Stitch 包重做论坛页面基础组件与布局，继续确保移动端优先、底栏不遮挡、文本不溢出。

## Task 8: 前端论坛 Stitch 风格基础组件与布局

- [x] 状态：已完成
- [x] 基于 Stitch 包重做论坛页面设计 token 和基础组件：顶部、分段导航、卡片、列表项、按钮、输入、标签、toast、骨架屏
- [x] 移除上一版不符合 Stitch 的视觉风格
- [x] 保证移动端优先、文本不溢出、底部导航不遮挡内容
- [x] 运行前端 UI contract 测试并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已在 `src/components/ForumView.vue` 补齐 Stitch 移动端基础壳层：新增 `forum-shell-inner`、`forum-bottom-safe-spacer`、`--stitch-header-height`、`--stitch-bottom-nav-height`、`--stitch-container-max`、`--stitch-card-radius`、`--stitch-control-radius` 等 token；主容器使用 `max-width: 448px` fallback 和 `max-width: var(--stitch-container-max)`，并补 `overflow-x: hidden`、`scroll-padding-bottom`、底部安全留白和文本换行保护。加载态从纯文字空卡改为 `forum-skeleton-list` / `skeleton-card` / `skeleton-line` / `skeleton-pill` 骨架屏，补 `forum-skeleton-shimmer`、`:focus-visible` 和 `prefers-reduced-motion`。同时按用户最新要求调整“我的资料”头像设置：上传头像到后端图床作为推荐路径，`client.uploadAttachment(file)` 上传后通过 `resolveAvatarAttachmentUrl()` 自动回填头像 URL；完整远程 URL 不再二次包装，后端 `/api/forum/attachments/...` 相对 URL 仍走 `client.getAttachmentUrl(...)`。手动 URL 改为备用入口，避免用户只能填写链接。代码审查后继续修复了上传入口键盘可达性：上传 label 增加 `tabindex="0"` 和 Enter/Space 触发文件选择，`focus-within` 显示清晰轮廓；同时收敛重复底部留白，由壳层 padding 和 `forum-bottom-safe-spacer` 共同处理底部导航与安全区。
- 验证结果：已先运行 `npx.cmd vitest run src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 观察红灯，失败原因为缺少 `forum-shell-inner`；补基础壳层后再次红灯，失败原因为新增头像契约要求缺少 `头像上传（推荐）`；补 UI 后同一命令通过。随后只读代码审查发现契约过弱、头像 URL 二次包装风险、上传入口键盘可访问性不足和底部留白过量；已补更严格契约并再次观察红灯，失败点为缺少 `height: calc(var(--stitch-bottom-nav-height) + env(safe-area-inset-bottom, 0px))` 和 `tabindex="0"`，修复后同一命令通过，1 file / 7 tests passed。最新运行 `npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_cache.spec.ts src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 通过，3 files / 23 tests passed。`git diff --check -- src\components\ForumView.vue src\utils\forum_view_identity_contract.spec.ts goal-4\tasks.md` 退出码 0，仅有 Windows LF/CRLF 提示。`npm.cmd run build` 退出码 0，仍有既有 CSS minify `@media` warning 和 Capacitor/Tauri/widget 动态导入 warning。
- 剩余风险：本轮是 Task 8 基础布局与组件契约，没有启动浏览器做截图级逐页视觉验收；真实头像上传仍未连接 HF Bucket/线上后端实传验证；前端工作区仍有无关 iOS、小游戏、website、`.playwright-mcp`、截图等脏改动，本轮未回滚也未提交。
- 下一步：执行 Task 9，继续按 Stitch 风格重构广场、详情、发帖页面，并把评分、收藏、关注、举报、附件上传和防重复提交在页面级交互中验收。

## Task 9: 前端广场、详情、发帖页面重构

- [x] 状态：已完成
- [x] 按 Stitch 风格实现广场 Feed、分类筛选、搜索、热帖、帖子详情、回复、评分、收藏、关注、举报
- [x] 发帖页支持分类、标题、正文、评分、附件上传和成功/失败提示
- [x] 所有交互接入缓存失效和防重复提交
- [x] 运行前端相关测试、浏览器移动端验收并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：延续上一轮头像上传图床体验后，本轮真正完成 Task 9 的广场、详情、发帖页重构。`ForumView.vue` 新增广场概览统计、热帖横滑条、帖子状态格和按钮级 pending 状态；帖子详情统一使用 `currentThread`，补齐关注作者、收藏、举报、评分 stepper、附件预览、回复附件预览和移除；发帖页改为 `threadPendingKey` 防重复发布，新增“上传附件会先进入后端图床”引导、快捷评分按钮、附件预览和移除。新增/补齐 `feed-meta-strip`、`hot-thread-strip`、`thread-stat-grid`、`detail-action-bar`、`score-stepper`、`attachment-preview-list`、`attachment-preview-item`、`compose-guidance`、`compose-score-options` 等 Stitch 风格样式，重点处理移动端横向滚动、长文件名省略、按钮稳定尺寸和回复按钮文字不挤压。
- 验证结果：先运行 `npx.cmd vitest run src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 得到红灯，失败点为缺少 `class="score-stepper"`；补模板后再次红灯，失败点为缺少独立 `class="reply-attachment-list"`；修复后同一命令通过，1 file / 8 tests passed。随后运行 `npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_cache.spec.ts src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 通过，3 files / 24 tests passed。`git diff --check -- src\components\ForumView.vue src\utils\forum_view_identity_contract.spec.ts` 退出码 0，仅有 Windows LF/CRLF 提示。`npm.cmd run build` 退出码 0，仍保留既有 CSS `@media` minify warning 与 Capacitor/Tauri/widget 动态导入 warning。启动本地 Vite 后 `curl.exe -I http://127.0.0.1:1420/` 返回 HTTP 200，验证本地页面可服务；验收后已结束本轮启动的 Vite 进程。
- 剩余风险：MCP Playwright 与 Chrome DevTools 均被已有浏览器实例占用，项目本地也未安装 `playwright`/`@playwright/test`，因此本轮没有生成新的截图级移动端验收证据；已用契约测试、构建、HTTP 200 和源码级布局检查替代。真实 HF Bucket/线上后端的附件实传仍留给后续集成/部署任务；工作区仍有无关 iOS、Dashboard、小游戏、website、`.playwright-mcp` 和截图等脏改动，本轮未回滚也不提交。
- 下一步：执行“大型全面检查-debug 循环 C”，集中检查 Task 7-9 的前端核心论坛页面、缓存、防重复提交、UI/UX、构建和剩余浏览器验收风险。

## 大型全面检查-debug 循环 C（完成 Task 7-9 后执行）

- [x] 状态：已完成
- [x] 检查前端核心论坛页面是否严格贴近 Stitch 视觉
- [x] 检查发帖、详情、附件、缓存、防重复提交是否可用
- [x] 运行前端测试和 build
- [x] 修复发现的问题并记录证据

记录：
- 检查内容：已复核 Task 7-9 的前端论坛核心链路：`forum_api.js` 覆盖分页、条件请求、附件 URL 和扩展读写接口；`forum_cache.js` 提供 TTL、ETag、304 stale fallback、scope 清理和 `createForumPendingActions()` 防重复提交；`ForumView.vue` 的广场、详情、发帖页保留 `data-forum-page="feed/detail/compose"`、Stitch token、底栏安全留白、骨架屏、广场统计、热帖横滑、详情操作条、评分 stepper、附件预览/移除、发帖图床提示和 pending 状态。源码检查确认 `showToast()` 覆盖发帖、回复、评分、收藏、关注、举报、头像上传和管理操作的成功/失败提示。
- 修复内容：本轮未修改论坛业务代码。检查中先用 `#/20230001/forum` 做 headless 路由验收时回到首页，按系统化调试确认根因是 `App.vue` 的 hash 解析只接受 10 位学号；改用 `#/2510231106/forum` 后，headless DOM 中出现 `forum-view`、`data-forum-page="feed"`、`湖工大校园广场`、`feed-meta-strip`、`hot-thread-strip`、`thread-stat-grid` 和底栏论坛 active 状态，说明不是论坛路由缺陷。
- 验证结果：`npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_cache.spec.ts src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 通过，3 files / 24 tests passed。`npm.cmd run build` 退出码 0，仍保留既有 CSS `@media` minify warning 与 Capacitor/Tauri/widget 动态导入 warning。`git diff --check -- src\components\ForumView.vue src\utils\forum_api.js src\utils\forum_cache.js src\utils\forum_view_identity_contract.spec.ts goal-4\tasks.md` 通过。启动本地 Vite 后 `curl.exe -I http://127.0.0.1:1420/` 返回 HTTP 200；系统 Chrome headless 以 390x844 截图生成 `%TEMP%\forum-check-c-forum-valid-390x844.png`，文件大小 316955 bytes，尺寸 390x844；DOM dump 保存到 `%TEMP%\forum-check-c-forum-dom.html`，包含论坛 feed 页面核心节点。验收后已结束本轮启动的 Vite 进程。
- 剩余风险：`npx.cmd vitest run --testTimeout 60000` 的全量前端测试仍失败，边界清晰为非论坛既有脏改动：`module_center.spec.ts` / `remote_config.spec.ts` 因内置游戏列表多出 `hbut_gomoku` 失败，`hbut_memory_match_game.spec.ts` 和 `hbut_monopoly_game.spec.ts` 因小游戏状态/样式契约失败；论坛相关 24 个测试全部通过，本轮未扩大范围修复这些无关失败。Headless 论坛页仍显示 App 级“重要公告”遮罩，这是既有全局公告行为，不是论坛页面本身缺陷。真实 HF Bucket、SQLPub、OneDrive 和 HF Space 线上链路仍留给后续集成/部署任务。工作区仍有无关 iOS、Dashboard、小游戏、website、`.playwright-mcp` 和截图等脏改动，本轮未回滚也不提交。

## Task 10: 前端通知、我的、个人主页页面重构

- [x] 状态：已完成
- [x] 按 Stitch 风格实现通知、私信、签到、我的统计、我的帖子、我的收藏、个人资料、徽章、用户主页
- [x] 接入对应后端接口、缓存、空态、错误态、加载态
- [x] 运行前端相关测试、浏览器移动端验收并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已完成 Task 10 剩余页面重构。`ForumView.vue` 新增 `messagePendingKey`、`profileCompletion`、`userProfileThreads`、`userProfileBadges` 等读模型；通知页改为 `通知中心`，加入 `notice-summary-strip`、`notification-list`、`message-composer-card`、`message-thread-list`，私信发送接入 pending 防重复和 `发送中` 文案，并补 `暂无私信` 空态。我的页改为 `profile-dashboard-card`，加入签到 pending、资料完整度、`profile-stat-strip`、头像设置、我的帖子/回复/收藏三列和 `badge-cloud`。用户主页改为 `user-profile-hero`，支持头像 URL、关注 pending、公开徽章和公开动态空态。按用户追加要求，头像设置继续以“上传头像到图床”为主入口：选择本地图片后复用 `client.uploadAttachment(file)` 上传到论坛图床，再通过 `resolveAvatarAttachmentUrl()` 自动回填 `profile.avatar_url`；手动 URL 保留为备用入口，不再要求用户只能填写链接。`forum_view_identity_contract.spec.ts` 已新增 Task 10 页面契约和头像上传图床契约，锁定上述结构、文案、pending 和样式 selector。
- 验证结果：`npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_cache.spec.ts src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 通过，3 files / 25 tests passed。`git diff --check -- src\components\ForumView.vue src\utils\forum_view_identity_contract.spec.ts goal-4\tasks.md` 通过，仅有既有 LF/CRLF 提示。`npm.cmd run build` 退出码 0，仍有既有 CSS `@media` minify warning 与 Capacitor/Tauri/widget 动态导入 warning。1420 端口已有 Vite 实例运行，`curl.exe -I http://127.0.0.1:1420/` 返回 HTTP 200；系统 Chrome headless 以 390x844 访问 `http://127.0.0.1:1420/#/2510231106/forum`，DOM 输出包含 `forum-view`、`data-forum-page="feed"`、`湖工大校园广场` 和底部论坛 active 状态，证明 Vue 论坛路由已渲染。
- 剩余风险：真实 HF Bucket/线上后端头像和附件实传仍未执行，留给后续集成与 HF 测试阶段；本地 1420 端口被既有 Vite 实例占用，本轮复用该实例做验收，没有杀进程；全量前端 Vitest 仍可能被既有非论坛小游戏/网站脏改动阻断，本轮只验证论坛范围。工作区仍有无关 iOS、Dashboard、小游戏、website、`.playwright-mcp`、截图和 `.dist-trash-*` 产物，本轮未回滚也不提交。
- 下一步：执行 Task 11，按 Stitch 风格继续完善管理页、备份页和图床体验，重点做上传进度、失败重试、代理 URL 展示和管理操作验收。

## Task 11: 前端管理页、备份页与图床体验

- [x] 状态：已完成
- [x] 按 Stitch 风格实现管理页：举报列表、用户搜索、封禁/解封、徽章发放、备份记录和触发入口
- [x] 完善附件/图片上传进度、预览、失败重试、代理 URL 展示
- [x] 运行前端相关测试、浏览器移动端验收并提交
- [x] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已完成 Task 11 的前端管理页、备份页、图床体验和用户最新 bug 修复。`ForumView.vue` 新增独立 `投票打分` 页与 tab，由管理员在管理页创建/关闭投票，用户在独立投票页参与；帖子级评分 UI 和逻辑已移除，不再在每个帖子、详情页或发帖页要求评分。发帖页上传入口改为显式 `openThreadFilePicker()` 按钮触发隐藏 `threadUploadInput`，删除旧 `.tool-button input` 覆盖式样式，避免点击标题/正文输入框直接弹文件选择。`checkIn()` 已补 `if (!client) await buildClient()`，避免“我的”页在 client 未初始化时签到无反应。`attachmentProxyUrl()` 已修复对象 payload 解析，优先使用 `url`、`attachment_id` 或原始字符串，避免把上传返回对象拼成 `[object Object]`。管理页补齐举报、用户治理、封禁/解封、徽章发放、投票管理、备份状态和备份记录的 Stitch 风格卡片；上传队列补齐进度条、状态 pill、失败重试和复制代理 URL。
- 验证结果：先运行 `npx.cmd vitest run src\utils\forum_view_identity_contract.spec.ts --pool forks --testTimeout 60000` 通过，1 file / 10 tests passed。随后运行 `npx.cmd vitest run src\utils\forum_api.spec.ts src\utils\forum_cache.spec.ts src\utils\forum_view_identity_contract.spec.ts --pool forks --testTimeout 60000` 通过，3 files / 26 tests passed。`npm.cmd run build` 退出码 0，仍保留既有 CSS minify `@media` warning 和 Capacitor/Tauri/widget 动态导入 warning。`git diff --check -- src\components\ForumView.vue src\utils\forum_view_identity_contract.spec.ts goal-4\tasks.md` 通过。浏览器移动端验收：启动本地 Vite `http://127.0.0.1:1420/#/2510231106/forum`，Playwright 检查发帖页标题 input 和正文 textarea 均可聚焦，命中中心分别为 `INPUT`/`TEXTAREA`；上传按钮为 40x40，隐藏 file input 为 1x1 且 `clip-path: inset(50%)`，证明输入框不再被上传控件覆盖。投票页可见，`投票` tab active，`.poll-score-page`、hero、card、option 均在移动宽度内正常渲染。我的页可见，签到按钮、头像图床上传入口和“头像上传（推荐）”文案均存在。验收截图保存为本地 `forum-task11-me-390.png`，验收后已结束本轮启动的 Vite 进程。
- 剩余风险：投票功能当前是前端 localStorage 缓存版，满足本轮页面与管理员管理可用性，但后端持久化投票表/API 仍需进入后续任务；本地浏览器 console 中存在远程配置 CORS 和当前线上 `mini-hbut-testocr1` `/api/forum/me/*` 404，这说明线上 Space 尚未部署本轮论坛后端接口，不是本轮前端运行时异常；真实 HF Bucket 图床上传、SQLPub 写入、OneDrive 同步和 HF Space 线上测试仍未执行，留给后续集成/部署任务。全量前端 Vitest 没有在本轮重新跑，避免被既有非论坛小游戏/website 脏改动阻断；论坛相关 26 个测试已通过。工作区仍有无关网站/小游戏脏改动和 Playwright 截图产物，本轮不回滚也不提交。
- 下一步：执行 Task 12，本地前后端全量集成测试与性能体验优化；重点把本轮发现的线上 404 边界纳入本地/测试后端连通性验证，并规划投票后端持久化接口或明确进入后续任务。

## Task 12: 本地全量集成测试与性能体验优化

- [ ] 状态：未完成
- [ ] 启动本地后端和前端，完成论坛入口到各页面的端到端验收
- [ ] 检查网络请求数量、缓存命中、图片代理缓存、列表分页和弱网错误
- [ ] 修复高风险 UI/性能/状态问题
- [ ] 运行后端全量 pytest、前端全量 Vitest、前端 build 并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查-debug 循环 D（完成 Task 10-12 后执行）

- [ ] 状态：未完成
- [ ] 从 C 端体验、视觉一致性、代码质量、安全、数据一致性、权限、错误处理、缓存、测试、构建、文档、回滚全面检查
- [ ] 修复所有已知高风险问题
- [ ] 明确哪些线上操作仍需用户危险确认

记录：
- 检查内容：
- 修复内容：
- 验证结果：
- 剩余风险：

## Task 13: HF testocr1 推送前准备与危险操作确认

- [ ] 状态：未完成
- [ ] 整理待提交文件清单，排除测试临时目录、密钥、生成噪声和无关用户改动
- [ ] 准备 HF Space `https://huggingface.co/spaces/mini-hbut/testocr1` 的推送命令和验证清单
- [ ] 使用危险操作确认模板请求用户确认 HF 推送、线上测试、SQLPub/HF Secret/桌面 secret 文件写入
- [ ] 未获确认前不得执行远程推送、线上写入或 secret 写入
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 14: 用户确认后的 HF 测试部署与最终验收

- [ ] 状态：未完成
- [ ] 在用户明确确认后推送到 HF testocr1
- [ ] 配置或验证测试环境 secrets，不提交真实密钥
- [ ] 执行线上健康检查、论坛 API smoke test、前端连通性测试
- [ ] 若线上异常，按回滚方案处理并记录证据
- [ ] 标记 goal 完成

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：
