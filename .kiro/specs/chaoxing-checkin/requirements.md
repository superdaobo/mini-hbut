# Requirements Document

## Introduction

本规范描述 **Mini-HBUT · 学习通签到（Chaoxing_Checkin）** 功能：在"更多"页的模块中心新增一个卡片，点击进入后可完成超星学习通（Chaoxing）常见签到场景（普通 / 位置 / 拍照 / 二维码 / 手势）。功能与协议实现**参考并移植** `AneryCoft/course_helper` 仓库的 Dart/Flutter 签到协议逻辑（两方均为 GPL v3 许可，协议兼容，允许移植但需保留原始版权声明与 GPL v3 授权声明）；同时**复用**本项目现有的学习通基础设施（SSO 跳转、密码登录、扫码登录与 Cookie 持久化），保持与 `OnlineLearningChaoxingView.vue`、`modules/online_learning.rs`、`http_client/session.rs` 一致的风格与安全边界。

关键架构假设（本文档全部 SHALL 条款在此前提下成立）：

- 前端沿用 Vue 3 + Vite + `src/components/templates/*` 模板组件，新增 `MoreChaoxingCheckinView.vue`（内部模块，不走远程模块清单下发链路）。
- 后端沿用现有 `HbutClient` 单例 + `Arc<Mutex<AppState>>`；新增一组 `#[tauri::command]` 处理签到流程，命名前缀 `chaoxing_checkin_*`，实现文件建议为 `src-tauri/src/modules/chaoxing_checkin.rs`（挂载于 `modules/mod.rs`）。
- 超星签到协议（`preSign` / `pptSign` / `analysis` / `analysis2` / `chatGroup` / `newsign` 等端点的入参组装、header 指纹、用户信息抓取 `mooc1-api.chaoxing.com/mycourse/backclazzdata` 等）**参考并移植** `AneryCoft/course_helper` 仓库 Dart 层实现，移植结果用 Rust 重写（不内嵌 Dart/Flutter 二进制），且在源文件头部保留 `SPDX-License-Identifier: GPL-3.0-or-later` 与对 `course_helper` 的 Attribution 注释。
- Cookie 持久化仅复用 `db::save_online_learning_platform_state` / `db::get_online_learning_platform_state`（platform = `chaoxing`），不新增第二套存储。
- 登录入口复用既有 `chaoxing_password_login` / `chaoxing_qr_init_login` / `chaoxing_qr_refresh_login` / `chaoxing_qr_check_status` / `chaoxing_qr_confirm_login` Tauri 命令，以及 `LoginV3.vue` 的学习通模态；签到模块不新增第二条登录通道。
- 设计系统：`design-system/mini-hbut-frontend/MASTER.md` 与 `design-system/mini-hbut/MASTER.md` 作为规范基线，实际 UI 变量遵循项目运行时已生效的 `--ui-*` tokens（`--ui-primary`、`--ui-surface`、`--ui-text`、`--ui-muted`、`--ui-danger`、`--ui-success`、`--ui-warning`、`--ui-shadow-soft`、`--ui-radius-scale`、`--ui-font-scale`、`--ui-bg-gradient`）。
- 跨平台范围：Tauri 桌面端（Windows / macOS / Linux）为**一等公民**；Android Capacitor 与 iOS 场景作为 Tier-2 适配（相机、位置、扫码等平台能力允许降级，但不允许崩溃或发起未授权网络请求）。

本规范遵循 EARS + INCOSE 质量规则；"正确性属性（Correctness Properties）"章节显式列出可用 PBT 验证的不变式与 round-trip，便于 Design/Tasks 阶段落地。

## Glossary

- **Mini_HBUT_App**：本项目主应用（Tauri 桌面 + Capacitor 移动端的 Vue Webview 壳）。
- **Chaoxing_Platform**：超星学习通平台，包含 `passport2.chaoxing.com`、`i.chaoxing.com`、`mobilelearn.chaoxing.com`、`mooc1.chaoxing.com`、`pan-yz.chaoxing.com` 等子域。
- **Chaoxing_Checkin_View**：本次新增的前端模块视图（建议 `src/components/MoreChaoxingCheckinView.vue`），在"更多"页作为内部模块加载，不走远程模块清单。
- **More_Module_Card**：`MoreView.vue` 模块中心上的一张可点击卡片，由 `DEFAULT_MODULES` 静态列表驱动。
- **Checkin_Activity**：一条签到任务，字段包含 `active_id`（超星活动 ID）、`course_id`、`clazz_id`、`course_name`、`teacher_name`、`activity_type`（`normal | location | photo | qrcode | gesture`）、`status`（`active | pending | signed | expired`）、`start_time`、`end_time`。
- **Checkin_Command_Set**：后端向前端暴露的命令封闭集合 `{chaoxing_checkin_list, chaoxing_checkin_submit_common, chaoxing_checkin_submit_location, chaoxing_checkin_submit_photo, chaoxing_checkin_submit_qrcode, chaoxing_checkin_submit_gesture, chaoxing_checkin_history, chaoxing_checkin_parse_qr_url, chaoxing_checkin_upload_photo, chaoxing_checkin_decode_qr_image, chaoxing_checkin_capture_screen_qr}`。
- **Session_Store**：`Chaoxing_Platform` 会话持久化层，具体为 `online_learning_platform_state`（platform=`chaoxing`）SQLite 表 + `HbutClient.cookie_jar` 内存态。
- **Checkin_Log**：本地签到流水，存放于新增表 `chaoxing_checkin_log`，字段 `student_id`、`active_id`、`activity_type`、`result`（`success | failure | already_signed`）、`error_message`、`submitted_at`、`payload_hash`。
- **Login_Entry**：学习通登录入口，来源于 `LoginV3.vue` 已存在的模态，包含 SSO 跳转（融合门户自动桥接）、密码登录、二维码登录三路。
- **Design_System_Tokens**：`--ui-primary`、`--ui-secondary`、`--ui-surface`、`--ui-text`、`--ui-muted`、`--ui-danger`、`--ui-success`、`--ui-warning`、`--ui-shadow-soft`、`--ui-radius-scale`、`--ui-font-scale`、`--ui-bg-gradient` 等运行时 CSS 变量集合。
- **Safe_Domain_Whitelist**：签到相关网络请求允许访问的域名白名单 `{*.chaoxing.com, hbut.edu.cn, *.hbut.edu.cn}`。
- **Tauri_Runtime**：通过 `utils/platform/native.isTauriRuntime()` 判定为 `true` 的运行环境；其他环境视为 `Web/Capacitor_Runtime`。
- **Remote_Bridge_Http_Server**：`src-tauri/src/http_server.rs` 已有的本地 HTTP 网关，用于 Capacitor WebView 调用后端能力的桥梁。

## 待用户确认（Open Decisions）

以下决策点在进入 Design 阶段前必须对齐；若与本文档默认假设冲突，需要重写对应需求：

1. **范围边界**：本版本**只**做"签到"一项（普通 / 位置 / 拍照 / 二维码 / 手势），是否**显式排除** `course_helper` README 中提到的主题讨论、评分、投票、问卷、随堂练习、作业、群聊签到、人脸识别、雨课堂签到？默认排除，仅保留签到五类。
2. **位置签到数据源**：是否允许调用系统定位（Tauri `geolocation` / Capacitor `@capacitor/geolocation`）？默认启用并带手动输入回退，若禁用则仅保留手动输入。
3. **拍照签到数据源**：是否允许相机拍摄与相册选择？默认都允许，但 Tauri 桌面端若无相机可只允许文件选择。
4. **扫码签到设备能力（桌面端降级路径）**：桌面端（Windows / macOS / Linux）通常无相机或相机调用受限，本版本要求同时提供以下**三条**本地解码降级路径，由用户按需选择：
   - (a) **粘贴二维码文本 URL**（最低成本降级）；
   - (b) **从本地选择图片文件**，由内置 QR 解码器（建议 `rqrr` / `bardecoder` Rust crate 或前端 `jsQR`）解出内含 URL；
   - (c) **实时屏幕区域截图**，用户框选屏幕上任一区域（含其他软件窗口内显示的二维码），由后端截屏 + QR 解码后解出 URL。
   以上三条路径共用同一条"解出 URL → `chaoxing_checkin_parse_qr_url` → `chaoxing_checkin_submit_qrcode`"的流水线。
5. **自动签到 / 定时轮询**：本期是否提供后台定时任务自动签到？默认**不提供**（范围外），避免合规与封号风险。
6. **多账号**：若用户已有多学号缓存，签到模块默认使用 `currentStudentId`；是否需要支持账号切换选择器？默认只用当前账号。
7. **签到日志数据保留**：本地 `Checkin_Log` 保留时长默认 90 天，超过后清理。是否需要云同步？默认**不同步**。
8. **UI 主题**：`design-system/mini-hbut-frontend/MASTER.md`（主色 `#2563EB`）与 `design-system/mini-hbut/MASTER.md`（主色 `#1C1917`）存在差异；运行时 `--ui-primary` 由用户在主题设置中选定。默认取运行时 tokens，不硬编码任一主色。

本文档所有 "SHALL" 条款基于上述默认项全部成立的前提。

## Requirements

### Requirement 1：在"更多"页新增"学习通签到"模块卡片

**User Story：** 作为学生用户，我希望在 Mini-HBUT 的"更多"页看到一张"学习通签到"卡片，并能直接点击进入签到功能，以便我快速完成课堂签到。

#### Acceptance Criteria

1. THE Mini_HBUT_App SHALL 在 `MoreView.vue` 的 `DEFAULT_MODULES` 中追加一项 `id=chaoxing_checkin`、`kind=internal`、`view=more_chaoxing_checkin`、`icon` 使用 SVG 或运行时图标（`name='check-square'` 或等价 Heroicons/Lucide 图标名），避免 Emoji 作为核心图标。
2. WHEN 用户在"更多"页加载完成，THE More_Module_Card `chaoxing_checkin` SHALL 以"模块中心"分组中的第一位或紧随"学习记录"之后（`order ≤ 2`）出现。
3. WHEN 用户点击 `chaoxing_checkin` 卡片，THE Mini_HBUT_App SHALL 触发 `emit('navigate', 'more_chaoxing_checkin')`，由 `App.vue` 的路由器将视图切换到 Chaoxing_Checkin_View。
4. THE More_Module_Card `chaoxing_checkin` SHALL 默认显示状态徽章 `TStatusBadge(type='success', text='已就绪')`；`session_status.connected = false` 时显示 `TStatusBadge(type='warning', text='需登录')`。
5. WHERE 用户尚未登录学习通（`Session_Store.connected = false`），THE Chaoxing_Checkin_View SHALL 在首屏加载时展示"学习通登录"引导卡片，提供"跳转融合门户登录 / 账号密码登录 / 扫码登录"三个入口按钮。
6. THE Chaoxing_Checkin_View SHALL 使用 `TPageHeader` 组件作为顶部栏，标题固定为"学习通签到"，右侧放置"刷新"图标按钮。
7. IF 用户在 Web/Capacitor_Runtime 下打开模块，THEN THE Chaoxing_Checkin_View SHALL 通过 `invokeNative()` 统一走 Tauri Command 或 Remote_Bridge_Http_Server 路径，不在前端裸调超星接口。

### Requirement 2：复用现有学习通登录与 Cookie 持久化

**User Story：** 作为用户，我希望签到模块复用 Mini-HBUT 已有的学习通登录状态，不再重复输入账号密码，也不会看到两套互相冲突的登录入口。

#### Acceptance Criteria

1. THE Chaoxing_Checkin_View SHALL 只允许通过 `chaoxing_password_login` / `chaoxing_qr_init_login` / `chaoxing_qr_refresh_login` / `chaoxing_qr_check_status` / `chaoxing_qr_confirm_login` 五个既有 Tauri 命令完成学习通登录，不新增其他登录通道。
2. WHEN 用户通过 SSO 跳转完成 `hbut.edu.cn` 融合门户登录并自动桥接到 `hbut.jw.chaoxing.com`，THE `HbutClient.ensure_chaoxing_academic_session()` SHALL 在 5 秒内完成学习通会话补票。
3. WHEN 登录成功，THE Mini_HBUT_App SHALL 通过 `db::save_online_learning_platform_state(platform='chaoxing', student_id, connected=true, cookie_blob, account_id)` 持久化 Cookie 到本地 SQLite。
4. WHEN 应用下次启动，THE `HbutClient` SHALL 通过 `try_restore_chaoxing_session(student_id)` 从 `online_learning_platform_state` 读取 `cookie_blob` 并注入 `cookie_jar`。
5. THE Chaoxing_Checkin_View SHALL 通过 `chaoxing_session_status` Tauri 命令（若不存在则新增 `chaoxing_checkin_status`）查询当前会话可用性，不自行组装 cookie 字符串。
6. IF `Session_Store.cookie_blob` 为空且 `Session_Store.connected=true` 同时出现，THEN THE Chaoxing_Checkin_View SHALL 视为"状态异常"并强制重新登录，防止出现脏会话。
7. THE Chaoxing_Checkin_View SHALL 不将任何 Cookie 明文写入 `localStorage`、`sessionStorage` 或 `IndexedDB`，Cookie 仅驻留在后端 `cookie_jar` 内存与 `online_learning_platform_state` SQLite 表。

### Requirement 3：获取当日签到任务列表

**User Story：** 作为用户，我希望打开签到页后就能看到"当前有哪些签到任务正在进行、已错过、已完成"，不用自己翻课程去找。

#### Acceptance Criteria

1. WHEN Chaoxing_Checkin_View 首次渲染或用户点击刷新，THE `chaoxing_checkin_list` Tauri 命令 SHALL 在 10 秒内返回一个 `Vec<Checkin_Activity>` 或明确的错误。
2. THE `chaoxing_checkin_list` SHALL 聚合所有当前账号下班级课程的"进行中"（`status='active'`）与最近 24 小时内结束的签到活动，并去重（以 `active_id` 为主键）。
3. THE Checkin_Activity 列表 SHALL 按 `status` 分组排序：`active > pending > signed > expired`；同组内按 `start_time` 降序。
4. WHEN 列表中存在 `status='active'` 的任务，THE Chaoxing_Checkin_View SHALL 通过 `TStatusBadge(type='info', text='进行中')` 高亮第一条，且该条的"立即签到"按钮可点击。
5. WHEN 列表为空，THE Chaoxing_Checkin_View SHALL 使用 `TEmptyState` 显示"暂无可用签到，请稍后刷新"。
6. IF `chaoxing_checkin_list` 返回 `错误：会话已过期`，THEN THE Chaoxing_Checkin_View SHALL 触发 Requirement 2 所述的重新登录流程。
7. THE `chaoxing_checkin_list` SHALL 支持 `force_refresh: bool` 参数；`force_refresh=false` 时允许复用 60 秒内的缓存（内存态）。

### Requirement 4：普通签到

**User Story：** 作为用户，对于最常见的"一键签到"，我希望点一下按钮就能完成，不需要任何额外输入。

#### Acceptance Criteria

1. WHEN 用户在一条 `activity_type='normal'` 的活动上点击"立即签到"，THE `chaoxing_checkin_submit_common(active_id)` SHALL 发起一次签到请求并返回 `{result: 'success' | 'already_signed' | 'failure', message, server_response}` 结构。
2. THE `chaoxing_checkin_submit_common` SHALL 在 8 秒内返回结果，超时视为失败并提示"签到超时，请重试"。
3. WHEN 签到成功，THE Chaoxing_Checkin_View SHALL 在 500ms 内把该活动的状态更新为 `signed`，且立即将徽章切换为 `TStatusBadge(type='success', text='已签到')`。
4. IF 后端对同一 `active_id` 在 60 秒内重复收到普通签到请求，THEN THE `chaoxing_checkin_submit_common` SHALL 返回 `result='already_signed'` 且不发起第二次远端 HTTP 请求。
5. WHEN 用户在 `activity_type != 'normal'` 的活动上错误触发该命令，THE `chaoxing_checkin_submit_common` SHALL 返回 `result='failure', message='该活动类型不支持普通签到'`。
6. THE 普通签到的成功 / 失败 SHALL 同步写入 Checkin_Log。

### Requirement 5：位置签到

**User Story：** 作为用户，对于需要提交经纬度和地址的位置签到，我希望能选择预设位置或手动输入，而不是被动要求真实到达签到点。

#### Acceptance Criteria

1. WHEN 用户点击 `activity_type='location'` 活动的"立即签到"按钮，THE Chaoxing_Checkin_View SHALL 弹出 `TModal`，展示三种位置来源入口：`手动输入`、`历史选取`、`系统定位（平台能力允许时）`。
2. THE Chaoxing_Checkin_View SHALL 要求用户提交的 `latitude ∈ [-90.0, 90.0]`、`longitude ∈ [-180.0, 180.0]`，`address` 长度 `1 ≤ len ≤ 80`。
3. IF 用户提交的 `latitude` 或 `longitude` 超出合法范围，THEN THE Chaoxing_Checkin_View SHALL 在前端拦截并提示"经纬度非法，请重新输入"，不调用后端命令。
4. WHEN 校验通过，THE `chaoxing_checkin_submit_location(active_id, latitude, longitude, address)` SHALL 向 `mobilelearn.chaoxing.com/newsign/preSign` 与 `pptSign` 发起签到请求并返回 `{result, message}`。
5. THE Chaoxing_Checkin_View SHALL 记住用户最近 5 条提交过的位置（仅存储 `address + latitude + longitude`，以 `student_id` 为范围），下次弹窗时作为"历史选取"列表默认项。
6. WHERE 系统定位 API 不可用（例如 Tauri 桌面无 `geolocation` 插件），THE Chaoxing_Checkin_View SHALL 隐藏"系统定位"按钮，仅保留"手动输入 / 历史选取"。
7. IF 后端收到经纬度但 `address` 为空，THEN THE `chaoxing_checkin_submit_location` SHALL 返回 `result='failure', message='地址不能为空'`。

### Requirement 6：拍照签到

**User Story：** 作为用户，对于要求上传照片的签到，我希望能选择相册里一张图或现拍一张图，并由应用自动完成图片上传与签到。

#### Acceptance Criteria

1. WHEN 用户点击 `activity_type='photo'` 活动的"立即签到"按钮，THE Chaoxing_Checkin_View SHALL 弹出 `TModal`，提供"从相册选择"与"拍照"两个入口（平台不支持的入口置灰并显示提示）。
2. THE Chaoxing_Checkin_View SHALL 拒绝非 `image/jpeg | image/png | image/webp` MIME 类型的文件，并提示"仅支持 JPG/PNG/WebP 图片"。
3. THE Chaoxing_Checkin_View SHALL 拒绝 `size > 5 * 1024 * 1024` 字节的图片，并提示"图片不得超过 5MB"。
4. WHEN 图片校验通过，THE `chaoxing_checkin_upload_photo(image_bytes, mime_type, file_name)` SHALL 将图片上传到 `pan-yz.chaoxing.com/upload` 并返回 `{object_id, thumb_url}`。
5. IF 图片上传失败，THEN THE `chaoxing_checkin_submit_photo` SHALL NOT 被前端调用，前端 SHALL 显示"图片上传失败，请重试"。
6. WHEN 图片上传成功，THE `chaoxing_checkin_submit_photo(active_id, object_id)` SHALL 发起签到并返回 `{result, message}`。
7. THE 拍照签到的最终结果（含 `object_id`）SHALL 写入 Checkin_Log，但 Checkin_Log 中不保存原始图片字节，仅保留 `object_id` 字符串。

### Requirement 7：二维码签到

**User Story：** 作为用户，对于需要扫描二维码的签到，我希望能在支持相机的平台扫码完成，在不支持相机的桌面端也能通过「选择图片」或「屏幕区域截图」本地解码完成签到，不再需要去掏手机拍屏幕。

#### Acceptance Criteria

1. WHEN 用户点击 `activity_type='qrcode'` 活动的"立即签到"按钮，THE Chaoxing_Checkin_View SHALL 弹出 `TModal`，提供以下入口（平台能力不足的入口置灰并显示提示）：
   - `相机扫描`（Capacitor Android / iOS 或配置了相机插件的 Tauri）
   - `选择图片解码`（所有平台均可用；文件选择器过滤 `image/*`）
   - `屏幕区域截图`（Tauri 桌面端；通过系统截屏 API 裁剪用户框选区域）
   - `粘贴 URL`（所有平台；文本框直接粘贴）
2. WHERE 运行时是 Tauri 桌面端且未配置相机插件，THE Chaoxing_Checkin_View SHALL 隐藏"相机扫描"入口并默认展开"选择图片解码 / 屏幕区域截图 / 粘贴 URL"三个降级入口。
3. THE Mini_HBUT_App SHALL 新增 Tauri 命令 `chaoxing_checkin_decode_qr_image(image_bytes, mime_type) -> { url: string }`，用于对用户选择的图片进行本地 QR 解码；该命令**仅**做本地解码，不发起任何网络请求，输入图片字节不落盘。
4. THE Mini_HBUT_App SHALL 新增 Tauri 命令 `chaoxing_checkin_capture_screen_qr(rect?: {x,y,w,h}) -> { url: string }`，用于在桌面端截取指定屏幕区域并解码 QR：
   - IF 未传入 `rect`，THEN 后端 SHALL 捕获当前主屏幕全图并扫描全图；
   - IF 传入 `rect`，THEN 后端 SHALL 只截取并解码该矩形区域；
   - 截屏临时位图仅在内存中处理，**不写入磁盘**；
   - 仅在 Tauri 桌面端实现，Capacitor / Web 下返回 `error_code='permission_denied'`。
5. WHEN 用户粘贴或解码得到一条 URL，THE `chaoxing_checkin_parse_qr_url(url)` SHALL 返回 `{enc: string, active_id: string | null}`；若 URL 中不含 `enc` 参数，则返回 `result='failure', message='二维码不合法'`。
6. THE `chaoxing_checkin_parse_qr_url` SHALL 满足 round-trip 属性：对任意合法 `(active_id, enc)`，存在可构造 URL `compose(active_id, enc)` 使 `parse(compose(x))` 返回与输入相同的 `(active_id, enc)`。
7. WHEN `enc` 解析成功，THE `chaoxing_checkin_submit_qrcode(active_id, enc)` SHALL 发起签到并返回 `{result, message}`。
8. THE `chaoxing_checkin_submit_qrcode` SHALL 在签到请求中不携带任何超时强制前置等待，由后端依据超星侧规则处理"10 秒限制"等约束，不在本地做硬编码时延。
9. IF 提交的 `enc` 解析出的 `active_id` 与用户点击的 Checkin_Activity 的 `active_id` 不一致，THEN THE Chaoxing_Checkin_View SHALL 提示"二维码与活动不匹配，请确认"，且不发起签到请求。
10. IF `chaoxing_checkin_decode_qr_image` 或 `chaoxing_checkin_capture_screen_qr` 在输入图像中未识别到任何 QR 码，THEN 命令 SHALL 返回 `result='failure', error_code='bad_request', message='未识别到二维码，请换张更清晰的图片或重新框选'`。

### Requirement 8：手势签到

**User Story：** 作为用户，对于要求输入图形密码（手势）的签到，我希望能把教师宣布的数字组合输入到应用，由应用去提交。

#### Acceptance Criteria

1. WHEN 用户点击 `activity_type='gesture'` 活动的"立即签到"按钮，THE Chaoxing_Checkin_View SHALL 弹出 `TModal`，展示一个九宫格手势盘与一个数字输入框。
2. THE Chaoxing_Checkin_View SHALL 要求用户输入的手势密码 `pattern` 为长度在 `[4, 9]` 之间的、仅包含字符 `1-9` 且不重复的字符串。
3. IF `pattern` 不满足上述格式，THEN THE Chaoxing_Checkin_View SHALL 在前端拦截并提示"手势密码应为 4-9 位不重复的数字"。
4. WHEN 校验通过，THE `chaoxing_checkin_submit_gesture(active_id, pattern)` SHALL 发起签到并返回 `{result, message}`。
5. THE Chaoxing_Checkin_View SHALL 在提交前屏蔽"提交"按钮，防止用户在网络尚未返回时重复点击。
6. IF 手势签到返回 `result='failure', message='手势错误'`，THEN THE Chaoxing_Checkin_View SHALL 清空输入并允许用户重试。

### Requirement 9：错误处理与会话自愈

**User Story：** 作为用户，当签到失败或会话过期时，我希望应用给出明确、简体中文的错误信息，并引导我重新登录或稍后重试。

#### Acceptance Criteria

1. THE Checkin_Command_Set SHALL 在失败时返回结构 `{result: 'failure', message: string, error_code: string}`，`message` 必须为简体中文、`error_code` 为稳定枚举值（建议集合：`network_error | session_expired | bad_request | server_error | already_signed | rate_limited | permission_denied | unknown`）。
2. WHEN 后端收到 HTTP 响应中出现 `authserver/login` 重定向或 `请先登录` 文本，THE 对应命令 SHALL 返回 `error_code='session_expired'` 且 `HbutClient` SHALL 清除 `chaoxing` 平台的 `connected` 标记。
3. WHEN `error_code='session_expired'` 被前端收到，THE Chaoxing_Checkin_View SHALL 弹出 `TModal` 询问"会话已过期，是否重新登录？"，用户确认后跳转到 Login_Entry。
4. THE Checkin_Command_Set SHALL 对单次网络错误重试不超过 2 次，重试间隔采用指数退避 `800ms → 1800ms`，期间保持 UI 进度提示"正在重试..."。
5. IF 后端返回 `result='failure', error_code='rate_limited'`，THEN THE Chaoxing_Checkin_View SHALL 禁用"立即签到"按钮至少 10 秒并显示倒计时。
6. THE Chaoxing_Checkin_View SHALL 不在 UI 中直接展示超星返回的英文或 HTML 片段，所有原始错误必须经前端映射到简体中文。

### Requirement 10：签到日志与历史

**User Story：** 作为用户，我希望看到自己近期的签到结果，便于复核"是否真的签到成功"。

#### Acceptance Criteria

1. THE Mini_HBUT_App SHALL 新增本地 SQLite 表 `chaoxing_checkin_log`，结构包含 `student_id TEXT`、`active_id TEXT`、`activity_type TEXT`、`course_name TEXT`、`result TEXT`、`error_code TEXT`、`error_message TEXT`、`submitted_at INTEGER (epoch ms)`，主键 `(student_id, active_id, submitted_at)`。
2. WHEN Checkin_Command_Set 中任何一个签到命令完成（无论成功失败），THE Mini_HBUT_App SHALL 在 1 秒内把结果写入 `chaoxing_checkin_log`。
3. THE `chaoxing_checkin_history(student_id, limit=50)` SHALL 按 `submitted_at DESC` 返回最近 `limit` 条记录。
4. THE Chaoxing_Checkin_View SHALL 在"签到历史"子页中展示该命令返回的记录，使用 `TCard + TStatusBadge` 组合呈现结果。
5. WHEN Checkin_Log 中存在 `submitted_at` 早于 90 天之前的记录，THE `chaoxing_checkin_history` SHALL 在下次写入时触发一次惰性清理（DELETE 语句），保证表体积可控。
6. THE Chaoxing_Checkin_View SHALL 不允许用户直接编辑或伪造 Checkin_Log 的历史条目。

### Requirement 11：跨平台兼容性

**User Story：** 作为跨端用户（桌面 + 手机），我希望在任意一端都能完成签到，不会因为缺少平台能力而崩溃。

#### Acceptance Criteria

1. THE Chaoxing_Checkin_View SHALL 在 Tauri_Runtime 下完整启用相机、位置、网络三类能力，前端通过 `invokeNative()` 调用后端命令。
2. WHERE 运行时是 Capacitor Android，THE Chaoxing_Checkin_View SHALL 优先使用 `@capacitor/camera` 获取图像、`@capacitor/geolocation` 获取定位；若用户拒绝授权则回退到"从相册选择 + 手动输入"。
3. WHERE 运行时是 Capacitor iOS 或纯 Web，THE Chaoxing_Checkin_View SHALL 使用 `<input type="file" accept="image/*">` 进行选图，地理位置走 `navigator.geolocation` 或纯手动输入。
4. IF `isTauriRuntime()===false` 且 Remote_Bridge_Http_Server 不可达，THEN THE Chaoxing_Checkin_View SHALL 显示"当前环境不支持签到，请在桌面端 / 移动端 App 中打开"，不发起任何 HTTP 请求。
5. THE Chaoxing_Checkin_View SHALL 不直接从前端 JS 调用 `*.chaoxing.com` 域，签到网络请求一律通过后端 `HbutClient` 发出。
6. WHEN Capacitor 运行时缺少必要插件，THE Mini_HBUT_App SHALL 在构建阶段（`npx cap sync`）即给出失败日志，而不是在运行时才报错。

### Requirement 12：设计系统合规

**User Story：** 作为设计与品牌一致性守护者，我希望签到模块的视觉、间距、圆角、阴影、图标都与 Mini-HBUT 其他模块保持统一。

#### Acceptance Criteria

1. THE Chaoxing_Checkin_View SHALL 仅使用 `src/components/templates/*` 下的 `TPageHeader`、`TCard`、`TSection`、`TStatusBadge`、`TEmptyState`、`TModal` 作为布局骨架，不在模板根节点直接使用裸 `<div>` 组装卡片样式。
2. THE Chaoxing_Checkin_View 的样式 SHALL 使用运行时 Design_System_Tokens，**不得**出现硬编码的 hex 颜色（例如 `#2563EB`、`#1C1917`）、硬编码的 `rem` 字号以及硬编码的阴影值。
3. THE Chaoxing_Checkin_View 的所有图标 SHALL 优先来自统一图标集合（Heroicons / Lucide）并以 SVG 形式引入；Emoji 仅允许作为 `MoreView` 列表项的装饰性前缀（与现有模块保持一致），不在页面正文中作为状态图标。
4. THE Chaoxing_Checkin_View 的可点击元素 SHALL 具备 `cursor: pointer`、`:focus-visible` 高亮、`@media (prefers-reduced-motion: reduce)` 下的动画降级。
5. THE Chaoxing_Checkin_View 的排版 SHALL 在视口宽度 375 / 768 / 1024 / 1440 四个断点下均无横向滚动，且文字行高不小于 `1.4`。
6. THE Chaoxing_Checkin_View 的深色模式 SHALL 通过 `--ui-surface` 与 `--ui-text` 变量跟随主题，不使用 `@media (prefers-color-scheme)` 硬切换颜色。
7. THE Chaoxing_Checkin_View 的弹窗（`TModal`）SHALL 使用 `backdrop-filter: blur(10-20px)` 与 `border: 1px solid rgba(255,255,255,0.2)`，遵循项目 Liquid Glass / Glassmorphism 风格。

### Requirement 13：隐私与安全边界

**User Story：** 作为对隐私敏感的用户，我希望学习通 Cookie 与个人轨迹不会泄露给除超星之外的任何第三方。

#### Acceptance Criteria

1. THE Checkin_Command_Set SHALL 只对 Safe_Domain_Whitelist 内的域名发起网络请求；任何新增的外部域必须通过 Code Review 并更新本规范。
2. THE Chaoxing_Checkin_View SHALL 不将学习通 Cookie、学号、手机号、经纬度、照片字节上传到除超星官方域（`*.chaoxing.com`）以外的任何服务器。
3. THE Chaoxing_Checkin_View 在渲染 `student_id` 时 SHALL 进行脱敏（保留前 2 位与后 2 位），中间以 `****` 占位。
4. IF 用户在"我的"页触发"退出登录"或"清空数据"，THEN THE Mini_HBUT_App SHALL 在 2 秒内清空 `online_learning_platform_state.chaoxing` 与 `chaoxing_checkin_log` 中当前学号的全部条目。
5. THE Chaoxing_Checkin_View SHALL 不在前端日志（`console.log`、`pushDebugLog`）中输出完整 Cookie、完整 URL `enc` 参数、完整图片对象 `object_id` 的超长字符串；调试日志中必须截断至前 8 位 + `...`。
6. THE Chaoxing_Checkin_View SHALL 不接入任何第三方分析、广告、行为埋点 SDK。

### Requirement 14：性能与并发

**User Story：** 作为用户，即使在网络抖动或反复点击下，我也希望签到功能不会卡死或产生重复签到。

#### Acceptance Criteria

1. THE `chaoxing_checkin_list` SHALL 在本地 3G 网络延迟 300ms 的基准下 P95 响应时间不超过 3 秒。
2. THE 单次签到提交命令 SHALL 在主 UI 线程占用不超过 50ms（后端异步执行）。
3. WHEN 前端在同一 `active_id` 上在 1 秒内连续触发多次签到，THE Chaoxing_Checkin_View SHALL 只允许第一次进入后端；其余调用 SHALL 合并为"等待结果"，不重复触发网络。
4. WHEN 后端同时收到多于 10 个签到请求，THE `HbutClient` SHALL 通过 `Mutex<HbutClient>` 串行化 `cookie_jar` 与 `reqwest::Client`，避免 Cookie 竞态。
5. THE Chaoxing_Checkin_View SHALL 在签到进行中显示 Loading 指示并禁用该条活动的操作按钮。
6. IF 用户离开页面后签到仍未完成，THEN THE Mini_HBUT_App SHALL 在后台继续完成该请求，并在下次返回页面时把结果同步进 Checkin_Log。

### Requirement 15：签到 URL 解析器（round-trip）

**User Story：** 作为开发者，我希望"二维码 URL"与其解析结果之间存在稳定的双向映射，便于测试和排查。

#### Acceptance Criteria

1. THE `chaoxing_checkin_parse_qr_url(url)` SHALL 实现为一个纯函数（无 IO、无全局状态）。
2. THE Mini_HBUT_App SHALL 提供配对的 `chaoxing_checkin_compose_qr_url(active_id, enc)` 纯函数（仅用于测试/开发），使其 `parse(compose(x)) == x`、`compose(parse(y)) == y`（对合法输入 y）。
3. WHEN 输入 URL 缺少 `enc` 参数或 `active_id` 为空，THE `chaoxing_checkin_parse_qr_url` SHALL 返回 `error_code='bad_request'` 并附带 `message='二维码不合法'`。
4. THE 解析器 SHALL 容忍 URL 中额外的查询参数、fragment、`%20` 空格编码与 `&amp;` HTML 实体转义。
5. IF URL 的 `host` 不在 `{mobilelearn.chaoxing.com, www.chaoxing.com, k.chaoxing.com}` 白名单内，THEN THE `chaoxing_checkin_parse_qr_url` SHALL 返回 `error_code='bad_request'`。

### Requirement 16：签到幂等性（并发安全）

**User Story：** 作为用户，我不希望因为网络波动或多次点按按钮而对同一个签到活动提交出错或多次扣除配额。

#### Acceptance Criteria

1. WHEN `chaoxing_checkin_submit_common(active_id)` 在 60 秒内被调用 N 次（N ≥ 2），THE Mini_HBUT_App SHALL 只产生 1 次真实的远端 HTTP 请求；其他 N-1 次调用 SHALL 返回 `result='already_signed'` 或共享同一次请求的结果。
2. THE Checkin_Command_Set 中除"上传图片"与"提交带参数的签到"外，任意签到提交命令 SHALL 满足 `f(f(x)) == f(x)`（幂等性）。
3. IF 并发 N 个 Tokio 任务对同一 `active_id` 调用签到命令，THEN 最终 `Checkin_Log` 中对该 `active_id` 的 `result='success'` 记录 SHALL 不超过 1 条。
4. THE Mini_HBUT_App SHALL 通过 `DashMap<active_id, Arc<Mutex<InflightState>>>` 或等价结构实现进行中请求的合并。

### Requirement 17：正确性属性（Correctness Properties）

> 本章列出可用 property-based testing（PBT）验证的不变式与 round-trip，作为 Design/Tasks 阶段的测试蓝图。PBT 仅用于**本项目代码的纯逻辑**，不对超星后端行为做属性断言；涉及外部服务的正确性以 1–3 个集成样本覆盖。

**Property P1（Round-trip：二维码 URL 解析 / 构造）**
- 对于任意 `(active_id ∈ [1, 2^31-1], enc ∈ /^[0-9a-fA-F]{1,64}$/)`，`parse(compose(active_id, enc)) == (active_id, enc)`。
- 对于任意合法 `url`，`compose(parse(url).active_id, parse(url).enc)` 与原 `url` 在"查询参数顺序无关"意义下等价。

**Property P2（Idempotence：普通签到幂等）**
- 对任意 `active_id`，`submit_common(active_id)` 连续执行两次，最终 Checkin_Log 中 `result='success'` 的条数 `≤ 1`；第二次调用的返回值必须在 `{'success', 'already_signed'}` 中。

**Property P3（Invariant：活动状态分类互斥）**
- 对于从 `chaoxing_checkin_list` 返回的任意活动 `a`，`a.status ∈ {active, pending, signed, expired}` 且只属于其中一个；同一 `(active_id, snapshot_timestamp)` 不得同时出现两条记录。

**Property P4（Invariant：排序稳定性）**
- `chaoxing_checkin_list` 返回的列表首项要么 `status='active'`，要么列表为空。

**Property P5（Invariant：输入合法性 - 位置签到）**
- `submit_location(lat, lng, addr)` 的成功调用必须满足 `lat ∈ [-90, 90] ∧ lng ∈ [-180, 180] ∧ 1 ≤ len(addr) ≤ 80`；违反以上条件时命令必须返回 `error_code='bad_request'`（错误条件属性）。

**Property P6（Invariant：手势密码格式）**
- `submit_gesture(pattern)`：成功调用的 `pattern` 必须是长度 ∈ `[4, 9]`、字符集 `{'1'..'9'}`、字符互不重复的字符串；违反时必须返回 `error_code='bad_request'`。

**Property P7（Invariant：图片大小与 MIME）**
- `chaoxing_checkin_upload_photo(bytes, mime, name)` 的成功调用必须满足 `len(bytes) ≤ 5*1024*1024 ∧ mime ∈ {image/jpeg, image/png, image/webp}`；违反时必须返回 `error_code='bad_request'`。

**Property P8（Invariant：网络目的地白名单）**
- 对 Checkin_Command_Set 中任意命令的任意一次执行，`HbutClient` 发出的所有 HTTP 请求的 `host` ∈ Safe_Domain_Whitelist。可用"mock reqwest client + 请求拦截器"对 N 个随机输入断言。

**Property P9（Invariant：会话自愈一致性）**
- 若 `Session_Store.connected=true` 且某签到命令收到 `session_expired`，则该命令返回后：`Session_Store.connected` 必须被置为 `false`，且前端在同一 tick 内观察到该状态变化。

**Property P10（Metamorphic：拍照签到流程依赖）**
- 对任意 `(image, active_id)`：如果 `upload_photo(image)` 返回失败，则 `submit_photo(active_id, _)` 不会被调用（流程依赖不变式）；反之若 `upload_photo` 返回 `object_id`，则 `submit_photo` 必须被传入相同的 `object_id`。

**Property P11（Invariant：Checkin_Log 去重 + 90 天保留）**
- 对 `chaoxing_checkin_log` 连续写入 N 次同一 `(student_id, active_id, result)`：表中满足 `submitted_at > now - 90d` 的记录数随时间单调不增（只会被清理，不会莫名增加）。
- 任意时刻 `max(submitted_at) - min(submitted_at) ≤ 90 days`。

**Property P12（Invariant：并发合并）**
- 对同一 `active_id`，从 N 个并发 tokio 任务同时调用 `submit_common`：远端 HTTP 调用计数 `≤ 1`（通过 mock HTTP 层断言）。

**Property P13（Invariant：本地 QR 解码纯粹性与无网络副作用）**
- `chaoxing_checkin_decode_qr_image(bytes, mime)` 与 `chaoxing_checkin_capture_screen_qr(rect?)` 在其执行期间对 Safe_Domain_Whitelist 发起的 HTTP 请求次数必须为 `0`（可通过 mock HTTP 层断言）。
- 两命令在相同输入下必须给出相同输出（解码稳定性）；对非图像字节或非 QR 图像必须返回 `error_code='bad_request'` 而不 panic。

**Property P14（Invariant：截屏数据不落盘）**
- 对 `chaoxing_checkin_capture_screen_qr` 的任意调用，命令执行前后 `std::env::temp_dir()` 以及应用数据目录下与截屏相关的临时文件数量必须保持不变（通过 fs snapshot diff 断言）。

### Requirement 18：协议移植与 GPL v3 合规（Source Porting & Attribution）

**User Story：** 作为项目维护者，我希望在移植 `AneryCoft/course_helper` 的签到协议实现时严格遵守 GPL v3，不引入协议风险，并让后续维护者清楚看到哪些逻辑来自外部。

#### Acceptance Criteria

1. THE Mini_HBUT_App SHALL 以**重写（Rewrite in Rust）**而非逐行复制的方式移植 `course_helper` 的签到协议逻辑；逐行拷贝 Dart 源文件被禁止。
2. THE `src-tauri/src/modules/chaoxing_checkin.rs` 及任何直接对应 `course_helper` Dart 文件的 Rust 源文件 SHALL 在文件头添加如下 3 条注释：
   - `// SPDX-License-Identifier: GPL-3.0-or-later`
   - `// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).`
   - `// Upstream: https://github.com/AneryCoft/course_helper`
3. THE 仓库 SHALL 在 `THIRD_PARTY_NOTICES.md` 或 `NOTICE` 文件中新增一节记录 `course_helper` 的上游地址、许可证、以及本项目使用了"签到协议流程 / 端点入参 / header 指纹 / QR URL 结构"等信息。
4. THE 移植过程 SHALL 优先复现 `course_helper` 中已验证可用的以下端点流程：
   - `mobilelearn.chaoxing.com/newsign/preSign`
   - `mobilelearn.chaoxing.com/pptSign`
   - `mooc1-api.chaoxing.com/mycourse/backclazzdata`
   - `mobilelearn.chaoxing.com/v2/apis/active/student/activelist`
   - `pan-yz.chaoxing.com/upload`
   并在 Rust 侧用 `reqwest` + `cookie_store` 重新实现请求组装与响应解析。
5. IF `course_helper` 上游在未来更新了端点入参、`fid` / `enc` / `name` / `uid` 等字段的语义，THEN 本项目 SHALL 在 `docs/chaoxing-protocol.md` 记录 diff，并在 Issue 中标注同步来源的 commit hash。
6. THE 本 Spec SHALL NOT 移植 `course_helper` 中超出本版本范围的协议流程（随堂练习自动提交、作业、问卷、投票、主题讨论、IM、雨课堂、人脸识别、自动视频进度）。

### Requirement 19：范围外（Out of Scope）

本次规范显式排除以下功能，后续按独立 Spec 处理：

1. THE 本 Spec SHALL NOT 覆盖自动刷课 / 自动视频进度上报（已由 `OnlineLearningChaoxingView` 的"自动学习" Tab 承担）。
2. THE 本 Spec SHALL NOT 覆盖随堂练习、作业、问卷、投票、评分、主题讨论、群聊签到、人脸识别签到。
3. THE 本 Spec SHALL NOT 覆盖雨课堂（Yuketang）平台签到。
4. THE 本 Spec SHALL NOT 覆盖定时 / 后台自动签到；所有签到必须由用户主动触发。
5. THE 本 Spec SHALL NOT 新增第二套学习通登录通道，登录入口完全复用现有 `LoginV3.vue`。
6. THE 本 Spec SHALL NOT 将签到数据同步到云端；`chaoxing_checkin_log` 仅驻留在本地 SQLite。
7. THE 本 Spec SHALL NOT 包含多账号并行签到；一次只服务 `currentStudentId`。
