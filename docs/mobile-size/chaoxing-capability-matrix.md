# Chaoxing / Yuketang / online-learning / check-in 能力-消费者-平台矩阵（Issue #592）

> 目标：为 Rust 侧移动端发布裁剪 Sub-issue（#594）提供「能力 → 消费者 → 平台可达性 → 独占依赖」判定依据，
> 使 #594 能安全地从 Android/iOS 发布构建排除「刷课/自动化」相关命令/模块/依赖，而**不误删 ChaoxingHubView 正常课程中心能力**。
> 审计方式：**只读**，未修改任何源码；注释/文档为简体中文。
> 相关：#589（父）、#590（基线口径）、#591（前端边界，已合并）、#592（本任务）、#594（Rust 侧裁剪）、#595（CI 集成）。
> 审计日期：基于当前工作区（main 分支现状；#582 拆分后行号已重新定位，以下行号均为本工作区实测值）。

---

## 1. 审计方法与证据基线

### 1.1 审计方法

- **前端消费者**：全 `src/` grep（`chaoxing_*` / `yuketang_*` / `online_learning_*` / `checkin` 命令名与 URL），逐条追踪到组件 → viewRegistry → 导航/宫格/远程卡片入口。
- **HTTP/Bridge 消费者**：`src-tauri/src/http_server/routes/online_learning.rs` 全部 handler 与 `.route()` 注册；`http_server/mod.rs::is_http_bridge_enabled` 判定各平台/构建下 Bridge 是否启用。
- **平台可达性**：前端入口可达性（viewRegistry 注册 + Dashboard 宫格 + 远程配置卡片）+ 会话策略 `src/config/app_store_policy.ts` + CI 注入（`ios-testflight.yml` / `release.yml`）+ `http_server/mod.rs:49-55`（Bridge 平台开关）。
- **构建产物证据**：`dist/assets/` 与 `dist/assets/index-fMKI78Tt.js` 的 `__vite__mapDeps` chunk 清单（默认构建产物）：有 chunk = 打进依赖图；无 chunk = 已自然排除。
- **独占 crate 判定**：全 `src-tauri/src` grep `tokio_tungstenite` / `qrcode` / `rqrr` / `image` 的每个使用点，判断是否仅被待裁剪能力引用。

### 1.2 关键基线事实（核验 Issue #592 已知事实）

| 事实 | 核验结果 |
|---|---|
| ChaoxingHubView 调用 `chaoxing_fetch_courses` | ✅ `src/features/chaoxing/composables/useChaoxingCourseList.ts:156`（#582 拆分后由 ChaoxingHubView.vue:39 的 composable 调用） |
| 调用 `chaoxing_get_knowledge_cards` | ✅ `src/features/chaoxing/composables/useChaoxingCourseNav.ts:108` |
| 调用 `chaoxing_get_video_status` | ✅ `useChaoxingCourseNav.ts:193`（视频播放）、`:244`（文档预览） |
| 三个隐藏刷课页无注册 | ✅ MoreShuakeView / OnlineLearningChaoxingView / OnlineLearningYuketangView 在 `src/app/viewRegistry.ts` 无任何 loader/注册；全 `src/` grep 无 import；`dist` 无对应 chunk |
| lib.rs 注册范围 | ✅ `src-tauri/src/lib.rs:481-508`（online_learning 4 命令 + Chaoxing 课程/知识点/视频/分数/进度/上报 + Yuketang 全命令）、`:542-553`（签到 11 命令 + clear_chaoxing_data）、`:416-420`（Chaoxing 登录命令） |
| http_server merge online_learning 路由 | ✅ `src-tauri/src/http_server/routes/online_learning.rs:397-503`（`router()` 内 `.route()` 链；`http_server/mod.rs` 经 `routes::online_learning::router()` 挂载） |
| Cargo.toml 依赖 | ✅ `tokio-tungstenite 0.24`（:49）、`qrcode 0.14`（:59）、`png 0.17`（:64）、`rqrr 0.10.1`（:65）、`image 0.25`（:66）、`xcap/notify-rust` 桌面专属（:72-74） |

### 1.3 平台/构建开关基线（C/D 列判定依据）

| 开关 | 值 | 来源 |
|---|---|---|
| Android 正式发布（release.yml build-android） | `npx tauri android build --target aarch64`，**无** `VITE_APP_STORE_BUILD` → 前端全功能（非合规策略） | `.github/workflows/release.yml:331,341` |
| iOS TestFlight / App Store | `VITE_APP_STORE_BUILD=1`（合规构建）；xcodebuild archive（Tauri iOS） | `.github/workflows/ios-testflight.yml:35-37,251` |
| 合规构建 + guest/未登录（审核路径） | 应用 `APP_STORE_POLICY` + 模块黑名单 → chaoxing_hub / more_chaoxing_checkin 等被拒 | `src/config/app_store_policy.ts:102-111,234-267`（:250-253） |
| 合规构建 + 真实已登录 | `FULL_POLICY`（全功能，与现网一致） | `app_store_policy.ts:222-227,102-111` |
| HTTP Bridge 平台开关 | `debug_assertions \|\| target_os=="ios" \|\| HBUT_HTTP_BRIDGE_ENABLED` → **Android Release 关闭；iOS 任何构建开启**；桌面 dev 开启 | `src-tauri/src/http_server/mod.rs:49-55` |
| 前端编译期隐藏视图（#591） | `VITE_EXCLUDE_HIDDEN_VIEWS=1` 时 `EXCLUDED_HIDDEN_VIEW_IDS={forum}`；**当前 CI 尚未注入该变量（#595 待办）**，viewRegistry 条件分支已就位 | `viewRegistry.ts:12-17,35-37`；`app_store_policy.ts:299-301`；`vite.config.ts:13-15,73-74` |
| 隐藏刷课页（MoreShuake/OnlineLearning*） | 零注册、零 import、dist 无 chunk → **已自然退出前端依赖图**（与 #591 结论一致） | `dist/assets/index-fMKI78Tt.js`（`__vite__mapDeps` 全清单）；全 `src/` grep |

> ⚠️ 命名混淆提示：#594 若以「dist 中 online-learning 开头 chunk」作证据会误判——`dist/assets/online-learning-BKdHTgHy.js` 是**前端 qrcode npm 库**（被 `qrcode-Br_b9tFR.js` 动态 import 做 `toDataURL`，见 `qrcode-Br_b9tFR.js:1`），与 Rust `online_learning` 模块**无关**。

---

## 2. 能力矩阵总表（10 行 × A-F 6 列）

列定义：
- **A** = 前端消费者（文件:行号）
- **B** = HTTP/Bridge 消费者（`http_server/routes/online_learning.rs` 等）
- **C** = Android 正式发布是否真实可达
- **D** = iOS 正式 / TestFlight 是否真实可达
- **E** = 是否属用户明确隐藏的「刷课/自动化」范围（#591 结论）
- **F** = 排除是否连带移除独占 crate / 显著原生代码

### 行 1：Chaoxing 登录 / session（chaoxing_qr_*、chaoxing_password_login、chaoxing_get_session_status、chaoxing_session.rs）

| 列 | 结论与证据 |
|---|---|
| A | 正常：`useChaoxingCourseList.ts:157`（课程列表查会话状态）；`ChaoxingInboxView.vue:63,93,153`（school_inbox_fetch/detail/mark_read，chaoxing 源）；`ChaoxingClassView.vue`（经 `chaoxing_class_ensure_sso`，lib.rs:486）；登录流程 `LoginV3.vue`（chaoxing_qr_init_login 等，lib.rs:416-420）。隐藏：`OnlineLearningChaoxingView.vue:127`（axios /v2/chaoxing/session_status） |
| B | `online_learning.rs:412-415`（`/online_learning/chaoxing/session_status`） |
| C | ✅ 可达：Android Release 非合规构建全功能；Dashboard 宫格 `chaoxing_hub`（`Dashboard.vue:496`）真实登录即达 |
| D | ✅ 可达（真实登录）：合规包 guest 黑名单 `app_store_policy.ts:250` 拒绝 chaoxing_hub，但真实已登录走 `FULL_POLICY`（:222-227）放行 |
| E | ❌ 非隐藏：正常登录/课程中心/收件箱必需；且**签到命令复用同一会话恢复函数**（见 F 备注） |
| F | 无独占 crate。⚠️ 共享证据：`online_learning/chaoxing_session.rs:647 ensure_chaoxing_session_for_checkin` 同时被 `chaoxing_checkin/commands.rs:103` 与正常功能 `school_inbox.rs:343,559`（ChaoxingInboxView 依赖）调用——**此函数不可随签到裁剪** |

### 行 2：课程列表（chaoxing_fetch_courses）

| 列 | 结论与证据 |
|---|---|
| A | **正常（保留）**：`useChaoxingCourseList.ts:156` ← `ChaoxingHubView.vue:39`（`useChaoxingCourseList(core)`）。隐藏：`OnlineLearningChaoxingView.vue:130`（axios /v2/chaoxing/courses） |
| B | `online_learning.rs:417-419`（`/online_learning/chaoxing/courses`）；命令注册 `lib.rs:493` |
| C | ✅ 可达（宫格 chaoxing_hub，`Dashboard.vue:496`；`App.vue:148,493`；`viewRegistry.ts:65,112,160`） |
| D | ✅ 可达（真实登录；guest 黑名单 :250） |
| E | ❌ 非隐藏：ChaoxingHubView 课程列表主数据源 |
| F | 无独占 crate（`chaoxing_courses.rs:1119` 依赖 reqwest/scraper 等共享依赖） |

### 行 3：课程 outline / 章节 / 知识点（chaoxing_fetch_course_outline / chaoxing_get_knowledge_cards）

| 列 | 结论与证据 |
|---|---|
| A | **正常（保留）**：`useChaoxingCourseNav.ts:37`（outline，进入课程章列表）、`:108`（knowledge_cards，进入小节任务卡）← `ChaoxingHubView.vue:41`。隐藏：`OnlineLearningChaoxingView.vue:175`（outline）、`auto_learning.js:244,266`（刷课轮询） |
| B | `online_learning.rs:421-427`（outline）、`:477-479`（knowledge_cards）；命令注册 `lib.rs:494,502` |
| C | ✅ 可达 |
| D | ✅ 可达（真实登录） |
| E | ❌ 非隐藏（正常章节浏览） |
| F | 无独占 crate |

### 行 4：视频状态 / 播放信息（chaoxing_get_video_status）

| 列 | 结论与证据 |
|---|---|
| A | **正常（保留）**：`useChaoxingCourseNav.ts:193`（视频任务播放，构造 playUrls）、`:244`（文档/PPT 预览）。隐藏：`auto_learning.js:339`（刷课轮询视频状态） |
| B | `online_learning.rs:485-487`；命令注册 `lib.rs:503` |
| C | ✅ 可达 |
| D | ✅ 可达（真实登录） |
| E | ❌ 非隐藏（课程中心视频/文档播放核心） |
| F | 无独占 crate |

### 行 5：课程分数（chaoxing_fetch_course_score）

| 列 | 结论与证据 |
|---|---|
| A | **正常（保留）**：`useChaoxingCourseNav.ts:149`（成绩组成页，`ChaoxingHubView` 导航栈 `score` 层）。无隐藏页消费者（隐藏页/auto_learning 不调 course_score） |
| B | `online_learning.rs:481-483`；命令注册 `lib.rs:504` |
| C | ✅ 可达 |
| D | ✅ 可达（真实登录） |
| E | ❌ 非隐藏 |
| F | 无独占 crate |

### 行 6：进度上报（chaoxing_report_progress / chaoxing_fetch_course_progress）

| 列 | 结论与证据 |
|---|---|
| A | `chaoxing_fetch_course_progress`：**正常（保留）**，`useChaoxingCourseNav.ts:71`（打开课程时后台回填进度，非刷课）。`chaoxing_report_progress`：**仅隐藏刷课**，`auto_learning.js:370`（刷课播放进度上报，经 post.ts:818）；全 `src/` 无其它调用 |
| B | `online_learning.rs:429-435`（progress）、`:489-491`（report_progress）；命令注册 `lib.rs:495,505` |
| C | `fetch_course_progress` ✅ 可达；`report_progress` ❌ 无生产前端消费者（仅隐藏页经 axios→bridge；Android Release Bridge 关闭 `http_server/mod.rs:49-55`） |
| D | `fetch_course_progress` ✅ 可达（真实登录）；`report_progress` ❌ 无生产前端消费者（隐藏页已自然排除，dist 无 chunk） |
| E | `report_progress` = **是**（刷课自动化上报）；`fetch_course_progress` = 否（正常课程进度展示） |
| F | 无独占 crate。⚠️ 裁剪 `report_progress` 只需移除命令注册（lib.rs:505）+ 路由（online_learning.rs:489-491），**不能整文件删** `chaoxing_cards.rs`（同一文件含保留的 knowledge_cards :411 / video_status :839 / course_score :676） |

### 行 7：online_learning overview / sync_now / list_sync_runs / clear_cache

| 列 | 结论与证据 |
|---|---|
| A | **无生产消费者**：仅 `MoreShuakeView.vue:98,130,145`（axios `/v2/online_learning/overview|sync_now|clear_cache` → `post.ts:574-625` → invoke）；`list_sync_runs` 无任何前端 URL 发出者。MoreShuakeView 零注册/零 import/dist 无 chunk |
| B | `online_learning.rs:22-35`（overview）、`:38-53`（sync_now）、`:56-88`（list_sync_runs）、`:91-121`（clear_cache）；路由 `:397-411`；命令注册 `lib.rs:481-484` |
| C | ❌ 不可达（页面已排除；Bridge Android Release 关闭） |
| D | ❌ 不可达（页面已排除；无前端消费者） |
| E | **是**（刷课数据同步/清缓存） |
| F | 无独占 crate。⚠️ 共享面：`online_learning/shared.rs` 与 `db::repositories::online_learning.rs`（同步记录/平台状态表）同时被保留的 Chaoxing 课程/大纲/进度读写（`shared.rs:24-28` 缓存键、`save_platform_state` 等）使用——**裁剪时须按函数粒度剥离 overview/sync 逻辑，勿整文件删除 shared.rs / repositories** |

### 行 8：Yuketang 全部命令（QR / courses / outline / progress / chapters / leaf / heartbeat）

| 列 | 结论与证据 |
|---|---|
| A | **无生产消费者**：仅 `OnlineLearningYuketangView.vue:131,167,172,213,236`（axios /v2/yuketang/*）+ `auto_learning.js:462,500,578`（chapters/leaf/heartbeat 刷课）。该视图零注册/零 import/dist 无 chunk；`ChaoxingHubView` 等正常视图**不使用任何 yuketang 命令** |
| B | `online_learning.rs:441-455`（QR create/poll 双别名）、`:457-475`（courses/outline/progress）、`:493-503`（chapters/leaf/heartbeat）；命令注册 `lib.rs:497-501,506-508` |
| C | ❌ 不可达（页面已排除；Bridge 关闭） |
| D | ❌ 不可达（页面已排除；无前端消费者） |
| E | **是**（雨课堂刷课/自动化全套） |
| F | **tokio-tungstenite 独占**（`yuketang_session.rs:14-17`，wss 登录握手 `:114-120`）→ 裁 Yuketang 可连带移除。**qrcode 半共享**（见 §5） |

### 行 9：Chaoxing 签到全部命令（checkin_list/submit_common/submit_location/upload_photo/submit_photo/submit_qrcode/submit_gesture/history/parse_qr_url/decode_qr_image/capture_screen_qr/clear_chaoxing_data）

| 列 | 结论与证据 |
|---|---|
| A | **有真实入口（保留）**：`MoreChaoxingCheckinView.vue:11,38` ← `useChaoxingCheckin.ts:35,55,72,89,103,119,135,146,155,160,168`（11 个 invoke）；入口 = `remote_config.json:102-110` `module_center.modules` internal 卡片（id=chaoxing_checkin，view=more_chaoxing_checkin，key_required=true）→ `MoreView.vue:600-607` handleModuleClick → `:466-470` handleOpenInternalModule → navigate。`clear_chaoxing_data`（commands.rs:582）前端无直接调用，属签到模块隐私清理聚合命令 |
| B | **无 HTTP 路由**（签到仅 Tauri invoke，不走 bridge） |
| C | ✅ 可达：Android Release 非合规构建全功能；卡片需「今日秘钥」（`key_required`，`module_center.js:170`）但入口存在；dist 含 `MoreChaoxingCheckinView-C3Md7QH_.js`（24,649B） |
| D | ✅ 可达（真实登录）：合规 guest 黑名单 `app_store_policy.ts:253` 拒绝（审核路径隐藏），真实已登录 FULL_POLICY 放行；`attendanceAutomation` 策略位（`app_store_policy.ts:128-129`）仅影响 guest 审核路径 |
| E | 属「自动化/辅助」范畴（#591 结论：**不排除**——有远程卡片真实入口；与 forum 不同） |
| F | **rqrr / image 独占**（qr_decode.rs / screen_capture.rs，见 §5）；qrcode 在签到侧仅测试消费。**本轮不裁剪**；若未来产品决定隐藏签到，可整模块移除 `modules/chaoxing_checkin/` 并连带移除 rqrr+image |

### 行 10：隐藏刷课页调用链（online_learning_chaoxing / online_learning_yuketang / auto_learning）

| 列 | 结论与证据 |
|---|---|
| A | **零消费者**：`MoreShuakeView.vue`、`OnlineLearningChaoxingView.vue`、`OnlineLearningYuketangView.vue` 全 `src/` grep 无 import、viewRegistry 无注册、导航无引用；`auto_learning.js` 仅被两个 OnlineLearning*View import（`OnlineLearningChaoxingView.vue:4`、`OnlineLearningYuketangView.vue:4`） |
| B | 无（页面本身无路由；其数据经真正 axios + `${API_BASE}/v2/...` 打 bridge，`OnlineLearningChaoxingView.vue:13,127-182`、`MoreShuakeView.vue:12,98-145`） |
| C | ❌ 不可达（dist 无 chunk；Bridge Android Release 关闭） |
| D | ❌ 不可达（dist 无 chunk；即使 iOS Bridge 开启（`http_server/mod.rs:51`）也无页面消费者） |
| E | **是**（用户明确隐藏的刷课页；#591 已判「已自然排除」） |
| F | 前端无 Rust crate；其 Rust 依赖面 = 行 6/7/8 的命令（可裁剪），无额外独占 crate |

---

## 3. 保留能力清单（ChaoxingHubView 必需，严禁裁剪）

| 能力 | 命令 | 消费者证据 | Rust 实现 |
|---|---|---|---|
| 课程列表 | `chaoxing_fetch_courses` | `useChaoxingCourseList.ts:156`（← ChaoxingHubView.vue:39） | `chaoxing_courses.rs:1119` |
| 会话状态 | `chaoxing_get_session_status` | `useChaoxingCourseList.ts:157` | `chaoxing_session.rs` |
| 课程大纲 | `chaoxing_fetch_course_outline` | `useChaoxingCourseNav.ts:37` | `chaoxing_outline.rs:521` |
| 课程进度（展示） | `chaoxing_fetch_course_progress` | `useChaoxingCourseNav.ts:71` | `chaoxing_outline.rs:558` |
| 小节任务卡 | `chaoxing_get_knowledge_cards` | `useChaoxingCourseNav.ts:108` | `chaoxing_cards.rs:411` |
| 课程分数 | `chaoxing_fetch_course_score` | `useChaoxingCourseNav.ts:149` | `chaoxing_cards.rs:676` |
| 视频/文档播放 | `chaoxing_get_video_status` | `useChaoxingCourseNav.ts:193,244` | `chaoxing_cards.rs:839` |

**入口链证据**：`Dashboard.vue:496`（宫格定义 available:true, requiresLogin:true）→ `viewRegistry.ts:65,112,160`（chaoxing_hub 注册）→ `App.vue:148,493`（渲染）→ `ChaoxingHubView.vue:39,41` → `useChaoxingHubCore.ts:129-148`（cxInvoke → `platform/native.ts:41-83` invokeNative，纯 Tauri invoke、无 bridge 依赖）。
**构建产物证据**：`dist/assets/ChaoxingHubView-CHxsJYP-.js`（32,327B）+ `dist/assets/index-fMKI78Tt.js`（`__vite__mapDeps` 含 `ChaoxingHubView-CHxsJYP-.js`）。
**会话策略证据**：`app_store_policy.ts:250` 黑名单仅约束合规 guest/demo 审核路径；真实登录 `FULL_POLICY`（:222-227）放行 → Android/iOS 正式发布真实用户全可达。
**连带保留**：`chaoxing_session.rs:647 ensure_chaoxing_session_for_checkin`（被 `school_inbox.rs:343,559` 复用，ChaoxingInboxView 正常功能）；`school_inbox_fetch/detail_fetch/mark_read`（`ChaoxingInboxView.vue:63,93,153`）非本次裁剪范围。

---

## 4. 可裁剪能力清单（供 #594）

| 裁剪单元 | 命令/路由 | 判定依据（无生产消费者双重证据） | 移除动作（命令/注册粒度） |
|---|---|---|---|
| online_learning 数据同步 | `online_learning_overview` / `online_learning_sync_now` / `online_learning_list_sync_runs` / `online_learning_clear_cache` | 前端引用搜索：仅 `MoreShuakeView.vue:98,130,145` + `post.ts:574-625`（该页已自然排除）；dist 无对应 chunk；无其它 URL 发出者 | `lib.rs:481-484` 注册；`online_learning.rs:397-411` 路由 + `:22-121` handlers；`transport/tauri/chaoxing.rs:260-311` |
| Yuketang 全套 | `yuketang_create_qr_login` / `yuketang_poll_qr_login` / `yuketang_fetch_courses` / `yuketang_fetch_course_outline` / `yuketang_fetch_course_progress` / `yuketang_get_course_chapters` / `yuketang_get_leaf_info` / `yuketang_send_heartbeat` | 前端引用搜索：仅 `OnlineLearningYuketangView.vue:131,167,172,213,236` + `auto_learning.js:462,500,578`（已自然排除）；dist 无 chunk；`ChaoxingHubView` 及任何正常视图零调用 | `lib.rs:497-501,506-508`；`online_learning.rs:441-475,493-503`；`transport/tauri/chaoxing.rs:585-644,716-746`；`yuketang_*.rs` 文件（可整文件删） |
| Chaoxing 刷课上报 | `chaoxing_report_progress` | 前端引用搜索：仅 `auto_learning.js:370`（已自然排除）；直接 invoke 无任何调用点 | `lib.rs:505`；`online_learning.rs:489-491`；`transport/tauri/chaoxing.rs:690-714`；`chaoxing_cards.rs:947-1010` 单函数（**勿删整文件**，同文件含保留命令） |
| Chaoxing 播放直链（疑似遗留） | `chaoxing_get_launch_url` | 全 `src/` grep：**无任何 URL 发出者**（正常视图与隐藏页均不调用；仅 `post.ts:694-701` 分支定义与 `test_account_fixtures.js:809` 演示拦截） | `lib.rs:496`；`online_learning.rs:437-439`；`transport/tauri/chaoxing.rs:577-584`；`chaoxing_cards.rs:59` 单函数。⚠️ 非刷课能力，属「无消费者但产品可能计划启用」——裁剪前请产品确认，或随 #594 一并移除（桌面保留可用 feature 隔离） |
| 隐藏刷课页前端（#591 已自然排除） | — | 全 `src/` grep 零 import；viewRegistry 零注册；dist 无 chunk | 前端无需动作；仅 Rust 命令裁剪如上 |

> 注：`chaoxing_checkin_*`（行 9）**不在**本轮可裁剪清单（有远程卡片真实入口，#591 明确「不排除」）。
> `clear_chaoxing_data` 无前端调用点但属签到模块聚合能力，随签到模块保留。

---

## 5. 独占依赖分析（tokio-tungstenite / qrcode / rqrr / image 消费点清单）

### 5.1 tokio-tungstenite（Cargo.toml:49）

| 使用点 | 归属能力 |
|---|---|
| `modules/online_learning/yuketang_session.rs:14-17`（connect_async / IntoClientRequest / HeaderValue / Message；wss 握手 `:114-120`） | **Yuketang QR 登录** |

**独占结论**：唯一使用点 = Yuketang 会话 → 行 8 裁剪后**无其他消费者，可连带移除**。

### 5.2 qrcode（Cargo.toml:59）

| 使用点 | 归属能力 |
|---|---|
| `modules/online_learning/shared.rs:10`（use）、`:40`（`QrCode` SVG 渲染，`generate_qr_data_uri`） | **Yuketang QR 登录**（`yuketang_session.rs:339,403,447` 调用生成登录二维码 data URI） |
| `modules/chaoxing_checkin/qr_decode.rs:51,102`（`#[cfg(test)]` 单元测试生成 QR PNG） | 签到（仅测试） |

**独占结论**：**非待裁剪能力独占**。生产消费者 = Yuketang QR 登录；签到侧仅测试引用。
- 若 #594 只裁 Yuketang、保留签到 → **qrcode 必须保留**（shared.rs 生产代码仍引用）。
- 若未来同时裁 Yuketang + 签到 → qrcode 无生产消费者，可移除。
- ⚠️ `shared.rs` 本身必须保留（行 6/7 的缓存键、cookie、`save_platform_state` 等被保留的 Chaoxing 能力复用，`shared.rs:24-28`）。

### 5.3 rqrr（Cargo.toml:65）

| 使用点 | 归属能力 |
|---|---|
| `modules/chaoxing_checkin/qr_decode.rs:26`（`rqrr::PreparedImage::prepare`，生产解码路径） | **签到**（decode_qr_image / capture_screen_qr） |

**独占结论**：唯一使用点 = 签到 → **签到独占**；仅当签到模块被裁剪时可移除（本轮签到保留，rqrr 随保留）。

### 5.4 image（Cargo.toml:66）

| 使用点 | 归属能力 |
|---|---|
| `modules/chaoxing_checkin/qr_decode.rs:18,24,50,63,79,82,85,104,108`（decode 主流程 + 测试） | **签到** |
| `modules/chaoxing_checkin/screen_capture.rs:48`（`DynamicImage::ImageRgba8`） | **签到**（capture_screen_qr；函数体 `#[cfg(desktop)]` 仅桌面编译，`screen_capture.rs:27`，移动端走 PermissionDenied） |

**独占结论**：唯一使用点 = 签到模块 → **签到独占**；本轮签到保留故 image 保留；若未来裁签到可连同 rqrr 一并移除。
附注：`png` crate（Cargo.toml:64）另有共享消费者 `debug_bridge.rs:2`（调试截图编码，非 #592 范围）；`xcap`（Cargo.toml:74）为桌面专属 target 依赖，移动端发布构建不编译。

### 5.5 共享面汇总（裁剪时勿整文件删除）

| 文件 | 保留内容 | 可裁内容 |
|---|---|---|
| `modules/online_learning/chaoxing_cards.rs` | knowledge_cards:411 / video_status:839 / course_score:676 | report_progress:947、launch_url:59（单函数） |
| `modules/online_learning/shared.rs` | 缓存键/cookie/时间/save_platform_state 等 | 无（overview 缓存逻辑按函数剥离） |
| `modules/online_learning/chaoxing_session.rs` | ensure_chaoxing_session_for_checkin:647（school_inbox.rs:343,559 复用）等 | 无 |
| `modules/chaoxing_checkin/`（整目录） | — | 本轮不裁（有真实入口）；未来若裁可整目录 + rqrr + image |

---

## 6. 风险与验证建议

### 6.1 风险

1. **误删课程中心**：`chaoxing_report_progress` 与 `chaoxing_get_video_status` 同文件（chaoxing_cards.rs）——若按「文件」粒度裁剪会连带删掉视频播放（行 4，保留）。→ 必须按命令/函数粒度。
2. **误删共享 session**：`ensure_chaoxing_session_for_checkin` 名字带「checkin」但被 ChaoxingInboxView（school_inbox.rs:343,559）正常使用——若按「签到相关」一刀切会打断收件箱。→ 保留该函数。
3. **误删 shared.rs / repositories**：overview 的同步记录表与 Chaoxing 课程缓存在同一仓储文件（`infrastructure/db/repositories/online_learning.rs`）——整文件删除会破坏保留能力缓存。→ 按表/函数剥离。
4. **qrcode 误移除**：qrcode 的生产消费者是 Yuketang QR 登录（shared.rs），签到仅测试引用——若只裁签到却删 qrcode 会编译失败；若只裁 Yuketang 则 qrcode 保留。→ 以 §5.2 为准。
5. **iOS Bridge 仍在**：`is_http_bridge_enabled()` 对 iOS 恒真（http_server/mod.rs:51），裁剪后 iOS 包内 HTTP 路由不可再被任何前端消费（隐藏页已排除），但**路由代码仍在包内**——#594 若追求极致体积可考虑 iOS 侧移除整段 online_learning 路由，需保证无残留调用（前端已无 axios 发出者）。
6. **CI 注入未完成（#595）**：`VITE_EXCLUDE_HIDDEN_VIEWS` 当前未注入任何 workflow，dist 默认构建仍含 forum；但隐藏刷课页与 #592 无关（它们本就不进依赖图），#594 的 Rust 裁剪不依赖该变量。

### 6.2 验证建议（#594 落地后）

1. `cargo check --target aarch64-linux-android` 与 `aarch64-apple-ios` 均通过（移动端 target 编译验证，`release.yml:200` 有 android target 先例）。
2. 前端回归：Android/iOS 真机（或 WebView 模拟）走通 Dashboard → 课程中心 → 课程 → 章 → 小节 → 视频/文档/成绩全链路；More → 学习通签到（含普通/位置/拍照/二维码/手势）入口与提交。
3. 构建产物核对：`dist/assets` 仍含 `ChaoxingHubView-*.js` 与 `MoreChaoxingCheckinView-*.js`，且不含 `Shuake` / `OnlineLearning*` chunk（可用 `node scripts/report_bundle_sizes.mjs`，口径同 #590）。
4. 二进制体积对比：裁剪前后 `cargo build --release --target aarch64-linux-android` 产物大小差（tokio-tungstenite + qrcode + 相关模块预期显著下降；rqrr/image 因签到保留暂不变化）。
5. HTTP 回归（桌面 dev 保留全功能）：确认 `HBUT_HTTP_BRIDGE_ENABLED` 桌面调试路径不受影响（本任务只改移动端发布构建的注册表，建议 #594 用 `cfg!(not(mobile_release))` 或 feature 隔离而非删源码，保持桌面全功能）。

---

*本文档为只读审计产物，未修改任何源码；行号基于审计时工作区实测，实施前请复核。*
