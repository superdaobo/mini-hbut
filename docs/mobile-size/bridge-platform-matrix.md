# Android Release / iOS Release / iOS TestFlight 的 Bridge 能力矩阵

> 对应 GitHub Issue #593（[Bridge] 核对 iOS/Android 本地 HTTP Bridge 的真实依赖与包体成本）。
> 本文档为**只读审计**产物，不改动任何业务代码；供 #594（Rust 裁剪 Sub-issue）直接决定
> `http_server`（axum / JWT / proxy）各模块在哪些平台发布构建参与编译。
> 审计时间：以本仓库当前 HEAD 为准；所有行号为审计时点行号。

---

## 0. 结论快览

| 平台 / 构建 | Bridge 是否启用 | 编译期可否裁剪 http_server 整组 | 需保留的最小 Router 集合 |
|---|---|---|---|
| Android Release | **否**（运行时开关恒 false） | **可以**（证据见 §6.1） | 无 |
| iOS Release | **是**（`cfg!(target_os="ios")` 恒 true） | 不可以（整组），可按 Router 裁剪 | system（/health、/module_bundle/content）+ proxy + ai（§6.2） |
| iOS TestFlight | **是**（TestFlight 为 Release 配置，逻辑与 iOS Release 完全一致） | 不可以（整组） | 同 iOS Release |
| Desktop Release | 否（除非 `HBUT_HTTP_BRIDGE_ENABLED=1\|true`） | —（本 Issue 不涉及桌面） | — |
| Debug（任意平台） | 是 | — | 全量（含 debug router） |

---

## 1. 平台开关语义

### 1.1 `is_http_bridge_enabled()`（`src-tauri/src/http_server/mod.rs:44-55`）

```rust
pub fn is_http_bridge_enabled() -> bool {
    cfg!(debug_assertions)                    // ① Debug 任意平台：启用
        || cfg!(target_os = "ios")            // ② iOS 任意构建：启用
        || std::env::var("HBUT_HTTP_BRIDGE_ENABLED")  // ③ 仅 1|true 生效
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
}
```

| 平台 / 构建 | ①debug_assertions | ②target_os=ios | ③env | 结论 |
|---|---|---|---|---|
| iOS Debug | true | true | — | **启用** |
| iOS Release | false | true | — | **启用**（仅靠 ②） |
| iOS TestFlight | false（TestFlight 为 Release 配置） | true | — | **启用**，与 iOS Release 逻辑一致 |
| Android Debug | true | false | — | 启用（靠 ①，仅调试包） |
| Android Release | false | false | 默认未设 | **不启用** |
| 桌面 Release | false | false | 默认未设 | 不启用；`HBUT_HTTP_BRIDGE_ENABLED=1|true` 可强制开启 |

### 1.2 端口与监听

- 固定监听 `127.0.0.1:4399`（`mod.rs:61-68` `bridge_listen_addr()`；`HBUT_HTTP_BRIDGE_HOST` 被**有意忽略**，防止暴露到局域网/公网；端口可经 `HBUT_HTTP_BRIDGE_PORT` 调整）。
- 探测：`probe_http_bridge_health()`（`mod.rs:117-132`），GET `http://127.0.0.1:4399/health`，900ms 超时。

### 1.3 启动 / 命令语义

- **冷启动**：`lib.rs:361-363` 在 setup 中调用 `spawn_http_server(client, app.handle())`；`spawn_http_server`（`mod.rs:150-173`）**先查开关，禁用即 return**（`mod.rs:151-153`），不绑定端口、不启动任务。
- **热恢复**：`ensure_http_bridge` 命令（`mod.rs:179-270`，注册于 `lib.rs:401`）：
  - 禁用时立即返回 `{ enabled:false, healthy:false, respawned:false, status:"disabled" }`（`mod.rs:187-199`），**不做任何 spawn**；
  - 启用时探测 `/health`，不可达则 shutdown 旧 listener 并 respawn（`mod.rs:201-249`）。
- **中间件 / CORS**：`run_http_server` 挂载 `bridge_access_middleware`（`mod.rs:307-313`；实现 `auth.rs:345-377`）与 `bridge_cors_layer()`（`auth.rs:380-397`）。路由策略 `bridge_route_policy`（`auth.rs:196-213`）：`/health` 公开；`/exports/*`、`/module_bundle/content/*`、`/school-website*` 为 PublicEmbed（仅 GET/HEAD，允许无 Origin 的子 WebView 顶层导航）；`/debug/*`、`/campus-guide-debug/*` 仅 Debug；其余为 Protected（需可信 Origin 或 Bearer/`x-local-token` 会话令牌）。
- **Router 组合**：`build_router()`（`mod.rs:277-295`）＝ auth + academic + schedule + course_selection + online_learning + system + proxy + ai 八组；`#[cfg(debug_assertions)]` 追加 debug.rs / schedule::debug_router / proxy::debug_router 三组。**debug 三组在 Release（含 iOS Release/TestFlight、Android Release）不参与编译**（`routes/mod.rs:7-8`）。

---

## 2. 前端 Bridge 消费者清单（生产代码调用点）

### 2.1 Tauri iOS（生产路径，真依赖 loopback 4399）

| 消费者（文件:行号） | 访问的 URL / 路由 | 触发场景 |
|---|---|---|
| `src/utils/school_website_embed.ts:10-13,33-57` | `http://127.0.0.1:4399/school-website/`、GET `/health`（先探 health 再 HEAD 代理路径） | 官网嵌入探测 |
| `src/utils/school_website_embed.ts:102-118` `resolveSchoolWebsiteEmbedMode` | iOS → `proxy-iframe`（依赖 proxy 可达），否则降级 `external-open` | 官网视图挂载 |
| `src/utils/school_website_embed.ts:72-84` `invokeEnsureHttpBridge` | invoke `ensure_http_bridge` 命令 | resume / remount 前确保桥存活 |
| `src/utils/school_website_embed.ts:90-100` `recoverSchoolWebsiteBridgeOnResume` | invoke + `/health` 探测 | 前台恢复（Android 直接返回 false，不发起） |
| `src/components/SchoolWebsiteView.vue:110,153` | 解析 embed 模式 + ensure 后 remount；`hbu-embed-resume` 监听（:217） | 官网页挂载 / 恢复 |
| `src/app/coordinators/LifecycleCoordinator.ts:252-284,313` | resume 时动态 import `school_website_embed.ts` 执行 ensure/恢复，并派发 `hbu-embed-resume` 事件 | App 前台恢复 |
| `src/utils/more_modules/core.js:44-47` | `canUseLocalModuleBridgePreview = isTauriRuntime() && !isLikelyAndroidUserAgent()`；URL 正则 `127.0.0.1\|localhost/module_bundle/content/` | 模块 preview 判定（Android 排除） |
| `src/utils/more_modules.js:421-426,508-512,657` | 采用 `http://127.0.0.1:4399/module_bundle/content/...`（Tauri 非 Android） | 模块 host 打开 |
| `src/components/MoreModuleHostView.vue:51-53` | `previewUrl` 仅 `canUseLocalModuleBridgePreview()` 时取 bridge preview_url | 模块 host iframe |
| `src/components/MoreModuleHostView.vue:344-362` | resume 时 `recoverSchoolWebsiteBridgeOnResume()` → bridgeOk=false 则转外部打开 | 模块 host 恢复 |
| `src-tauri/src/modules/module_bundle.rs:214-217`（Rust） | `build_preview_url` 生成 `http://127.0.0.1:4399/module_bundle/content/{channel}/{module_id}/{version}/{entry}`（:474/:523 返回给前端） | `prepare_module_bundle` 命令的 preview_url |
| `src/features/campus-guide/config.ts:58-74` `resolveCampusGuideBaseUrl` | iOS/桌面 → `http://127.0.0.1:4399/campus-guide`（Android 显式绕开，见 §2.3） | 校园导览 API |
| `src/features/campus-map/services/walking_route_service.ts:28-35` | iOS/桌面 → `http://127.0.0.1:4399/campus-map/direction`（Android 相对路径） | 步行路线 |
| `src/utils/towergo_api.ts:260-267` `resolveTowerGoBaseUrl` | 有 `__TAURI_INTERNALS__/__TAURI__` 即 `http://127.0.0.1:4399/towergo`（**无 Android 判断**，见风险 §7） | 小塔出行 API |
| `src/features/chaoxing/utils/normalize.ts:264-268` `toVideoProxyUrl` | Tauri 下视频直链 → `http://127.0.0.1:4399/proxy/video?url=...`；调用点 `useChaoxingCourseNav.ts:202`（**无 Android 分支**，见风险 §7） | 学习通视频播放 |
| `src/components/ResourceShareView.vue:99-106,154,164,606` | Tauri 下候选 base 首选 `http://127.0.0.1:4399` → `/resource_share/proxy`、`/resource_share/direct_url`（另有原生命令替代 :409/:587/:668） | 资源网盘 |
| `src/features/ai/chat-model.js:8-19` + `src/components/AiChatView.vue:277-328,913` | `AI_BRIDGE_CANDIDATES = ['http://127.0.0.1:4399','http://localhost:4399']`；`/health` probe、`/ai_init`、`/ai_upload`、`/ai_chat`、`/ai_chat_stream`、`/ai_chat_session/*`（**无原生命令替代**） | AI 聊天（湖工小实） |

### 2.2 仅 Web / dev（`!hasTauri` 分支或 vite dev proxy，**Tauri 不消费**）

| 消费者（文件:行号） | 访问的 URL / 路由 | 说明 |
|---|---|---|
| `src/utils/axios_adapter/bridge.ts:25-26,69-83` | `BRIDGE_BASE = hasTauri ? 127.0.0.1:4399 : '/bridge'`；`bridgePost/bridgeGet` | 浏览器模式打 `/bridge`（vite proxy 转发） |
| `src/utils/axios_adapter/auth.ts:19-34` | `/login` | 仅 `!hasTauri`（Tauri 走 invoke `login`） |
| `src/utils/axios_adapter/get.ts:44-85` | `/fetch_semesters`、`/qxzkb/options`、`/fetch_classroom_buildings` | 三处均 `if (!hasTauri)`（:46/:60/:74） |
| `src/utils/axios_adapter/post.ts`（40+ 处，如 :35/:74/:91/:183/:364/:410/:461/:578/:878/:915/:961/:976） | `/sync_grades`、`/sync_schedule`、`/schedule/custom/*`、`/export_schedule_calendar`、`/fetch_exams`、`/fetch_ranking`、`/fetch_student_info`、`/fetch_personal_login_access_info`、`/fetch_classrooms`、`/fetch_training_plan_*`、`/library/*`、`/qxzkb/*`、`/course_selection/*`、`/online_learning/*`（含 chaoxing/yuketang）、`/electricity_query_account`、`/campus_code/*`、`/fetch_calendar_data`、`/fetch_academic_progress` | **全部位于 `if (!hasTauri)` 分支**；Tauri（iOS/Android）一律走同名原生命令 invoke |
| `src/app/coordinators/SessionCoordinator.ts:46-70,152-157,180-182` | `/restore_session`、`/import_cookies` | 桥分支仅 `!hasTauri` 执行（:152/:180）；Tauri 走 invoke `restore_session` |
| `vite.config.ts:142-173` | dev proxy：`/bridge`、`/towergo`、`/campus-map`、`/campus-guide`、`/campus-guide-debug`、`/school-website` → `127.0.0.1:4399` | 纯开发服务器配置，不打进产物 |

### 2.3 Android Tauri（隐式 / 尝试连接，不构成裁剪阻塞）

| 消费者（文件:行号） | 行为 | 结论 |
|---|---|---|
| `src/features/campus-guide/config.ts:61-67` | 注释明示「Android：绝不走 loopback（Release 不 spawn 4399）」，返回 HTTPS 配置或相对路径 | **显式排除** |
| `src/features/campus-map/services/walking_route_service.ts:26,32` | Android 返回相对路径 | **显式排除** |
| `src/utils/school_website_embed.ts:74-77,92,106-108` | Android → `external-open`；`invokeEnsureHttpBridge` 直接返回 `disabled`（不 invoke）；resume 返回 false | **显式排除** |
| `src/utils/more_modules/core.js:47` | `canUseLocalModuleBridgePreview` 排除 Android | **显式排除** |
| `src/components/MoreModuleHostView.vue:53,344-353` | Android 不取 bridge preview_url；usesLoopback=false → 外部打开 | **显式排除** |
| `src/utils/axios_adapter/*` | 全部 bridge 分支仅 `!hasTauri`，Android Tauri 走 invoke | **无消费者** |
| `src/utils/towergo_api.ts:265` | 无 Android 判断，Android 也会尝试 `127.0.0.1:4399/towergo`（连接失败） | 隐式尝试，见 §7 |
| `src/features/chaoxing/utils/normalize.ts:267` + `useChaoxingCourseNav.ts:202` | Android Tauri 视频 src 也会指向 `127.0.0.1:4399/proxy/video`（失败/降级） | 隐式尝试，见 §7 |
| `src/features/ai/chat-model.js:8` | Android 上 AiChatView 会 probe 4399 失败 → 提示 AI 不可用（既有产品行为） | 隐式尝试，无桥可降级 |

### 2.4 排除项（Issue 提及但无 Bridge 关联）

- `src/utils/hot_update.js`：全文无 `4399` / `bridge` / `module_bundle` 引用，与 http_server **无任何关系**，不在本矩阵内。

---

## 3. 各 Router 平台消费者矩阵

| Router（源文件） | Android Release 生产消费者 | iOS 生产消费者 | 证据 |
|---|---|---|---|
| auth（`routes/auth.rs:117-120`：/login、/restore_session、/export_cookies、/import_cookies） | 无 | 无 | 前端登录/恢复走 invoke（`axios_adapter/auth.ts:35`、`SessionCoordinator.ts:181`）；桥分支仅 `!hasTauri`（auth.ts:19、SessionCoordinator.ts:152/180） |
| academic（`routes/academic.rs:366-391`：/sync_grades、/sync_schedule、/fetch_exams、/fetch_ranking、/fetch_student_info、/fetch_personal_login_access_info、/fetch_semesters、/fetch_classrooms、/fetch_training_plan_jys、/fetch_training_plan_options、/fetch_training_plan_courses、/fetch_calendar_data、/fetch_academic_progress） | 无 | 无 | post.ts/get.ts 对应桥调用全在 `if (!hasTauri)`（get.ts:46/60/74、post.ts:35/74/182/220/238/253/272/297/313/327/960/975 等） |
| schedule（`routes/schedule.rs:1153-1159`：/schedule/custom/*、/export_schedule_calendar、/exports/:filename） | 无 | 无 | 桥调用全在 `!hasTauri`（post.ts:91/109/124/139/154/169）；`/exports/:filename` 全仓库无前端 fetch 引用 |
| course_selection（`routes/course_selection.rs:126-161`：/course_selection/overview、list、end_time、child_classes、select、withdraw、selected_courses、detail_intro、detail_teacher） | 无 | 无 | post.ts:461-568 全在 `if (!hasTauri)`；Tauri 走 `fetch_course_selection_*` invoke |
| online_learning（`routes/online_learning.rs:393-504`：/online_learning/* 28 条，含 chaoxing/yuketang 会话、课程、进度、心跳） | 无 | 无 | post.ts:578-857 全在 `if (!hasTauri)`；Tauri 走 `online_learning_*`/`chaoxing_*`/`yuketang_*` invoke |
| system（`routes/system.rs:600-637`：/health、/module_bundle/prepare、/module_bundle/open、/module_bundle/content/:channel/:module_id/:version(/*path)、/cache/get、/qxzkb/*、/library/*、/electricity_query_*、/fetch_transaction_history、/one_code_token、/campus_code/*） | 无 | **部分必需** | iOS：`/health`（school_website_embed.ts:38、AiChatView.vue:294 probe）、`/module_bundle/content/*`（module_bundle.rs:216 生成、MoreModuleHostView.vue:53 加载）；`/module_bundle/prepare` 无前端 fetch 消费者（prepare 走原生命令 lib.rs:402），/qxzkb、/library、/campus_code 等桥端点仅 dev（post.ts `!hasTauri`） |
| proxy（`routes/proxy.rs:1232-1243`：/towergo/*path、/campus-map/direction、/campus-guide/*path、/school-website(根/子)、/resource_share/direct_url、/resource_share/proxy、/proxy/video） | 无 | **全部必需** | 见 §4 证据 |
| ai（`routes/ai.rs:761-768`：/ai_init、/ai_upload、/ai_chat、/ai_chat_stream、/ai_chat_session/new、history、messages、delete） | 无（仅 probe 失败提示） | **必需** | chat-model.js:8-19、AiChatView.vue:277-328/913；无原生命令替代 |
| debug（`routes/debug.rs:523-537` + `schedule.rs:1162-1167` debug_router + `proxy.rs:1245-1252` debug_router） | 不编译 | 不编译 | `#[cfg(debug_assertions)]`（routes/mod.rs:7-8、mod.rs:288-292）；Release 全平台排除 |

> 说明：academic / schedule / course_selection / online_learning 四组是「统一组合但无 Tauri 消费者」—— 它们只服务 dev 浏览器（vite proxy `/bridge`）与外部 curl 调试工具。

---

## 4. proxy / system 的 iOS 必需路径清单（前端调用链证据）

| 必需路径 | 消费者证据 |
|---|---|
| `GET /health` | `school_website_embed.ts:38`（官网探测）、`AiChatView.vue:294`（AI probe）、`mod.rs:201`（ensure 自探） |
| `GET/HEAD /school-website`、`/school-website/`、`/school-website/*path` | `school_website_embed.ts:13,48-53`（proxy-iframe URL + HEAD 探测）、:102-118（iOS 走 proxy-iframe）；PublicEmbed 策略 `auth.rs:200-207` |
| `GET /module_bundle/content/:channel/:module_id/:version(/*path)` | `module_bundle.rs:214-217`（Rust 生成 preview_url）、`more_modules/core.js:44-45`（URL 识别）、`MoreModuleHostView.vue:51-53,344-362`（iframe 加载 + resume 恢复） |
| `GET /campus-guide/*path` | `campus-guide/config.ts:70-71`（iOS → localBridgeBaseUrl） |
| `GET /campus-map/direction` | `walking_route_service.ts:34`（iOS → LOCAL_BRIDGE_ORIGIN） |
| `GET/POST /towergo/*path` | `towergo_api.ts:265,287`（Tauri → localBridgeBaseUrl） |
| `GET /proxy/video` | `normalize.ts:267`（toVideoProxyUrl）、`useChaoxingCourseNav.ts:202`（播放 src） |
| `GET /resource_share/proxy`、`/resource_share/direct_url` | `ResourceShareView.vue:154,164,606`（Tauri 候选 base 首位） |
| `POST /ai_init`、`/ai_upload`、`/ai_chat`、`/ai_chat_stream`、`/ai_chat_session/*` | `chat-model.js:9-19`（AI_BRIDGE_PATHS）、`AiChatView.vue:277-328`（buildBridgeUrl/probe/轮询候选） |

---

## 5. 依赖归属分析（`src-tauri`）

| 依赖 | use / 引用点 | 是否仅 http_server 使用 | 裁剪影响 |
|---|---|---|---|
| `axum` | `http_server/mod.rs:23-24`；`auth.rs:6-10`；`routes/*`、`state.rs`、`response.rs` 全部 | **是**（全仓库无其他模块 use axum） | Android Release 整组排除时可一并移除；iOS 保留 proxy/system/ai + 中间件则必须保留 |
| `tower-http` | 仅 `http_server/auth.rs:17`（`CorsLayer`，Cargo.toml:43 仅 `cors` feature） | **是** | 同 axum |
| `jsonwebtoken` | `http_server/auth.rs:12`（`ensure_local_cache_auth` RS256 校验）、`state.rs:3,14`（`local_api_key`）；消费链 `schedule.rs:785`、`system.rs:208`（均 http_server 内） | **是** | 同 axum；iOS 若保留 system router 的 `/cache/get` 则仍需保留 |
| `tokio-tungstenite` | **`modules/online_learning/yuketang_session.rs:14`**（雨课堂 WebSocket，与 http_server 无关） | **否** | **不可随 http_server 裁剪**（移动端雨课堂功能使用） |
| `reqwest` | 全局：`http_client`、`modules/*`、`http_server`（probe :120） | 否 | 不可裁剪 |
| `tokio` | 全局（axum serve、invoke、各模块） | 否 | 不可裁剪 |

---

## 6. 结论

### 6.1 Android Release：整组可排除证据

1. **运行时开关恒 false**：`mod.rs:49-55`（非 debug、非 iOS、env 默认未设）→ `spawn_http_server` 首行即 return（`mod.rs:151-153`，启动点 `lib.rs:361-363`）；`ensure_http_bridge` 返回 `enabled=false/status=disabled` 且不 spawn（`mod.rs:187-199`）。
2. **前端 URL 决议全部显式绕开 loopback**：
   - 校园导览 `campus-guide/config.ts:61-67`（「Android：绝不走 loopback」）；
   - 步行路线 `walking_route_service.ts:26,32`；
   - 官网嵌入 `school_website_embed.ts:106-108`（external-open）、`:75-77`（invokeEnsureHttpBridge 直接返回 disabled，不 invoke 命令）；
   - 模块 preview `more_modules/core.js:47`（排除 Android）、`MoreModuleHostView.vue:53`（不取 preview_url）、`:344-353`（resume 走外部打开）。
3. **无生产 fetch 调用**：全仓库 4399 生产引用点中，Android 分支全部短路（§2.3）；axios_adapter 全部 bridge 分支仅 `!hasTauri`（§2.2），SessionCoordinator 桥分支仅 `!hasTauri`。
4. **Rust 侧 preview_url 生成无 Android 消费方**：`module_bundle.rs:216-217` 虽生成 4399 URL，但 Android 前端 `canUseLocalModuleBridgePreview=false` 不采用（`MoreModuleHostView.vue:53`）。

> **结论**：Android Release 可在编译期排除整个 `http_server` 模块（含 axum / tower-http / jsonwebtoken 依赖与 `ensure_http_bridge` 命令注册 lib.rs:401）。前提：前端 Android 分支已不 invoke `ensure_http_bridge`（`school_website_embed.ts:75-77` 直接短路返回），移除命令不影响其它命令。
>
> **隐式消费者（不阻塞裁剪，但需产品侧确认，见 §7）**：towergo（towergo_api.ts:265）、学习通视频（normalize.ts:267）、AI probe（chat-model.js:8）三处会在 Android 上发起 127.0.0.1 连接并失败——这是**既有行为**（bridge 从未在 Android Release 启用），裁剪不改变现状，但应记录为 Android 端功能降级点。

### 6.2 iOS（Release / TestFlight）：最小保留集合

| 类别 | 保留内容 | 依据 |
|---|---|---|
| Router：proxy | 全部 7 条生产路由（/towergo、/campus-map/direction、/campus-guide、/school-website×3、/resource_share×2、/proxy/video） | §4 调用链 |
| Router：system | `/health`、`/module_bundle/content/:channel/:module_id/:version(/*path)`；`/module_bundle/prepare`、`/module_bundle/open` 无前端消费者（prepare 走原生命令 lib.rs:402），可裁 | §3 system 行 |
| Router：ai | 8 条（/ai_init、/ai_upload、/ai_chat、/ai_chat_stream、/ai_chat_session/*） | AiChatView 无 invoke 替代 |
| 基础设施 | `auth.rs`（bridge_access_middleware + bridge_cors_layer + bridge_route_policy：PublicEmbed 白名单保护 /school-website 与 /module_bundle/content 的 WebView 顶层导航）、`response.rs`、`state.rs`、/health handler | mod.rs:307-313；auth.rs:196-213 |
| **可裁** | academic、schedule、course_selection、online_learning 四组 Router（及其 handler） | §3：Tauri 无消费者，仅 dev 浏览器/curl 使用 |
| **已自动排除** | debug 三组 | `#[cfg(debug_assertions)]`（routes/mod.rs:7-8） |

> 说明：
> - iOS 保留集合仍需要 axum / tower-http / jsonwebtoken（auth 中间件 + system `/cache/get` 的 `ensure_local_cache_auth`，`auth.rs:81` / `system.rs:208`），因此 iOS 侧收益来自**裁剪 4 个领域 Router 的 handler 与请求类型**，而非移除 HTTP 框架。
> - **TestFlight 与 iOS Release 等价**：TestFlight 为 Release 配置（debug_assertions=false），`cfg!(target_os="ios")` 恒真 → 开关、Router 组合、debug 排除行为完全一致。
> - App Store 商店版（`VITE_APP_STORE_BUILD=1`，`app_store_policy.ts:234-267`）会在**未登录/演示会话**下隐藏 school_website、more、ai、towergo、resource_share 等模块入口，但**真实登录后全功能恢复**（`app_store_policy.ts:102-111`），且入口隐藏不删除打包代码 → 编译期保留集合不受商店版影响，仍按 §6.2。

---

## 7. 风险与回归验证建议

### 7.1 风险点

1. **前端契约测试与 http_server 路由文本耦合**：以下 spec 会 grep Rust/前端源码断言路由文本，裁剪后必须同步更新，否则 CI 挂：
   - `src/utils/phase2a_bridge_runtime_contract.spec.ts`（断言 `path.starts_with("/module_bundle/content/")`、`/school-website/`、`bridge_route_policy` 等，:33-48）
   - `src/utils/campus_guide_bridge_contract.spec.ts`（断言 `.route("/campus-guide/*path", any(campus_guide_proxy))` 与 vite proxy，:29-36）
   - `src/utils/towergo_bridge_contract.spec.ts`（:53-55）
   - `src/features/campus-map/campus_map_contract.spec.ts`（:65）
   - `src/utils/p0_multi_module_contract.spec.ts`、`phase1_security_contract.spec.ts`（CSP 含 `http://127.0.0.1:4399`，:78）
2. **dev 浏览器调试回归**：裁剪 academic/schedule/course_selection/online_learning 后，浏览器模式（`!hasTauri`）经 vite proxy `/bridge` 的对应端点 404 → 本地 Web 调试需保留桌面 debug 构建（debug 构建全量 Router 不受影响）。
3. **Android 三个隐式连接点**（既有降级行为，裁剪前后不变，但建议产品确认）：
   - `towergo_api.ts:265` 无平台判断 → Android 上 towerGoRequest 全部失败；若 Android 端小塔出行不可用属预期，可顺手补 Android 短路（**属业务改动，不在本次审计范围**）；
   - `normalize.ts:267` + `useChaoxingCourseNav.ts:202` → Android 视频 src 指向 4399（播放失败提示）；
   - `chat-model.js:8` → Android 上 AI 显示「本地 AI 服务不可用」。
4. **CSP / 安全契约**：`phase1_security_contract.spec.ts:78` 要求 CSP 含 `http://127.0.0.1:4399`；裁剪 http_server 后 Android 侧该 CSP 条目可评估移除（Android 无 loopback 需求），但 iOS 必须保留。
5. **jsonwebtoken 的 `keys/local_api_public.pem`**：仅 http_server 的 `ensure_local_cache_auth` 消费（`mod.rs:157`、`auth.rs:36-58`）；Android Release 排除后该密钥文件与加载逻辑可一并裁（若未来 Android 不启用 bridge）。

### 7.2 回归验证建议

- **iOS 真机（Release 构建）**：① 官网 proxy-iframe 正常加载且 /health 可达；② 模块市场打开后 iframe 加载 `module_bundle/content` URL；③ 杀进程重进后 module host 恢复（ensure/respawn 路径）；④ 校园导览、步行路线、小塔出行可用；⑤ 学习通视频可播放（/proxy/video 无 403）；⑥ AI 聊天流式回复；⑦ 长后台回前台 5 分钟后官网/模块 remount 正常。
- **iOS TestFlight**：与 Release 同构建配置；额外验证审核账号（演示会话）下 UI 无报错、真实登录后全功能。
- **Android Release**：① 官网为外部浏览器打开；② 模块远端打开正常（无 127.0.0.1 依赖）；③ 各功能 invoke 正常；④ logcat 无 `127.0.0.1:4399` 连接异常刷屏（若有，对应 §7.1-3 三个隐式点，属既有行为）。
- **裁剪验证顺序建议（#594）**：先在 Android 侧用 `cfg!(not(any(debug_assertions, target_os="ios")))` 门控 http_server 整组编译并跑通 Android Release；再在 iOS 侧按「proxy + system(/health、module_bundle/content) + ai」白名单方式裁剪四个领域 Router，跑通 iOS Release + TestFlight 真机回归。
