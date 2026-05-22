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

- [ ] 状态：未完成
- [ ] 检查需求是否已从小游戏纠偏回论坛目标
- [ ] 检查视觉基线、前端契约测试、后端契约测试是否覆盖用户要求
- [ ] 检查是否触碰高风险操作或泄露密钥
- [ ] 修复发现的问题并记录证据

记录：
- 检查内容：
- 修复内容：
- 验证结果：
- 剩余风险：

## Task 4: 后端 SQLPub/SQLite 论坛数据层完善

- [ ] 状态：未完成
- [ ] 实现或修正论坛独立表：分类、帖子、回复、评分、收藏、关注、举报、附件、用户扩展、通知、备份记录
- [ ] 保证 SQLPub 建表幂等，不删除或迁移已有成绩/排名表
- [ ] 补索引与分页查询，支撑约 2000 DAU 的常见列表读写
- [ ] 运行后端相关测试并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 5: 后端图床代理、HF Bucket 与备份接口

- [ ] 状态：未完成
- [ ] 实现附件上传、MIME/大小校验、sha256 去重、HF Private Bucket 上传、本地降级、代理访问和缓存头
- [ ] 实现备份记录接口与 OneDrive 同步脚本的可配置入口，不写真实密钥
- [ ] 更新 secret 配置脚本，只在用户确认后才能写入桌面 secret 文件或 HF secrets
- [ ] 运行后端相关测试并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 6: 后端论坛业务接口完善

- [ ] 状态：未完成
- [ ] 完善发帖、回帖、评分、收藏、关注、举报、通知、私信、个人主页、管理接口
- [ ] 所有写接口做输入校验、权限/身份边界、幂等或重复提交保护
- [ ] 所有读接口做分页、缓存头、轻量响应和错误格式统一
- [ ] 运行后端全量测试并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查-debug 循环 B（完成 Task 4-6 后执行）

- [ ] 状态：未完成
- [ ] 检查后端 API、数据一致性、缓存、附件、安全、备份设计
- [ ] 运行后端全量 pytest
- [ ] 检查危险操作是否仍处于未执行状态
- [ ] 修复发现的问题并记录证据

记录：
- 检查内容：
- 修复内容：
- 验证结果：
- 剩余风险：

## Task 7: 前端论坛 API、缓存与防重复提交层

- [ ] 状态：未完成
- [ ] 完善 `forum_api.js` 覆盖后端全部论坛接口
- [ ] 完善前端 TTL 缓存、stale fallback、写操作后缓存失效
- [ ] 实现统一 pending action 防重复提交和 toast 提示
- [ ] 运行前端相关测试并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 8: 前端论坛 Stitch 风格基础组件与布局

- [ ] 状态：未完成
- [ ] 基于 Stitch 包重做论坛页面设计 token 和基础组件：顶部、分段导航、卡片、列表项、按钮、输入、标签、toast、骨架屏
- [ ] 移除上一版不符合 Stitch 的视觉风格
- [ ] 保证移动端优先、文本不溢出、底部导航不遮挡内容
- [ ] 运行前端 UI contract 测试并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 9: 前端广场、详情、发帖页面重构

- [ ] 状态：未完成
- [ ] 按 Stitch 风格实现广场 Feed、分类筛选、搜索、热帖、帖子详情、回复、评分、收藏、关注、举报
- [ ] 发帖页支持分类、标题、正文、评分、附件上传和成功/失败提示
- [ ] 所有交互接入缓存失效和防重复提交
- [ ] 运行前端相关测试、浏览器移动端验收并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型全面检查-debug 循环 C（完成 Task 7-9 后执行）

- [ ] 状态：未完成
- [ ] 检查前端核心论坛页面是否严格贴近 Stitch 视觉
- [ ] 检查发帖、详情、附件、缓存、防重复提交是否可用
- [ ] 运行前端测试和 build
- [ ] 修复发现的问题并记录证据

记录：
- 检查内容：
- 修复内容：
- 验证结果：
- 剩余风险：

## Task 10: 前端通知、我的、个人主页页面重构

- [ ] 状态：未完成
- [ ] 按 Stitch 风格实现通知、私信、签到、我的统计、我的帖子、我的收藏、个人资料、徽章、用户主页
- [ ] 接入对应后端接口、缓存、空态、错误态、加载态
- [ ] 运行前端相关测试、浏览器移动端验收并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：已新增“我的资料”头像本地图片上传到论坛图床能力：复用 `client.uploadAttachment(file)`，上传成功后用 `client.getAttachmentUrl(...)` 自动回填 `profile.avatar_url`，并用 `runPending('profile:avatar-upload', ...)` 防止重复选择/重复上传；资料卡头像支持图片预览，保留原 URL 输入作为备用方式。
- 验证结果：`npx.cmd vitest run src\utils\forum_view_identity_contract.spec.ts --testTimeout 60000` 通过，4 tests passed；`npx.cmd vitest run --testTimeout 60000` 通过，29 files / 170 tests passed；`npm.cmd run build` 退出码 0，仍有既有 CSS minify warning 和动态导入 warning，未出现头像上传相关构建错误。
- 剩余风险：该记录来自上一轮头像上传增量，本轮仅纠正记录位置；尚未在真实 HF 图床/线上后端执行头像上传实传，需要后续本地联调或线上 smoke test 覆盖。
- 下一步：继续按 Task 2/后续任务推进论坛 UI 与集成验收。

## Task 11: 前端管理页、备份页与图床体验

- [ ] 状态：未完成
- [ ] 按 Stitch 风格实现管理页：举报列表、用户搜索、封禁/解封、徽章发放、备份记录和触发入口
- [ ] 完善附件/图片上传进度、预览、失败重试、代理 URL 展示
- [ ] 运行前端相关测试、浏览器移动端验收并提交
- [ ] 记录验证结果、剩余风险、下一步

记录：
- 完成内容：
- 验证结果：
- 剩余风险：
- 下一步：

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
