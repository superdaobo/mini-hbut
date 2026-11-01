# Mini-HBUT 架构现状与下一阶段迁移需求说明

> **文档性质**：面向其他 AI Agent / 人类架构评审者的输入材料。只描述**现状事实**与**用户需求**，不包含实施方案建议。
>
> **编写基线**：
>
> - 客户端主仓：`D:\Documents\C_learn\成绩查询\tauri-app`，`main` 分支，HEAD `c520a9b6`（2026-10-30）。
> - 身份平台：`tauri-app/identity-platform`（随主仓版本管理，Vercel 部署）。
> - 后端：`D:\Documents\C_learn\成绩查询\ocr-service`（部署在社团 NAS，服务名 `fdl-ocr-service`）。
> - 生产主域：`https://mini.hbut.site`；兜底域：`https://mini-hbut-ocr-service.hf.space`。
>
> **事实标注约定**：
>
> - 带文件路径的陈述均来自仓库内代码或文档，可直接复核。
> - 标 `【未确认】` 的条目表示仓库内无直接证据，来自用户口述或旧文档，需在使用前核实。
> - 标 `【用户原话】` 的段落逐字保留用户表述。
>
> **在线地址**：
>
> - 项目主仓（GitHub）：[superdaobo/mini-hbut](https://github.com/superdaobo/mini-hbut)
> - 身份平台源码：[superdaobo/mini-hbut · identity-platform](https://github.com/superdaobo/mini-hbut/tree/main/identity-platform)
> - OCR 服务源码（GitHub）：[superdaobo/OCR-services](https://github.com/superdaobo/OCR-services)
> - OCR 服务 Hugging Face Space：[mini-hbut/ocr-service](https://huggingface.co/spaces/mini-hbut/ocr-service)
> - OCR 服务 HF 运行域名：<https://mini-hbut-ocr-service.hf.space>

---

## 0. 阅读指引

### 0.1 三个代码库的定位

| 代码库 | 物理路径 | 在线地址 | 运行位置 | 角色 |
|---|---|---|---|---|
| 客户端 | `tauri-app/apps/client` | [GitHub · mini-hbut](https://github.com/superdaobo/mini-hbut) | 用户设备（Windows / macOS / Android / iOS） | Vue 3 前端 + Tauri Rust 后端 + Capacitor 移动壳 |
| 身份平台 | `tauri-app/identity-platform` | [GitHub · identity-platform](https://github.com/superdaobo/mini-hbut/tree/main/identity-platform) | Vercel（两个 Project） | 自建 OIDC Provider、授权接力页、开发者/管理门户 |
| OCR 后端 | `ocr-service` | [GitHub · OCR-services](https://github.com/superdaobo/OCR-services) / [HF Space](https://huggingface.co/spaces/mini-hbut/ocr-service) | 社团 NAS（Docker，`mini.hbut.site`）；HF Space 已剥离、仅备用 | OCR、云同步、论坛、给分记录、使用统计、游戏平台、排行榜 |

### 0.2 一句话现状

用户设备上的 Tauri 客户端通过 Rust 层完成学校账号登录并持有**全链路 Cookie**；所有业务请求（成绩、课表、学习通、图书馆、电费等）目前由 **Rust 写死实现并注册为 Tauri Command**；云侧能力（论坛、云同步、游戏平台、OCR）由 NAS 上的 FastAPI 单进程提供；第三方应用的身份接入由 **自建 identity-platform** 提供（OIDC + 设备签名 + 深链/二维码批准）。

### 0.3 本文不覆盖的内容

- 学校各业务系统（教务、学习通、一码通）的内部协议细节，仅在需要说明链路时引用。
- 客户端 UI 视觉与交互规范。
- 发布流水线细节（仅在与架构边界相关处提及）。

### 0.4 文档导航（给 Agent）

| 目标 | 阅读章节 |
|---|---|
| 理解客户端现状（前端 / Rust / 本地数据 / 远程下发 / 身份） | 第 1、2 章 |
| 理解开发者平台（OIDC / API / 数据模型 / 授权流程 / 第三方接入限制） | 第 3 章 |
| 理解 NAS 后端（FastAPI 组成 / API / 认证 / 数据 / Casdoor 现状） | 第 4 章 |
| 理解用户到底要什么（原文 + 结构化拆解 + 待明确点） | 第 5 章 |
| 做差距分析 / 评估工作量 | 第 6、8 章 |
| 做迁移设计前的约束核对 | 第 9 章 |
| 找代码落点 | 第 10 章 |

---

## 1. 系统全景

### 1.1 部署拓扑（现状）

```text
┌──────────────────────────── 用户设备 ────────────────────────────┐
│  Vue 3 前端（src/）                                              │
│    ├─ 视图：首页 / 课表 / 通知 / 我的 / 更多 / 模块中心 …        │
│    ├─ Coordinators：Auth / Navigation / RemoteConfig             │
│    ├─ 请求层：axios 直连 NAS 后端、invoke 调 Rust                │
│    └─ 本地状态：localStorage / SQLite（经 Rust）                 │
│                                                                  │
│  Tauri Rust 后端（src-tauri/src/）                               │
│    ├─ HbutClient：reqwest + Cookie Jar（CAS / 教务 / 学习通 /   │
│    │              一码通 / 电费 / 图书馆）                       │
│    ├─ 238 个 #[tauri::command]：业务请求 + 解析 + 落库          │
│    ├─ Identity：Ed25519 设备密钥（OS keyring）、设备注册、        │
│    │            授权批准签名、设备换票                           │
│    ├─ SQLite：会话 Cookie 快照 / 成绩 / 课表 / 自定义课程 / 缓存 │
│    └─ 本地 HTTP Bridge（127.0.0.1:4399，feature = bridge）       │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ HTTPS                          │ HTTPS
                ▼                                ▼
┌──────────────────────────────┐   ┌─────────────────────────────────┐
│ 学校系统（仅用户设备直连）    │   │ 社团 NAS（Docker）               │
│  auth.hbut.edu.cn（CAS）      │   │  Traefik → fdl-ocr-service       │
│  jwxt.hbut.edu.cn（教务）     │   │  FastAPI 单进程：                │
│  hbut.jw.chaoxing.com（学习通）│   │    OCR / 云同步 / 论坛 / 统计 /  │
│  code.hbut.edu.cn（一码通）   │   │    游戏平台 / 排行榜 / 给分记录  │
│  e.hbut.edu.cn（融合门户）    │   │  PostgreSQL / SQLPub / Turso     │
└──────────────────────────────┘   │  Casdoor：sso.hbut.site【文档记载】 │
                                   └─────────────────────────────────┘
                                                ▲
                                                │ HTTPS
┌───────────────────────────────────────────────┴──────────────────┐
│ Vercel                                                           │
│  core（Koa + oidc-provider v9）  id.湖北工业大学.com              │
│  web（Next.js 16）               auth.湖北工业大学.com            │
│                                  developer.湖北工业大学.com       │
│  数据库：PostgreSQL（Neon）                                       │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 三条独立的"远程下发"通道（客户端现状）

客户端目前同时存在三条互不相同的远程能力通道，理解它们是理解后续热更新需求的前提：

| 通道 | 载体 | 下发内容 | 生效方式 | 关键代码 |
|---|---|---|---|---|
| 远程配置 | `remote_config.json`（GitCode 仓库 raw） | 公告、强制更新、OCR 端点、后端端点组、模块中心清单、游戏平台开关、AI 模型列表 | 启动/进入页面时拉取并写本地快照 | `src/utils/remote_config.ts`、`src/utils/remote_config_defaults.ts` |
| 远程模块 | 模块 `manifest.json` + `bundle.zip`（`https://hbut.6661111.xyz/modules`） | 每个远程模块的 HTML/JS 包 | 下载解压到 AppData，原生窗口或 iframe 打开 | `src-tauri/src/modules/module_bundle.rs`、`src/components/MoreView.vue` |
| 热更新框架 | `hot-manifest.json` + `bundle.zip`（URL 由调用方传入） | 整包前端资源（ZIP） | 下载 → SHA256/签名校验 → stage → 下次启动切换 | `src/utils/hot_update*.js`、`src/utils/hot_update_bootstrap.js` |

此外还有全量安装包更新（`src/utils/updater.ts`，走 GitHub Releases / CDN / App Store），与上述三条通道正交。

### 1.3 现有身份与授权的两条链路

**链路 A：学校账号登录（设备本地）**

```text
用户输入账号密码 / 扫码
  → Rust HbutClient 走 CAS（auth.hbut.edu.cn/authserver）
  → 换取教务 jwxt 会话（service=/admin/caslogin）
  → 派生学习通会话 / 一码通 token / 电费与图书馆会话
  → Cookie Jar 持久化（SQLite 会话表 + 快照）
  → UserInfo（学号、姓名、角色）
```

**链路 B：Mini-HBUT 身份平台（云端）**

```text
App 首次需要授权时
  → Rust 生成 Ed25519 设备密钥（OS keyring）
  → 用 handoff 调 Core /api/v1/app/devices/enrollment-challenges + /enroll
  → 第三方网页（auth.*）展示深链 + 二维码
  → App 内确认 scope，Rust 用设备私钥签名 approve
  → 网页轮询到 APPROVED，BFF 调 Core resume
  → Core（oidc-provider）签发授权码 → 第三方换 token
```

第二条链路目前只服务于第三方应用接入（以及第一方论坛/云同步/游戏平台的 Access Token）。

---

## 2. 客户端现状（`tauri-app/apps/client`）

### 2.1 技术栈与构建形态

| 项 | 事实 | 依据 |
|---|---|---|
| 框架 | Vue 3 + Vite + TypeScript | `apps/client/package.json`、`vite.config.ts` |
| 桌面壳 | Tauri 2（Windows / macOS） | `apps/client/src-tauri/` |
| 移动壳 | Capacitor（Android / iOS） | `apps/client/capacitor.config.ts`、`android/`、`ios/` |
| 路由 | **未使用 vue-router**；`App.vue` 通过 `currentView` 动态挂载视图 | `src/App.vue`、`src/navigation/app_navigation.ts` |
| 状态 | Pinia + 模块级单例 store | `src/stores/`、`src/app/state/` |
| 请求 | axios（前端直连后端）+ `invoke`（Rust 能力） | `src/utils/api.ts`、`src/platform/native.ts` |
| 组件规模 | `src/components` 下 67 个 `.vue` 组件（另有同名 `.md` 说明与子目录） | `ls` 计数 |

### 2.2 前端目录职责

| 目录 | 职责 |
|---|---|
| `src/app/` | 应用运行时编排：`coordinators/`（Auth、Navigation、RemoteConfig、LoginOutcome）、`state/`、`contracts/` |
| `src/components/` | 视图与业务组件（登录、首页、课表、成绩、考试、学习通、图书馆、电费、体育场馆、论坛、游戏中心、模块中心等） |
| `src/features/` | 领域切片：`identity`（授权 Overlay、二维码、设备设置）、`forum`、`teacher`、`chaoxing`、`schedule`、`course-selection`、`ai`、`home`、`campus-guide`、`campus-map` |
| `src/navigation/` | 主导航常量：`MAIN_TABS = home / schedule / notifications / me`；`ME_SUB_VIEWS` 列出「我的」子页 |
| `src/utils/` | 请求封装、远程配置、云同步、模块中心、游戏 SDK、身份令牌、热更新、通知、i18n 等 |
| `src/platform/` | 运行时探测（Tauri / Capacitor / Web）与原生能力桥 |
| `src/config/` | 构建期策略（App Store 合规、功能开关） |

### 2.3 Rust 后端（`src-tauri/src`）

#### 2.3.1 分层

| 层 | 目录 / 文件 | 职责 |
|---|---|---|
| 入口 | `main.rs`、`lib.rs` | 初始化 Tauri Builder、注册状态、挂载全部命令、启动 HTTP Bridge |
| 领域服务 | `application/` | `AuthService`、`AcademicService`、`ScheduleService`、`TeacherService`、`SessionService` |
| HTTP 客户端 | `http_client/` | `HbutClient`：Cookie Jar、CAS 登录、教务、学习通、电费、图书馆、AI |
| 功能模块 | `modules/` | 一码通、学习通 SSO、教室、图书馆预约（含 PC/座位/内嵌）、体育场馆、电费、天气、迎新、校邮、培养方案、证书探测、模块包 |
| 传输层 | `transport/tauri/` | 把领域能力包装成 `#[tauri::command]`（auth、account、config、system、update、grades、schedule、academic、qxzkb、course_selection、chaoxing、electricity、forum、library_reserve、teaching_eval、teacher、widget、notification） |
| 身份 | `identity/` | Ed25519 设备密钥、canonical 签名、enrollment、approve、设备换票、授权历史 |
| 持久化 | `infrastructure/db/`、`db.rs` | SQLite：会话、成绩、课表、自定义课程、凭据、缓存、备份 |
| 凭据 | `credential_store.rs`、`secret_envelope.rs` | 密码/凭据加密存储（keyring 优先，受限时降级） |
| 调试 | `debug_bridge.rs`、`runtime_log.rs` | 调试桥与运行日志（含日志脱敏） |

#### 2.3.2 命令规模与业务覆盖

`lib.rs` 的 `generate_handler!` 注册了 **238 个命令**（按该段 `::` 行计数），覆盖：

- 登录/会话：`login`、`get_login_page`、`get_captcha`、`recognize_captcha`、门户二维码登录（`portal_qr_*`）、学习通二维码/密码登录（`chaoxing_qr_*`、`chaoxing_password_login`）、`restore_session`、`auto_relogin_from_stored`、`get_cookies`、`refresh_session`、`logout`
- 多账号：`list_saved_accounts`、`switch_active_account`、`switch_active_account_online`、`delete_saved_account`
- 成绩/考试/排名/学籍：`sync_grades`、`get_grades_local`、`fetch_exams`、`fetch_ranking`、`fetch_student_info`、`fetch_academic_progress`
- 课表：`sync_schedule`、`get_schedule_local`、自定义课程 CRUD、日程事件 CRUD、导出 ICS
- 选课：`fetch_course_selection_*`、`select_course_selection_course`、`withdraw_course_selection_course`
- 学习通：在线学习概览/同步、课程列表/大纲/进度/知识点/视频状态/成绩、签到（普通/位置/拍照/二维码/手势）、资料库
- 一码通：`hbut_one_code_token`、`one_code_app_open_prepare`
- 电费/校园码：`electricity_*`、`campus_code_*`
- 体育场馆：`sports_venue_*`
- 图书馆：馆藏检索、预约（应用/静音仓/研讨室/座位）
- 教学评价：`teaching_eval_*`
- 教师门户：`teacher_*`（#1019，只读）
- 论坛/校邮/迎新：`school_inbox_*`、`smart_orientation_*`
- 身份：`identity_*`（见 2.6）
- 基础设施：远程配置拉取、字体下载、图片缓存、导出文件、通知、Widget 快照、数据库备份

【关键事实】这些业务请求的**URL、参数、HTML/JSON 解析规则全部硬编码在 Rust 中**，新增一个上游接口必须改 Rust 并重新发版。

#### 2.3.3 全链路 Cookie 能力（现状）

`http_client/mod.rs` 与 `http_client/session.rs` 维护一个全局 `HbutClient`：

- 单一 `reqwest::Client` + `cookie::Jar`；所有学校请求复用同一 Cookie 会话。
- 登录：CAS 表单（`lt` / `execution` / 加密盐）→ POST → ticket → 教务 `service=/admin/caslogin` 建立会话。
- 派生：学习通 `xxtlogin`（`jw_uf` 约 2 小时，进程内 90 分钟软 TTL）；一码通 token；电费/图书馆会话。
- 会话持久化：SQLite 会话表 + Cookie 快照（v2 全域 + 旧列双写），支持恢复与静默续期。
- 会话隔离：OCR 使用独立 `ocr_client`，不污染主会话。
- Cookie 输出：`get_cookies` 命令把当前域 Cookie 串交给前端（供 WebView 内嵌页复用登录态）。

### 2.4 本地数据与凭据

| 载体 | 内容 | 位置 |
|---|---|---|
| SQLite `grades.db` | 会话、成绩、课表、自定义课程、日程、缓存、给分记录 | 应用数据目录（`db.rs`） |
| Cookie 快照 | 各域 Cookie 串（加密信封） | 应用数据目录 |
| OS keyring | 设备 Ed25519 私钥（`service=mini-hbut-identity`）、记住的密码 | 系统凭据管理器 |
| localStorage | 非敏感元数据：`hbu_identity_device_id`、`hbu_identity_user_id`、`hbu_remote_config_snapshot`、云同步状态等 | WebView |
| 内存 | Identity Access Token（只用不落盘） | `identity_access_token.ts` |

### 2.5 远程配置 / 远程模块 / 热更新（细节）

#### 2.5.1 远程配置

- 远端地址（按优先级）：
  1. `https://api.gitcode.com/api/v5/repos/superdaobo/mini-hbut-config/raw/remote_config.json?ref=main`
  2. `https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json`
  3. `https://gh-proxy.com/https://raw.gitcode.com/...`
  4. 包内兜底 `/remote_config.json`
- 本地快照：`localStorage['hbu_remote_config_snapshot']`；成功且内容变化才覆盖。
- 配置块包含：`announcements`、`force_update`、`ocr`、`temp_upload`、`cloud_sync`、`forum`、`backend`、`module_center`、`game_platform`、`chaoxing_class`、`ai_models`、`resource_share`、`config_admin_ids`。
- `backend` 块定义**端点组 + 故障转移**（主域 `mini.hbut.site` / 兜底 `hf.space`），契约见 `docs/architecture/backend-endpoints-contract.md`。
- 前端读取入口：`src/utils/remote_config.ts`；纯归一化在 `src/utils/remote_config_defaults.ts`。

#### 2.5.2 远程模块（模块中心）

- 模块清单来自远程配置 `module_center.modules`；默认清单是 11 个内置小游戏（`src/utils/module_center.js`）。
- CDN 基址：`https://hbut.6661111.xyz/modules`（`MODULE_CDN_BASE`）。
- 加载流程（`src/components/MoreView.vue`）：`fetchModuleManifest(manifest_url)` → 得到 `{version, package_url, package_sha256, min_compatible_version, entry_path}` → Rust `prepare_module_bundle` 下载/校验/解压 → `open_module_bundle_window` 打开独立窗口（桌面）或 iframe（移动/受限环境）。
- 缓存：`AppData/more_modules/<channel>/<module_id>/<version>/`；元数据 `.module-cache-meta.json`。
- 兼容性：`min_compatible_version` 与当前原生版本比较，不兼容则拒绝加载。

#### 2.5.3 热更新框架

- 构建脚本：`apps/client/scripts/build_hot_bundle.mjs`；产物为 ZIP + `hot-manifest.json`。
- 前端流程（`src/utils/hot_update.js`）：
  1. `checkHotBundleManifest(url)` → 校验 manifest 与原生版本兼容性；
  2. `downloadHotBundle` → 写入 `AppCache/hot-update/downloads/<version>.zip`；
  3. `verifyHotBundle` → SHA256（`sha256Hex`）+ 可选 `signature`（V1 实际是 digest 比较，协议预留）；
  4. `stageHotBundle` → 复制到 `AppData/hot-update/bundles/<version>/`，状态写入 `hot-update/state.json`；
  5. `markHotBundleForNextLaunch` → 下次启动生效。
- 启动裁决（`src/utils/hot_update_bootstrap.js`）：`resolveHotBundleLaunchPlan(state, stagedManifest, currentManifest, context)` 输出 `builtin / staged / current` 三种 action；失败版本进入 `failed_versions` 黑名单并回滚。
- 启用条件（`ensureEnabled`）：
  - 非 App Store 合规构建（`isHotUpdateAllowed()`）；
  - 运行在 Tauri；
  - 调试配置 `debug.enable_hot_update_framework === true`（`get_debug_runtime_config`）。
- 现状定位：该框架是**实验性/调试开启**的整包热更；日常生产未默认启用（`debug_bridge.rs` 中 `enable_hot_update_framework` 默认 `false`）。

#### 2.5.4 App Store 合规约束（对热更新/远程代码的硬限制）

`src/config/app_store_policy.ts` 定义编译期策略：

- 仅 `VITE_APP_STORE_BUILD === '1'`（iOS TestFlight 工作流注入）时启用；
- 合规包在**未登录/演示账号**会话下禁用：`remoteCode`（远程可执行代码/热更新替换前端）、`remoteModules`（模块中心 bundle）、`customJavaScript` 等；
- **真实学校账号登录后**放开（与现网一致）。
- 该策略是编译期注入 + 会话态复合判定，远程配置不能改写。

### 2.6 现有 Mini-HBUT 身份能力（客户端侧）

| 能力 | 实现 | 说明 |
|---|---|---|
| 设备密钥 | `src-tauri/src/identity/device_key.rs`、`keyring.rs` | Ed25519，私钥只在 OS keyring；不可用即 fail closed |
| Enrollment | `identity/enrollment.rs`、`identity/commands.rs` | 用 handoff 取 challenge → 本机私钥签名 → `POST /api/v1/app/devices/enroll` |
| 授权批准 | `identity/approval.rs`、`src/features/identity/` | `identity_sign_auth_request` 完成 canonical 签名；UI 是 `IdentityApprovalOverlay.vue` |
| 授权历史 | `identity/client.rs`、`IdentityDeviceSettings.vue` | `GET /api/v1/app/devices/me/auth-history` |
| 设备换票 | `identity/device_token.rs`、`src/utils/identity_device_token.ts` | 设备签名换 resource-scoped JWT Access Token；AT 只进内存 |
| 跨设备扫码 | `src/features/identity/qr/`（`IdentityQrLoginEntry.vue`、`IdentityQrScanner.vue`、`identityQrScanState.ts`） | 网页展示二维码 → App 扫码 → 打开授权确认 |
| 身份请求通道 | `src/features/identity/identityService.ts` | Tauri 下走 Rust `identity_core_fetch`（规避 WebView 网络策略） |
| 门户后端 | Core `https://id.xn--vhq74jc2fzpchter27a.com`；BFF `https://auth.xn--vhq74jc2fzpchter27a.com` | 常量在 `identityService.ts` |

**现有身份链路的已知能力缺口（客户端与 Core 共同构成）**：

- 没有 `deny` / `cancel` HTTP 端点（Core 仅有领域函数）；App 侧按 best-effort 处理 404/405，拒绝只能靠不批准 + TTL 过期。
- `APP_OPENED` 状态只有领域函数 `openAuthRequest`，没有 HTTP 路由调用它；Web/App 仍渲染该状态。
- 设备撤销 V1 只支持本机自撤销。
- 设备换票不签发 refresh token。

### 2.7 后端端点与故障转移（客户端契约）

- 契约文档：`docs/architecture/backend-endpoints-contract.md`（v1 冻结，2026-10-02）。
- 通道：`cloud_sync` / `game_rank` / `game_platform` / `ocr` / `temp_upload` / `forum`。
- 端点组顺序即优先级；组内所有通道同源；4xx 不触发故障转移（只对网络错误/超时/5xx）。
- 生产域白名单：`mini.hbut.site`（主）、`mini-hbut-ocr-service.hf.space`（兜底）。**注**：后端主体已迁回 NAS，HF Space 已剥离、仅作备用；但客户端契约仍保留该兜底域。
- 当前游戏平台在主域曾缺 `/api/game-platform/v1/*`，靠远程配置把 `api_base` 钉在兜底域（`docs/architecture/production-backend-gaps.md`，2026-10-06 记录；后续是否已在主域补齐需核实）。

### 2.8 平台差异

| 平台 | 差异点 |
|---|---|
| Tauri（Windows/macOS） | 完整 Rust 能力：原生窗口、keyring、SQLite、HTTP Bridge、模块独立窗口 |
| Capacitor（Android/iOS） | 无 Rust 进程；部分能力由前端/原生插件替代；设备私钥不可用 → 身份链路回退 legacy |
| iOS App Store 构建 | 编译期合规策略收紧远程代码/模块能力（见 2.5.4） |

---

## 3. 身份平台现状（`tauri-app/identity-platform`）

### 3.1 部署形态

| 项 | 事实 | 依据 |
|---|---|---|
| Core 技术栈 | Node 22 + TypeScript + Koa 2.16.4 + `oidc-provider` 9.11.3 + `pg` | `core/package.json:5,20-26` |
| Core 部署 | Vercel Project A `mini-hbut-identity-core`；**单 serverless 函数**（`core/vercel.json`：`src/server.ts → @vercel/node`，全路径路由），region `hkg1` | `core/vercel.json` |
| Web 技术栈 | Next.js 16.4.1 + React 19 + `openid-client` 6.8.5 + `qrcode` | `web/package.json:15-21` |
| Web 部署 | Vercel Project B `mini-hbut-identity-web`；`framework: nextjs`，region `hkg1` | `web/vercel.json` |
| 数据库 | PostgreSQL（Neon）；仅 Core 有写权限 | `docs/README.md` |
| 部署方式 | Vercel CLI 手动部署（`scripts/deploy.mjs`）；生产必须 TTY + 输入确认词 `deploy-prod` | `scripts/deploy.mjs:1-30`、`docs/runbook.md:64-81` |
| 本地端口 | Core `localhost:3001`；Web `localhost:3000`；但 Core 内 auth.* dev 默认值是 `http://localhost:3002`（与 runbook 不一致） | `core/src/server.ts:18-23`、`core/src/app.ts:104-112` |
| 域名 | `id.湖北工业大学.com`（issuer）、`auth.湖北工业大学.com`、`developer.湖北工业大学.com`；协议层只用 Punycode | `docs/README.md:21-32` |
| Host 路由 | `web/proxy.ts`（Next 16 proxy，替代 middleware）：auth → `/auth-site/*`、developer → `/developer-site/*`、Preview host 白名单 → `/preview-site/*`，其余一律 404（fail closed） | `web/proxy.ts:1-65`、`web/lib/host-router.ts:51-81` |
| 环境分层 | development / preview / production；Preview 必须独立 DB / issuer / signing key，禁止与 Production 有交集 | `docs/README.md:34-40`、`docs/runbook.md:286-299` |

### 3.2 Core 的四套鉴权机制

| 机制 | 请求头 | 适用范围 | 实现 |
|---|---|---|---|
| BFF → Core 服务令牌 | `x-identity-service-token`（常量时间比对） | `/api/v1/requests/`、`/api/v1/admin/`、`/api/v1/developer/` | `core/src/security/service-token.ts:28-83`；production/preview 未配置 → 503 |
| App 接力凭据 | `Authorization: Handoff <secret>`（HMAC 比对 `handoff_secret_hash`） | App 面 enroll / approve / snapshot | `core/src/api/app/auth.ts:28-90` |
| App 设备签名 | `Authorization: Device <device_id> <issued_at> <nonce> <signature>`（Ed25519） | 设备自查询 / revoke / 授权历史 / 换票 | `core/src/api/app/auth.ts:113-167` |
| 账户 API Key | `Authorization: Bearer mhbat_<8hex>_<43base64url>`（总长 58） | `/api/v1/account/**` | `core/src/api/account/auth.ts:36-71`、`core/src/security/api-key.ts` |

- `x-identity-handoff`、`x-developer-subject`、`x-admin-subject`、`x-admin-auth-time` 只是**身份头**，不能单独作为认证。
- Core **没有 CORS 中间件**；OIDC 侧沿用 oidc-provider 默认的 `clientBasedCORS`。

### 3.3 OIDC 能力（`core/src/oidc/provider.ts`）

| 项 | 事实 |
|---|---|
| 端点 | `/oauth/authorize`、`/oauth/token`、`/oauth/userinfo`、`/oauth/jwks`、`/oauth/revoke`、`/oauth/logout`；Discovery `/.well-known/openid-configuration`、`/.well-known/jwks.json` |
| 流程 | 仅 `response_type=code`（无 implicit / hybrid）；`grant_types: authorization_code + refresh_token` |
| PKCE | `pkce.enabled=true`、`required=true`；文档声明仅 S256（配置层未显式写 `code_challenge_methods_supported`） |
| Refresh | `rotateRefreshToken: true`（无条件轮换 + replay 检测） |
| Subject | 仅 `pairwise`；sub = `HMAC(PAIRWISE_KEY, sector + client_id + \0 + user_id)`，不等于学号 |
| 交互策略 | 自定义 interaction 取代默认页面；**每次授权都必须由 App 显式批准，无静默同意**；`prompt=none` 只会返回 `interaction_required` |
| scope 白名单（8 项） | `openid`、`profile`、`student.identity`、`offline_access`、`student.grades.read`、`student.timetable.read`、`game.read`、`game.play` |
| claims 映射 | `openid → sub/amr/auth_time`；`profile → name/preferred_username`；`student.identity → hbut_student_id/hbut_student_name/hbut_verification_method/hbut_verified_at`（仅 UserInfo）；`student.grades.read → hbut_grades`（仅 UserInfo）；`student.timetable.read → hbut_timetable`（仅 UserInfo） |
| TTL | AuthorizationCode 60s；AccessToken 3600s；IdToken 3600s；RefreshToken 30d；Grant 30d；Interaction = AuthRequest TTL（默认 120s） |
| ACCESS TOKEN 两级格式 | 默认 **opaque**；仅"请求了游戏 resource indicator 且 client 在第一方白名单"才签发 **JWT（`typ=at+jwt`，带 `aud`）** |
| 客户端类型（3 种） | `web_confidential`（secret，https 回调）、`native_public`（none，custom scheme / loopback）、`browser_public`（none，https 回调） |
| 签名 | RS256 + RSA-2048；私钥仅 Core（`IDENTITY_JWKS_JSON`） |
| 明确关闭 | `devInteractions`、PAR、`clientCredentials`、`deviceFlow`、`ciba`、`introspection`、DCR、`requestObjects`、`encryption`、`claimsParameter`、`jwtResponseModes`、`dPoP` |

### 3.4 REST API 清单

#### 3.4.1 Requests API（`/api/v1/requests/**`）

鉴权：**服务令牌 + handoff 双重**。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/requests/:id` | 详情 DTO（client/scopes/risk/expires_at）；首次读取把 `CREATED → WAITING_APP` |
| GET | `/api/v1/requests/:id/status` | 最小状态轮询 |
| POST | `/api/v1/requests/:id/resume` | 幂等 resume；错误码 401/404/410/422/409/400 |

状态映射：`CREATED/WAITING_APP → waiting_app`；`APP_OPENED → app_opened`；`APPROVED/INTERACTION_FINISHED/CODE_ISSUED/CONSUMED → approved`；`DENIED/CANCELLED/FAILED → denied`；`EXPIRED → expired`。

#### 3.4.2 App API（`/api/v1/app/**`）

鉴权：Handoff 或 Device 签名（**不走**服务令牌）。

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| POST | `/api/v1/app/devices/enrollment-challenges` | 一次性注册 challenge（默认 TTL 300s，必须绑定活跃 AuthRequest） | Handoff |
| POST | `/api/v1/app/devices/enroll` | 首台设备注册；同学号已存在 → 409 `LINK_REQUIRED`（禁止自动接管） | Handoff + `MINI-HBUT-ENROLL-V1` 签名 |
| GET | `/api/v1/app/devices/me` | 本机设备状态 | Device |
| POST | `/api/v1/app/devices/:id/revoke` | 本机自撤销（V1 仅本机） | Device |
| GET | `/api/v1/app/devices/me/auth-history` | 本机授权记录 | Device |
| POST | `/api/v1/app/auth-requests/:id/approve` | 批准授权（12 步校验，身份由 device → user 推导） | Handoff + `MINI-HBUT-AUTH-V1` |
| POST | `/api/v1/app/data-snapshots` | 成绩/课表快照上传（AES-256-GCM，7 天 TTL，per user+client upsert） | Device + body 内 handoff |
| POST | `/api/v1/app/device-token/challenge` | 设备换票 challenge（默认 TTL 120s） | Device |
| POST | `/api/v1/app/device-token/exchange` | 换 resource-scoped JWT AT（默认 900s，**无 refresh token**） | Device + `MINI-HBUT-DEVICE-TOKEN-V1` |

**不存在** `deny` / `cancel` 路由：领域层有 `denyAuthRequest` / `cancelAuthRequest`，但未注册 HTTP 端点；App 侧按 best-effort 处理 404/405，服务端靠 TTL 自然过期。

#### 3.4.3 Developer API（`/api/v1/developer/**`）

鉴权：服务令牌 + `x-developer-subject`（BFF 会话推导的 pairwise sub）；subject → user_id → developers（首次自动建档 `dev_<uuidv7>`）。

| 端点 | 用途 |
|---|---|
| `GET/POST /me` | 开发者资料（POST 幂等建档） |
| `GET/POST /apps` | 应用列表 / 创建（落 draft；`web_confidential` 的 secret 明文只返回一次） |
| `GET/PATCH/DELETE /apps/:id` | 详情 / 编辑（draft·rejected 可编辑；#692 起 approved/active 元数据也可改）/ 删除（仅 draft） |
| `POST /apps/:id/redirect-uris`、`DELETE .../:rid` | 回调地址管理 |
| `PUT/GET /apps/:id/scopes` | 申请 scope（敏感 scope 需用途说明） |
| `POST /apps/:id/submit` | 提交审核（创建 review 快照，revision 内容寻址） |
| `POST /apps/:id/credentials/rotate` | 轮换 client_secret（show-once） |
| `POST /apps/:id/revoke` | 吊销 |
| `GET /apps/:id/audit` | 单应用审计 |
| `GET/POST /developer/keys`、`DELETE /developer/keys/:id` | 账户级 API Key 签发/列表/吊销 |

#### 3.4.4 Admin API（`/api/v1/admin/**`）

鉴权：服务令牌 + `x-admin-subject`；RBAC 每次请求实时查 `user_roles`。

| 端点 | 最低角色 | step-up |
|---|---|---|
| `GET /admin/me`、`/overview`、`/apps`（filter status/clientType/sensitive）、`/apps/:id`、`/apps/:id/reviews` | reviewer 或 admin | 否 |
| `POST /admin/apps/:id/reviews/:reviewId/approve` | `identity_reviewer` | 敏感 scope 要求 `x-admin-auth-time` 在窗口内（默认 600s） |
| `POST /admin/apps/:id/reviews/:reviewId/reject` | `identity_reviewer` | 否 |
| `POST /admin/apps/:id/suspend·unsuspend·revoke` | `identity_admin` | 否 |
| `GET /admin/audit` | `identity_admin` | 否 |

#### 3.4.5 Account API（`/api/v1/account/**`）

鉴权：`Authorization: Bearer <API Key>`（Key 形态 `mhbat_<8hex>_<43base64url>`，库存 `HMAC-SHA256(pepper, 整串)`）。

- `GET /me`、`GET/POST /apps`、`GET/PATCH/DELETE /apps/:id`、redirect-uris、scopes、submit、credentials/rotate、revoke、`apps/:id/audit`
- `GET /devices`、`GET /audit`
- 管理面：`/api/v1/developer/keys`（service-token + developer subject）。

#### 3.4.6 运维端点

`GET /healthz`（不依赖 DB）、`GET /readyz`（`SELECT 1`，3s 超时；失败 503）。

### 3.5 数据模型（`core/migrations/*.sql`）

执行：`src/db/migrate.ts`，事务化/幂等/记账于 `schema_migrations`；**禁止冷启动自动迁移**。

**18 张业务表 + 1 张记账表**：

| 表 | 关键内容 |
|---|---|
| `users` | UUIDv7 主键、status、last_active_at |
| `linked_identities` | `provider='hbut'`、`subject=学号`、姓名快照、`verification_method`、`verification_level`、`UNIQUE(provider,subject)` |
| `devices` | Ed25519 公钥 JWK（禁 `d`）、fingerprint、platform、status、last_seen_at |
| `device_enrollment_challenges` | challenge sha256、purpose、expires_at、consumed_at |
| `developers` | user_id、display_name、contact_email、status |
| `oauth_applications` | client_id、owner_developer_id、name/homepage、client_type、status、auth method、secret 密文、subject_type、sector_identifier |
| `oauth_redirect_uris` | redirect_uri、kind（web_https/native_custom/native_loopback）、UNIQUE |
| `oauth_application_scopes` | scope（CHECK 白名单）、status（requested/approved/rejected）、review_note |
| `oauth_consents` | user_id、application_id、granted_scopes、revoked_at |
| `auth_requests` | `ar_` 前缀 id、interaction_uid、requested_scopes 快照、scope_hash、server_challenge、handoff hash、11 态状态、approved_user/device、approval_nonce |
| `audit_events` | event_type、actor_type/id、target、result、metadata（强制脱敏） |
| `oidc_provider_records` | model_name、record_id、payload_jsonb、expires_at、consumed_at、grant_id |
| `user_roles` | identity_admin / identity_reviewer（软删除） |
| `application_reviews` | revision（内容寻址 sha256）、metadata/redirect/scopes 快照、status、reviewer、scope_decisions |
| `rate_limit_buckets` | bucket_key、window_start、count |
| `api_keys` | prefix、secret_hash、scopes、status、expires_at、last_used_at |
| `data_snapshots` | user_id、client_id、scope_set、payload_enc、expires_at、UNIQUE(user,client) |
| `device_token_challenges` | challenge_hash、device_id、expires_at、consumed_at |

### 3.6 授权流程（网页 → App → 回调）

```text
第三方应用 → GET /oauth/authorize（Core）
  → provider 建 Interaction
  → 创建 AuthRequest，302 到 https://auth.<domain>/r/<request_id>#h=<handoffSecret>
  → 页面（handoff-client）从 location.hash 读 handoff 到内存
  → 展示：应用名/开发者/审核状态/scope 风险/倒计时/打开 App/二维码
  → 短轮询 BFF：可见 1s / 隐藏 5s / 退避上限 30s
  → 用户点「打开 Mini-HBUT」或扫码 → minihbut://identity?request_id=&handoff=
  → App 内确认 → Rust 用 Ed25519 签名 approve
      · Core：handoff HMAC + 设备签名 + 状态机 + scope 快照 + 时钟偏差 + 原子状态迁移
  → 页面轮询到 APPROVED → POST /api/auth/requests/:id/resume（BFF → Core）
  → Core resume：创建 Grant → 写 interaction.result → 返回 interaction.returnTo
  → 浏览器跟随 → provider 发 authorization code → 302 redirect_uri?code=...&state=...
  → 第三方后端换 token
```

关键约束：

- handoff 只存在于 URL fragment 与内存，服务端只存 HMAC 摘要；
- 网页**没有任何允许/拒绝按钮**，批准面只在 App 内；
- 授权请求 TTL 默认 120s；
- 设备签名 canonical（`MINI-HBUT-AUTH-V1`）绑定 `request_id / challenge / client_id / scope_hash / device_id / decision / issued_at / nonce`；
- App 提交的 `student_id` 等身份字段会被直接 400，身份由 device → user 推导；
- `APP_OPENED` 状态只有领域函数、没有 HTTP 触发点（Web/App 仍渲染该状态）。

### 3.7 Web 站点

#### 3.7.1 auth-site（授权接力）

- `/r/[requestId]`：接力页主入口；`/`：骨架说明；`/help`：无法打开 App 的帮助（明确不要求输入学校密码）；`/callback`：**仅测试用**。
- 二维码：payload `minihbut://identity?request_id=&handoff=&source=qr`，浏览器本地 `qrcode` 渲染，不经服务器；另给 https fallback 链接。
- 安全头：`frame-ancestors 'none'`、`X-Frame-Options: DENY`、`no-store`、`no-referrer`。

#### 3.7.2 developer-site（开发者门户 + 管理台）

| 路径 | 功能 |
|---|---|
| `/` | 门户首页（OIDC 能力、scope 目录、非官方声明） |
| `/apps`、`/apps/new`、`/apps/[id]` | 应用列表 / 创建 / 详情（overview、redirect-uris、scopes、credentials、review、audit、danger） |
| `/keys` | 账户级 API Key |
| `/docs`、`/docs/[...slug]` | 302 到官方文档站 |
| `/login`、`/callback`、`/logout` | 门户自举 OIDC 登录（dogfood，scope `openid profile`） |
| `/admin`、`/admin/apps`、`/admin/apps/[id]`、`/admin/audit` | 审核概览 / 队列 / 详情 / 审计 |
| `/api/v1/developer/**`、`/api/v1/admin/**` | BFF route handler → Core |

BFF 要点：

- 会话：HttpOnly `mh_dev_session`（AES-256-GCM，`WEB_SESSION_SECRET` 派生，TTL 默认 86400s）；
- CSRF：双提交 `mh_dev_csrf` + Origin 白名单；
- Turnstile：创建应用 / 提交审核 / 签发 API Key 三处写动作（未配置 `TURNSTILE_SECRET_KEY` 时跳过）。

#### 3.7.3 preview-site

- 单一 host 无法按 auth/developer 分流，因此是"选择页"：说明 Preview 落地页、列出 `/auth-site`、`/developer-site`、展示 public issuer，并提示 Preview 与 Production 必须独立 env/DB/issuer。

### 3.8 App（Tauri 客户端）对接面（现状）

**Rust 直连 Core 的端点**（`src-tauri/src/identity/client.rs`）：

| 端点 | 用途 |
|---|---|
| `POST /api/v1/app/devices/enroll` | 设备注册（Handoff） |
| `POST /api/v1/app/devices/{id}/revoke` | 本机撤销（Device） |
| `GET /api/v1/app/devices/me/auth-history` | 授权历史（Device） |
| `POST /api/v1/app/device-token/challenge` | 换票 challenge（Device） |
| `POST /api/v1/app/device-token/exchange` | 换票（Device + challenge） |

**前端经 Web BFF 的端点**（`src/features/identity/identityService.ts`）：

| 端点 | 用途 |
|---|---|
| `GET /api/v1/requests/:id` | 请求详情（Core 的 requests 受服务令牌保护，因此走 BFF） |
| `POST /api/v1/app/devices/enrollment-challenges` | 注册 challenge |
| `POST /api/v1/app/auth-requests/:id/approve` | 批准（签名在 Rust） |
| `POST /api/v1/app/auth-requests/:id/deny·cancel` | best-effort；Core 无该路由 |

**协议要点**：

- 深链 scheme `minihbut`（`tauri.conf.json`）；形如 `minihbut://identity?request_id=&handoff=[&source=qr]`，不含学生身份/token。
- 四种 canonical（字段顺序固定、UTF-8、`\n` 结尾；Rust/Node 共享 golden fixture）：
  - `MINI-HBUT-AUTH-V1`：approve；
  - `MINI-HBUT-ENROLL-V1`：注册；
  - `MINI-HBUT-DEVICE-API-V1`：设备 API（method/path 由服务端从请求取值）；
  - `MINI-HBUT-DEVICE-TOKEN-V1`：换票（绑定服务端刚签发的 challenge）。
- 时钟偏差默认 ±60s；enrollment challenge TTL 300s；换票 challenge TTL 120s。
- 设备私钥：keyring `service=mini-hbut-identity / account=device-ed25519-v1`；不可用即 fail closed。
- 数据快照：`POST /api/v1/app/data-snapshots`，body `{handoff, scopes[], payload{grades?, timetable?, fetched_at}}`；scope 必须 ⊆ 本次批准范围；device.user_id × request.client_id 双因子。
- 换票响应：`access_token / expires_in / scope / audience`；**无 refresh_token**；AT 与 `/oauth/token` 同构（provider AccessToken 模型签发）。

### 3.9 第三方接入模式与硬限制（现状）

**唯一支持的接入方式**：标准 OIDC Authorization Code + PKCE（S256）。issuer/JWKS 可被任意成熟 SDK 消费。

**接入前置（无自助注册）**：

1. 开发者用 Mini-HBUT 登录 developer 门户 → 创建应用（draft）→ 填 name/description/homepage/privacy/contact/client_type/redirect_uris/scopes → 提交审核（pending_review，生成 review 快照）。
2. 管理员在 `/admin` 人工 approve（可逐 scope 决策）；`active` 后才被 provider 加载；`suspend/revoke` 在 Provider 层立即失效。
3. **无 DCR**（`registration` feature 关闭）。

**硬限制**：

| # | 限制 |
|---|---|
| 1 | **每次授权都必须由 Mini-HBUT App 显式批准**；浏览器无"同意"按钮、无静默同意；`prompt=none` 只会得到 `interaction_required` |
| 2 | 因此第三方用户**必须装有 Mini-HBUT App 且已完成设备 enrollment**，否则无法完成授权（enrollment 本身又需要一个活跃 AuthRequest 的 handoff） |
| 3 | 敏感 scope（`student.identity`、`offline_access`、`game.read`、`game.play`）需开发者用途说明 + 管理员审核（+ step-up） |
| 4 | 第三方只能拿 pairwise `sub`，拿不到学号/官方实名；`student.identity` claims 只在 UserInfo |
| 5 | 游戏 JWT AT 只给白名单第一方 client；第三方永远 `invalid_target` |
| 6 | 不支持 implicit / hybrid / client_credentials / device flow(RFC 8628) / CIBA / introspection / PAR / JAR / 加密 ID Token / JARM / claims 参数 / DPoP |
| 7 | **无内嵌（iframe）模式**：CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY`，auth/developer 站均不可被嵌入 |
| 8 | 无 `deny` / `cancel` HTTP 端点；用户拒绝只能靠不批准 + TTL 过期 |
| 9 | 设备撤销 V1 只支持本机自撤销，跨设备撤销未实现 |
| 10 | 设备换票 V1 不签发 refresh token，AT 到期需重新设备签名换取 |

### 3.10 安全与运维要点

- **限流**：Postgres 原子计数（无外部依赖），16 个分组（`token` 60/min、`authorize` 120/min、`requestStatus` 600/min、`enroll` 20/5min、`approve` 60/min、`deviceTokenExchange` 60/min、`developerWrite` 60/min、`admin` 120/min 等）；production/preview 默认启用。
- **审计**：统一 `writeAuditEvent`，metadata 强制脱敏；查询面为 admin / account / developer 三处。
- **日志脱敏**：`redactSensitiveText` 覆盖 Authorization/Cookie/handoff/service-token/client_secret/token/JWK/学号等。
- **CSP / 安全头**：`default-src 'self'`、`frame-ancestors 'none'`、`object-src 'none'`；`script-src` 因 Next RSC 保留 `'unsafe-inline'`；Trusted Types 由 `IDENTITY_CSP_TRUSTED_TYPES=1` 显式开启。
- **Kill Switch（文档声称 5 种）**：其中 2 种**代码未实现**——`IDENTITY_ALLOW_NEW_AUTHORIZE`（只在 runbook 出现）、migration 版本启动门槛（`/readyz` 只做 `SELECT 1`）。另外 3 种（限流收紧、服务令牌轮换、Preview/Prod 隔离）可用。
- **`IDENTITY_WEB_ORIGINS`**：只在 `config/env.ts` 与文档登记，**代码无任何消费点**。
- **测试基线（文档口径）**：`pnpm check` = core/web 各自 typecheck + test + build；文档称 L1 单测 205（core）/283（web）；Playwright 4 个 spec（auth-site / developer / admin / qr-cross-device）。

### 3.11 已知残余风险（平台自述）

1. **首次学校身份 enrollment 无法强验证**：`verification_method = mini_hbut_app`，修改版客户端理论上可伪造首次学号声明；平台已在 claim/UI/审核界面标注，并把官方 OIDC 升级路径预留为 `hbut_oidc`。
2. **Deep Link 抢占**：`minihbut://` 可能被其他本地程序注册；缓解依赖双因子（handoff + 设备签名）+ 短 TTL + 用户确认。
3. **客户端可被反编译/修改**：服务端只信任设备公钥签名与注册状态。
4. **Vercel 面板被入侵**：列为中等风险。
5. **Vercel 部署形态**：运维依赖手动 CLI；preview/production 隔离靠环境变量纪律。
6. **多实例观测缺口**：`CONSUMED` 状态推进依赖进程内 session→interaction 映射，Serverless 多实例下可能缺失（观测性质，非安全边界）。

---

## 4. OCR 后端现状（`ocr-service`）

### 4.1 部署形态

| 项 | 事实 | 依据 |
|---|---|---|
| 运行位置 | 社团 NAS，Docker 容器 `fdl-ocr-service`，双网：`fdl-apps`（Traefik 路由）+ `fdl-backend`（Internal，连 PostgreSQL） | `AGENTS.md:40-44` |
| 公网链路 | 客户端 → 阿里云 Caddy:443 → `frps` vhost（127.0.0.1:18080）→ `frpc`（NAS）→ Traefik → 容器 | `AGENTS.md:25-51`、`scripts/deploy/nas-deploy-runbook.md:6-8` |
| 公网域名 | `https://mini.hbut.site` | 部署 runbook |
| 兜底域名 | [mini-hbut-ocr-service.hf.space](https://mini-hbut-ocr-service.hf.space)（对应 HF Space [mini-hbut/ocr-service](https://huggingface.co/spaces/mini-hbut/ocr-service)）：**已从 HF 剥离，仅备用**；其数据在 MySQL/Turso，与 NAS 不是同一个库 | `AGENTS.md:50` |
| 进程模型 | 单 uvicorn 进程，`runtime/entrypoint.py` 约 5844 行；无 `APIRouter` / `include_router` / `StaticFiles` / `app.mount` | `Dockerfile:54`、`app.py:4-12` |
| 容器端口 | `EXPOSE 7860`、`ENV PORT=7860`、`CMD uvicorn ... --port 7860` | `Dockerfile:44,50,54` |
| 基础镜像 | `ARG BASE_IMAGE="python:3.10-slim"`（可覆盖） | `Dockerfile:5-6` |
| 资源约束 | `mem_limit: 640m`；NAS 总内存 3.8GB，现状占用约 101MiB | `docs/admin-panel-design.md:29`、`admin-panel-plan.md:77` |
| 权威数据库 | NAS 上的 **PostgreSQL 17**，库 `minihbut`，角色 `minihbut_user`（非超级用户、`CONNECTION LIMIT 20`、`idle_in_transaction_session_timeout=60s`） | `AGENTS.md:88-89` |
| 迁移规模 | 47 张表 / 约 25.8 万行已迁入 NAS PG；OCR 单请求 261ms，吞吐约 5 次/秒（3 核配额） | `AGENTS.md:184-185` |
| 时区 | 进程强制定为 `SERVICE_TIMEZONE`（默认 `Asia/Shanghai`） | `entrypoint.py:78-91` |
| 依赖 | `requirements.txt`：FastAPI、uvicorn、`ddddocr==1.0.6`、PyJWT、libsql-client、aiomysql、psycopg[binary]、psycopg_pool 等 | `requirements.txt:1-15` |
| 健康检查 | `GET /health`（约 30 个顶层键，**只加不改**契约，`tests/test_health_build_sha.py` 冻结键名） | `entrypoint.py:4171,4262-4367` |
| 构建溯源 | 镜像 tag `fdl-ocr-service:<YYYY-MM-DD>-<短sha>`；`APP_BUILD_SHA` / `BUILD_TIME` 由 build-arg 注入并在 `/health` 回显 | `Dockerfile:14-20,46-48` |
| 监控 | dozzle / uptime-kuma / beszel | `docs/admin-panel-plan.md` |

### 4.2 应用组装

`runtime/entrypoint.py` 采用**纯命令式装配**（无 `APIRouter` / `include_router` / `app.mount`）：

```python
app = FastAPI(title="Mini-HBUT OCR Service", version="1.4.1")   # :133
app.add_middleware(CORSMiddleware, ...)                         # :156-162
register_forum_routes(app)                                      # :164-165，约 39 条 /api/forum/*
register_game_platform_routes(app)                              # :168，/api/game-platform/v1/*
register_gomoku_match_routes(app)                               # :4398-4401，五子棋竞技
@app.on_event("startup")  ...                                   # :3607-3692
@app.on_event("shutdown") ...                                   # :3694-3780
```

- **CORS**：唯一中间件，`allow_origins=["*"]` + `allow_credentials=True` + `allow_methods/headers=["*"]`（`entrypoint.py:156-162`）。`FORUM_CORS_ORIGINS` 只在 `forum_backend` 独立 `create_app()` 时生效，生产走 `register_forum_routes` 分支时**沿用主 app 的 `*`**（`docs/identity_auth_rollout.md:133-139`）。
- **注册顺序硬约束**：所有具体路径必须早于游戏平台兜底路由 `/api/game-platform/{rest:path}` 注册，否则会被 404 `FEATURE_DISABLED` 吞掉；gomoku/drift 注册器用"临时摘除兜底 → 注册 → 复原"保证顺序（`modules/game_platform/gomoku_routes.py:637-656`、`drift_routes.py:387-415`）。
- **启动任务（7 个）**：临时文件清理、每日状态邮件、OCR 维护/自检、服务健康快照落库、服务全量归档、给分重建、论坛备份（`entrypoint.py:3375/3326/3404/3440/3539/3581`、`forum_backend/main.py:325-338`）。
- **关闭顺序**：取消任务 → 关闭 OCR 线程池 → 清限流桶 → 强制落盘 metrics → 关闭 MySQL/PG 连接池 → 最后一次指标增量同步（`entrypoint.py:3694-3780`）。
- **懒初始化**：论坛 `ensure_ready()` 用 `asyncio.Lock` 双检；建表失败返回 `503 论坛服务暂不可用`，不拖垮 OCR（`forum_backend/main.py:266-298`）。

### 4.3 API 清单（按域）

#### 4.3.1 基础

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/health` | 健康检查（含版本/运行时长/依赖状态） |
| GET | `/` | 服务信息页 |

#### 4.3.2 OCR

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/ocr/recognize` | 验证码识别（base64） |
| POST | `/api/ocr/base64` | 同上（别名） |
| POST | `/api/ocr/recognize_url` | 拉取 URL 图片后识别 |

限流/并发：单 IP 每分钟上限、并发上限、排队上限、推理超时（`OCR_*` 环境变量）。

#### 4.3.3 临时文件

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/temp/upload` | 课表 ICS 等临时文件上传（TTL ≤ 24h，池上限 200） |
| GET | `/api/temp/files/{file_id}/{filename}` | 临时文件下载 |

#### 4.3.4 云同步

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/cloud-sync/ping` | 获取一次性 challenge | `secret_ref` |
| POST | `/api/cloud-sync/upload` | 上传同步数据 | challenge + 可选 Identity token（scope `cloud_sync.write`） |
| GET | `/api/cloud-sync/download` | 下载同步数据 | challenge + 可选 Identity token（scope `cloud_sync.read`） |

存储：Turso（libsql）为主，旧 Proxy 兜底；同一 `secret_ref` 可双写。

#### 4.3.5 论坛

`forum_backend/main.py` 注册约 39 条 `/api/forum/*`，按鉴权语义分四类：

| 类别 | 代表端点 | 鉴权 |
|---|---|---|
| 公开读 | `GET /api/forum/categories`、`/threads`、`/threads/hot`、`/threads/{id}`、`/search`、`/users/{student_id}`、`GET /forum/admin`（HTML 页）、附件下载、备份列表 | **无鉴权** |
| 登录读 | `/api/forum/me/*`、`/polls`、`/notifications`、`/messages`、`/badges` | `current_claims`（DualTrack：JWT 或 legacy） |
| 写操作 | 发帖、回复、顶踩、收藏、投票、关注、举报、私信、签到、附件上传 | `active_claims`（追加：未封禁 + `forum.write` scope） |
| 管理 | 建版块、建/关投票、发徽章、封禁、举报队列、用户检索、手动备份 | `admin_claims`（追加 `is_admin`） |

- **认证入口**：`POST /api/forum/auth/token` **无鉴权**，任何人可凭 `student_id` 换 legacy HMAC token（TTL 3600s）；`is_admin` 由 token 自带 claim 决定（`FORUM_ADMIN_STUDENT_IDS` 计算，`FORUM_REQUIRE_ADMIN_SECRET` 可选）。该端点当前**没有任何 feature flag 门禁**。
- **身份自动建档**：Identity 用户首次访问时自动创建 profile（`main.py:357-366`）。
- **存储**：`FORUM_DB_BACKEND = sqlite | sqlpub | postgres`；17 张 `forum_*` 表。生产实际后端以 NAS env 为准（仓库无法确认）。
- **快照格式随后端变化**：SQLite 导出 `forum.sqlite3.zip`；SQLPub/PG 导出 `json-per-table-v1` zip。
- **附件**：MIME 白名单 + 10MB 上限 + sha256 去重；本地缺失时从 HF 私有 Dataset 拉回。
- **备份**：`data/backups/*.zip` → HF 私有 Dataset → rclone 复制到 OneDrive；`FORUM_BACKUP_INTERVAL_SECONDS` 默认 0（关闭）。

#### 4.3.6 使用统计

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/usage-stats/ping` | 发 challenge | 无 |
| POST | `/api/usage-stats/heartbeat` | 单事件心跳 | `x-usage-stats-challenge` |
| POST | `/api/usage-stats/upload` | 批量事件 + 设备画像（批次上限 `USAGE_STATS_BATCH_LIMIT`） | challenge |
| GET | `/api/usage-stats/personal` | 个人 7/30 日用量（仅 Turso/PG 后端） | challenge |

#### 4.3.7 游戏平台（V2，`/api/game-platform/v1`）

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/meta` | 协议版本 / 能力位 / 限额 | 无 |
| POST | `/tickets` | 签发 Launch Ticket | Identity AT + scope `game.play` |
| POST | `/sessions` | ticket 换 Game Session（`gs_`） | ticket（body） |
| GET | `/me/profile` | 本人档案 | Identity AT 或 `gs_` |
| POST | `/runs`、`/runs/{id}/start`、`/runs/{id}/finish`、`GET /runs/{id}` | 对局生命周期（finish 幂等） | `gs_` |
| GET | `/me/wallet`、`/me/wallet/ledger` | 钱包与账本 | Identity AT 或 `gs_` |
| GET | `/leaderboards` | 全局 XP 榜（可带本人排名） | 可选认证（验签失败即 401） |
| GET | `/me/daily-tasks` | 每日任务（惰性发奖） | Identity AT |
| POST | `/drift-bottles`、`GET /random`、`POST /{id}/claim·report·hide` | 漂流瓶 | Identity AT |
| POST | `/matches/{id}/seat·result`、`GET /matches/{id}`、`GET /me/gomoku/stats` | 五子棋竞技 | `gs_` |
| 任意 | `/{rest:path}` | 兜底：未实现路径 404 `FEATURE_DISABLED` | — |

- 协议版本：`PROTOCOL_VERSION_MIN=1 / MAX=1`、`SERVER_VERSION="2026.09.1"`。
- 信任链：设备签名 → Identity JWT AT → Launch Ticket → Game Session(`gs_`) → run → settlement → Legacy 双写。
- 总开关 `GAME_PLATFORM_V2_ENABLED`；`GAME_PLATFORM_TICKET_HASH_KEY` / `GAME_PLATFORM_SESSION_HASH_KEY` 缺失则 fail-closed 拒绝启动。

#### 4.3.8 经典排行榜 / 给分记录 / 五子棋中继

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| GET | `/api/game-rank/ping` | PG 健康 | 无 |
| POST | `/api/game-rank/submit` | 提交分数（legacy 写入隔离判定） | 无（body 自报学号 + 版本门禁） |
| GET | `/api/game-rank/leaderboard` | 榜单 | 无 |
| GET | `/api/grade-distribution/health` | 给分记录健康 | 无 |
| GET | `/api/grade-distribution/semesters` | 学期列表 | 无 |
| POST | `/api/grade-distribution/query` | 给分记录查询（`page_size` ≤ 100） | 无 |
| POST | `/api/gomoku-relay/{join,send,poll,leave}` | 五子棋 P2P 中继 | `relay_binding` + `peer_secret` + 令牌桶 |

#### 4.3.9 管理

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| POST | `/api/admin/service-archive/export` | 服务归档导出 | 静态共享密钥 `X-Archive-Admin-Secret`（未配置则 503，`secrets.compare_digest`） |

### 4.4 认证与信任边界（现状）

| # | 凭据 | 生成 / 校验 | 实际信任强度 | 代码 |
|---|---|---|---|---|
| 1 | Identity access token（JWT） | RS256 + JWKS；iss/aud/exp/nbf/iat/scope/`hbut_student_id` | 唯一"强"凭据：actor 取自 `hbut_student_id`；body/query 自报学号不一致 → 403；JWT 形状验签失败**永不降级** | `identity_auth/validator.py`、`dependencies.py` |
| 2 | Forum legacy HMAC token | `hmac-sha256(secret, b64(json))`，TTL 3600s | 弱：只校验签名/过期/非空学号；**签发端点无鉴权**；`is_admin` 由 token 自带 claim | `forum_backend/auth.py:44-95`、`main.py:464-476` |
| 3 | Cloud Sync `secret_ref` + challenge | 服务端持有上游 token；challenge 一次性 90s、绑定 IP | 中：challenge 是防重放层，不是身份层；无 Bearer 时学号仅格式校验（`^\d{10}$`） | `entrypoint.py:1297-1331,986-1033` |
| 4 | Usage stats challenge | 与 cloud sync 共用 challenge map，独立头 | 同 #3（无身份） | `entrypoint.py:1335-1352` |
| 5 | Archive admin secret | 静态环境变量 + `compare_digest` | 共享密钥（无账号、无审计、无过期） | `entrypoint.py:4071-4078` |
| 6 | Gomoku relay binding / `peer_secret` | 纯内存；`relay_binding` 由 HMAC 派生 | 弱（无账号体系）：join 无认证，靠令牌桶限流 + 绑定凭证 | `entrypoint.py:4404-4452` |
| 7 | Game Session `gs_` | 由 ticket 确定性派生（HMAC-SHA256），明文不落库 | 中：只证明"持有 ticket 派生物"，不含学号 | `modules/game_platform/routes_auth.py` |
| 8 | Launch Ticket | 256bit CSPRNG，HMAC 摘要入库 | 一次性、绑定 player；签发需 Identity AT + `game.play` | `modules/game_platform/tickets.py`、`routes.py` |
| 9 | 临时文件 `file_id` | `uuid4().hex` + 文件名精确匹配 | 无鉴权，知道 URL 即可下载（课表文件名含学号） | `entrypoint.py:4688-4706` |
| 10 | 论坛附件 ID | `att_<student_id>_<hex>` + sha256 ETag | 无鉴权下载 | `forum_backend/main.py:728-762` |

**管理员判定（三条互不相同的路径）**：

| 通道 | 判定源 | 代码 |
|---|---|---|
| legacy token | token 内 `is_admin` claim（签发时按 `FORUM_ADMIN_STUDENT_IDS` 计算） | `forum_backend/auth.py:48-55` |
| Identity token | **只看** `FORUM_ADMIN_STUDENT_IDS` 环境变量集合 | `identity_auth/dependencies.py:144-153` |
| profile 表 `forum_profiles.is_admin` | **写入了但授权时不读取**；`me/summary` 反而用 token claim 覆盖它 | `forum_backend/main.py:610-612` |

> 这与 `docs/identity_auth_rollout.md:126`、`README.md:75` 声称的"环境变量 + profile 表组合判定"**不一致**：实际组合只有环境变量。

**Identity 校验的配置陷阱（事实）**：

- `MINI_HBUT_IDENTITY_AUDIENCE` 默认值非空（`mini-hbut-hf-api`），因此 `verify_aud` **默认开启**；而 `docs/identity_auth_rollout.md:33-35` 说明 Core 未支持 resource indicator 前 `aud` 并非该值，此时"配置了 audience 会 100% 拒绝"。两者构成事实冲突。
- 灰度指标（`forum_auth_new_success` / `legacy_success` / `failed` 等）只存在进程内计数器与日志，**不进入 `/health`**（`identity_auth/metrics.py`）。
- 回滚策略：只需重开 `LEGACY_GRACE=true` 或临时 `ENABLED=false`，不需要回滚 Identity DB/签名密钥。

### 4.5 数据层

| 存储 | 用途 | 关键表 / 说明 | 代码 |
|---|---|---|---|
| PostgreSQL 17（NAS，库 `minihbut`） | 唯一权威库（47 张表 / 约 25.8 万行） | 云同步、游戏平台、旧排行榜、论坛（可选）、统计 | `AGENTS.md:88-89,184-185` |
| Turso（libsql） | 云同步主存储 | `cloud_sync_records`（一学号一行） | `modules/cloud_sync_storage.py:369,797` |
| 旧 Proxy（Cloudflare Worker） | 云同步兼容 | 转发 `/sync/*` | `entrypoint.py:1402-1458` |
| SQLPub（MySQL 兼容） | 论坛 / 使用统计 / 给分 / 排行榜（缺省后端） | 17 张 `forum_*` 表；`service_daily_*`、`client_usage_*`；`grade_distribution*`；`game_rank_*` | `forum_backend/storage/sqlpub_store.py`、`modules/service_stats.py` |
| 游戏平台表 | `game_*` 约 30 张（经济/漂流瓶/赛季/五子棋） | `game_platform_routes` 使用 | `modules/game_platform/schema.py` |
| SQLite | 本地开发 / 论坛兜底 | `data/forum.sqlite3` | `forum_backend/storage/sqlite_store.py` |
| 临时文件 | 课表 ICS 托管 | `/tmp/mini_hbut_temp` + `index.json` / `metrics.json` | `entrypoint.py:170-172` |
| 对象存储 | 论坛附件/快照 → HF 私有 Dataset → OneDrive（rclone） | `data/uploads`、`data/backups` | `forum_backend/object_storage.py`、`backup.py` |

- **云同步 payload 编码**：`codec: "zlib+base64" | "json"`，还原链 `base64 → zlib → json`。
- **迁移契约**：`game_rank_best` 的 `payload_json` 是"文本里装 JSON"，迁移 PG 时**绝不改 jsonb**；upsert 只在"整体严格更优"时覆盖；断连按 SQLSTATE（08000/08003/08006/57P01/57P02/57P03）有界重试。
- **给分记录读写共用同一开关**（`GRADE_DB_BACKEND`），切换必须读写同值（`AGENTS.md:97,101`）。

### 4.6 与身份平台的对接（现状）

- `identity_auth/` 是**纯校验方**：不签发令牌，只按 `MINI_HBUT_IDENTITY_ISSUER` + JWKS 验签。
- 配置默认值（`identity_auth/config.py`）：
  - `PRODUCTION_CANONICAL_ISSUER = https://id.xn--vhq74jc2fzpchter27a.com`
  - `DEFAULT_HF_AUDIENCE = mini-hbut-hf-api`
  - `MINI_HBUT_IDENTITY_ENABLED=false`（默认关闭）
  - `MINI_HBUT_IDENTITY_LEGACY_GRACE=true`（默认允许旧 token）
- 灰度策略（`docs/identity_auth_rollout.md`）：开 flag → 双轨 → 观察指标 → 关 legacy。
- 论坛管理员判定：`FORUM_ADMIN_STUDENT_IDS` + 已验证身份组合（不依赖 scope）。

### 4.7 NAS 上已有的基础设施（来自仓库文档，非代码验证）

| 组件 | 地址/形态 | 依据 |
|---|---|---|
| Casdoor | `https://sso.hbut.site`；**仓库文档记载已在 NAS 上运行**，用户名+口令登录；计划为 `/admin` 提供 OIDC 登录（`mini-hbut-admin` 应用） | `ocr-service/docs/admin-panel-plan.md` 第 6/12 节、`admin-panel-design.md` |
| PostgreSQL | 云同步/游戏 | 环境变量与模块 |
| Traefik | 主域反代 | 部署 runbook |
| 监控 | dozzle / uptime-kuma / beszel | `admin-panel-plan.md` |

【未确认】Casdoor 的版本、数据库、已建组织/应用/角色、API 凭据与权限模型；仓库代码中**没有任何 Casdoor 客户端集成**（全仓 grep 仅命中两份设计文档）。

### 4.8 管理台现状

**已实现（代码中真实存在）**：

| 能力 | 路径 / 入口 | 鉴权 |
|---|---|---|
| 论坛 HTML 管理页（仅回显 db backend / bucket / OneDrive 状态） | `GET /forum/admin` | **无鉴权** |
| 论坛管理 API（建版块、建/关投票、发徽章、封禁、举报队列、用户检索、手动备份） | `/api/forum/admin/*` | `admin_claims`（`is_admin` + 未封禁 + `forum.write`） |
| 归档导出 | `POST /api/admin/service-archive/export` | 静态共享密钥 |
| 运行状态 | `GET /health`（约 30 键） | 无 |

**未实现（只有设计文档）**：

- `/admin` 综合管理台：只存在于 `docs/admin-panel-plan.md`（420 行）与 `admin-panel-design.md`（338 行）。
- 代码中**没有** `/admin*` 页面路由、没有 `admin_users` / `admin_sessions` / `admin_settings` / `admin_audit_log` 表、没有 `ADMIN_PANEL_ENABLED`、没有 `ADMIN_CASDOOR_*` 读取。
- 计划中的能力：Casdoor SSO 登录、学生 360、全库只读浏览、配置中心、审计日志、权限矩阵（owner/admin/operator/viewer + `pii.read`/`data.read`/`data.export`/`settings.write`/`ops.*`/`forum.moderate`/`game.moderate`/`audit.read`/`admin.manage`）。

### 4.9 已知"文档 vs 代码"不一致（事实清单）

| # | 文档说法 | 代码事实 |
|---|---|---|
| 1 | `README.md:66` 列出 `POST /api/forum/threads/{thread_id}/scores` | 代码无该路由 |
| 2 | `README.md:75` / `identity_auth_rollout.md:126` 称管理员判定 = 环境变量 + profile 表 | Identity 路径只读环境变量；profile 表 `is_admin` 只写不读 |
| 3 | `identity_auth_rollout.md:33-35` 称 Core 未支持 resource indicator 前应清空 audience | `config.py:128` 默认值非空 → `verify_aud` 默认开启 |
| 4 | `identity_auth_rollout.md:68` 第 6 步"移除 `/api/forum/auth/token`" | 端点仍存在且无任何 flag 门禁 |
| 5 | `identity_auth_rollout.md:137-139` 称 CORS 收紧要单独 PR | `FORUM_CORS_ORIGINS` 只在独立 `create_app()` 生效；生产沿用主 app `*` |
| 6 | `identity_auth_rollout.md:151` 称灰度指标可临时在 `/health` 派生输出 | `/health` 当前不含 identity 指标 |
| 7 | `README.md:73-75` 称管理员判定用"HF role table + profile 表组合" | 实际组合只有环境变量 |

> 这些差异属于**现状事实**，在迁移评估时需要按代码而非按文档理解现有行为。

---

## 5. 新需求（用户输入）

### 5.1 需求原文（逐字保留）

> 我接下来想写一个文档，主要是给其他的 Agent 分析我这个软件的架构，以及开发者平台的架构，因为我需要对其进行升级和迁移"D:\Documents\C_learn\成绩查询\tauri-app\identity-platform" 首先我要跟你说一下我的这个授权认证系统，我想把它全面地融合进我的 OCR services 这个后端里面D:\Documents\C_learn\成绩查询\ocr-service 这个后端部署在我们社团的 NAS 服务器上，而且服务器上也有 casdoor。
>
> 我希望实现以下功能：
>
> 1. 用户每次登录后，都能通过我的后端自动在 casdoor 注册一个账户。
> 2. 以后在我的授权认证系统开发者平台上，每次有应用使用 minihbut 进行授权时，都能直接通过我的后端去访问 casdoor，获取用户的这些授权。所以我认为，我自己这个授权系统是完全不必要的，完全可以借用 NAS 服务器上有的这些东西。我唯一需要的就是把这些东西都融合进我的后端，casdoor 里面的应用和授权，可以经过授权放入 mini-hbut 后端中。中间也可以接入这些应用，比如内嵌地去使用，并且数据可以进行互通。具体分为以下两种情况：
>    1. 内嵌使用：不需要认证页面，可以直接通过后端获取你的信息并直接打开。
>    2. 网页部署：如果部署在网页上，点击使用 mini hbut 登录，则需要通过扫码或输入授权码的方式来进行授权。
>
> 并且我接下来还有一个加固的更新，是针对我这个 Tauri 软件的架构更新。因为我这个软件到时候要接两家新的接口，并且还有一些前端的文件，我认为这样改来改去非常麻烦。我这个软件目前还没有接入应用，我希望给这个应用单独开一个窗口，不断地和我 NAS 上的后端进行通信，确认应用都是什么样。
>
> 所以我希望对软件做如下调整：
>
> 1. Rust 后端：只保留获取全链路 Cookie 的能力（即从登录账号，到新融合门户，再到教务系统、学习通、一码通）。其他写死的功能都保存在 Rust 后端里面，剩余的请求就不直接写在后端了。
> 2. 前端热更新：剩余的请求写在前端可以热更新的部分，并且这个热更新的部分可以保存到我的 NAS 平台里。这样软件每次启动时，就会直接进行热更新，从而更新前端页面或其他功能组件。
>
> 所以接下来，请你为我分析我的请求，并把我的需求整理成一个文档。但是，你不要提任何建议。你可以去读取我的本地文件，来完善我的请求。

### 5.2 需求结构化拆解

#### 5.2.1 总目标

1. **身份与授权统一到 NAS**：把 `identity-platform` 的授权认证能力整体并入 `ocr-service`，并以 NAS 上已有的 Casdoor 作为身份与授权基础设施。
2. **客户端运行时收缩与热更新化**：Rust 只保留"拿全链路 Cookie"的能力；新增业务请求不再进入 Rust，而是进入可远程更新的前端运行时。
3. **应用接入与运行形态**：为第三方/新应用提供两种接入形态（内嵌 / 网页），并让应用具备独立的运行窗口与后端通信能力。

#### 5.2.2 需求 R1：登录后自动在 Casdoor 注册账户

- **触发点**：用户每次在 Mini-HBUT 客户端完成学校账号登录。
- **动作**：由 **Mini-HBUT 后端（ocr-service）** 调用 Casdoor，自动创建/关联一个 Casdoor 账户。
- **主体信息**：至少包含学校学号（`hbut_student_id`）与姓名/角色等已从会话中获得的身份信息。
- **语义待明确**：
  - "每次登录都注册" = 幂等 upsert 还是每次新建？
  - 账户唯一键 = 学号？还是平台 user id？
  - 同名/同学号已有账户时的合并规则。
  - Casdoor 侧的用户名/密码策略（是否由 Casdoor 生成随机密码、是否需要用户设置）。

#### 5.2.3 需求 R2：开发者平台的应用授权改为后端代理 Casdoor

- **现状**：`identity-platform` 自己维护 `oauth_applications`、`auth_requests`、`oauth_consents`、`oidc_provider_records`，并自己签发 OIDC 令牌。
- **目标**：
  - 开发者平台不再作为授权系统的权威源；
  - 应用在 Casdoor 中登记（或经后端登记到 Casdoor）；
  - 用户授权记录、应用授权关系由后端向 Casdoor 查询/写入；
  - "casdoor 里面的应用和授权，可以经过授权放入 mini-hbut 后端中"。
- **待明确**：
  - mini-hbut 后端在 Casdoor 中的角色（OIDC 客户端？还是 Casdoor 的管理 API 调用方？两者是否都要）；
  - 开发者平台保留哪些能力（应用列表/审核/凭据管理/审计），哪些完全移交给 Casdoor；
  - "经过授权放入"的具体语义（同步/镜像/引用/白名单）。

#### 5.2.4 需求 R3：两种应用接入形态

| 形态 | 用户描述 | 关键特征 |
|---|---|---|
| 内嵌使用 | "不需要认证页面，可以直接通过后端获取你的信息并直接打开" | 应用运行在 Mini-HBUT 客户端内（或由客户端打开）；无独立登录页；后端直接把当前登录用户的信息交给应用 |
| 网页部署 | "点击使用 mini hbut 登录，则需要通过扫码或输入授权码的方式来进行授权" | 应用是外部网页；用户点击登录 → 扫码（用 Mini-HBUT App）或输入授权码 → 完成授权 |

- **内嵌形态待明确**：
  - 宿主是"模块包窗口"（现有 `module_bundle`）还是新的应用容器？
  - 应用如何拿到用户信息（注入 token？后端接口？postMessage？）；
  - 是否允许应用访问学校 Cookie / 业务数据；
  - 应用的数据写入如何与 mini-hbut 数据互通。
- **内嵌形态的现状障碍（事实）**：现有身份平台的授权页（auth.*）**不能被 iframe 嵌入**（CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY`）；现有授权流程也**不允许静默同意**（每次必须 App 内批准）。"不需要认证页面、直接打开"与现有平台的安全模型直接冲突，需要新的应用身份注入机制。
- **网页形态待明确**：
  - "授权码"是 Casdoor 的 device code、mini-hbut 自定义一次性码，还是 OAuth 授权码；
  - 扫码是 App 扫网页二维码（现有 `identityQrScanner` 形态）还是网页扫 App 二维码；
  - 授权完成后令牌由谁签发（Casdoor 直发 / 后端代发）。

#### 5.2.5 需求 R4：数据互通

- "中间也可以接入这些应用，比如内嵌地去使用，并且数据可以进行互通。"
- 涉及的数据域（现状已有）：成绩、课表、考试、给分记录、云同步快照、论坛、游戏平台/排行榜、使用统计。
- 待明确：
  - 互通的方向（应用读 mini-hbut 数据 / mini-hbut 读应用数据 / 双向）；
  - 互通的授权粒度（按 scope、按应用、按用户）；
  - 数据格式与存储位置（NAS 后端 / Casdoor / 应用自持）。

#### 5.2.6 需求 R5：Rust 后端收缩为"全链路 Cookie 层"

【用户原话】

> Rust 后端：只保留获取全链路 Cookie 的能力（即从登录账号，到新融合门户，再到教务系统、学习通、一码通）。其他写死的功能都保存在 Rust 后端里面，剩余的请求就不直接写在后端了。

结构化理解（按原文语义拆为三条）：

1. **保留**：Rust 负责登录链路与全链路 Cookie 获取（CAS → 融合门户 → 教务 → 学习通 → 一码通），并维持会话/刷新/持久化能力。
2. **冻结**：已经写死在 Rust 里的存量业务功能（成绩、课表、考试、学习通、图书馆、电费、体育场馆、教学评价、教师门户等 238 个命令）**继续保留在原处**，不要求迁出。
3. **增量外移**：**剩余/新增**的请求不再写进 Rust，而是写进"前端可热更新部分"。

- **待明确**：
  - "其他写死的功能都保存在 Rust 后端里面"是否等于"存量不动、只冻结"；
  - 增量请求是否允许绕开 Rust 直接由前端发（会受 CORS/证书/WebView 网络策略限制）；
  - 若前端直连学校系统，Cookie 如何注入（现有 `get_cookies` 命令可导出 Cookie 串）；
  - 会话过期时的统一重登/刷新由谁负责（Rust 现有 `refresh_session` / `session_guard`）。

#### 5.2.7 需求 R6：前端热更新承载增量请求与页面

【用户原话】

> 前端热更新：剩余的请求写在前端可以热更新的部分，并且这个热更新的部分可以保存到我的 NAS 平台里。这样软件每次启动时，就会直接进行热更新，从而更新前端页面或其他功能组件。

结构化理解：

1. 存在一个"可热更新的前端部分"，承载：
   - 新增/剩余的上游请求逻辑（URL、参数、解析）；
   - 新增/变更的页面与功能组件。
2. 该部分的产物托管在 **NAS 平台**（`mini.hbut.site` 或其子路径/CDN）。
3. 客户端每次启动时检查并应用更新（不要求用户手动确认/重启安装）。
4. 更新失败必须可回退（现有 hot_update 已有 `failed_versions` / rollback 机制）。

- **现状对照**：
  - 已有 `hot_update.js` 整包热更（调试开关控制，默认关闭）；
  - 已有 `module_bundle` 远程模块（独立窗口/iframe，CDN 托管）；
  - 已有 `remote_config` 配置下发（GitCode 托管）；
  - 三者都不是"NAS 托管的、启动即生效的、承载请求逻辑的前端运行时"。
- **待明确**：
  - 热更粒度（整包 / 模块 / 单文件 / 仅 JS 逻辑）；
  - 更新时机（启动前阻塞 / 启动后后台 / 下次启动）；
  - 签名与信任链（现有 SHA256 + 预留签名，无私钥基础设施）；
  - App Store 合规构建如何处理（现有策略在 guest/demo 下禁用远程代码）；
  - 旧版本客户端与旧热更包的兼容策略（`min_compatible_version`）。

#### 5.2.8 需求 R7：应用独立窗口与 NAS 持续通信

【用户原话】

> 我这个软件目前还没有接入应用，我希望给这个应用单独开一个窗口，不断地和我 NAS 上的后端进行通信，确认应用都是什么样。

结构化理解（存在两种可能，均需在实现前确认）：

| 解释 | 含义 |
|---|---|
| A. 给"第三方应用"开独立窗口 | 每个接入应用有独立窗口，窗口内应用持续向后端查询自身配置/授权/数据，后端据此确认应用身份与能力 |
| B. 给"Mini-HBUT 自身"开一个应用管理窗口 | 新增一个"应用中心"窗口，持续与 NAS 后端通信，拉取应用清单、版本、授权状态、可用性 |

- 现状可复用的能力：`open_module_bundle_window`（独立窗口，加载远程 bundle）、`module_bundle` 的 manifest/版本/兼容性、`remote_config` 的 `module_center` 清单。
- 待明确：
  - "应用"指第三方 OAuth 应用、远程模块，还是两者统一；
  - "确认应用都是什么样"具体指哪些字段（列表/版本/图标/权限/在线状态/数据范围）；
  - 通信是长连接（WebSocket/SSE）还是轮询；
  - 窗口的生命周期（随主窗口 / 独立常驻）。

#### 5.2.9 需求 R8：接入两家新接口

【用户原话】

> 因为我这个软件到时候要接两家新的接口，并且还有一些前端的文件，我认为这样改来改去非常麻烦。

- 仓库内**没有任何**关于"两家新接口"的具体记录（本次未找到相关 issue/文档）；需用户补充：
  - 两家接口的名称/域名/协议；
  - 是否属于学校系统（需 Cookie）还是第三方服务（独立鉴权）；
  - 是否要求前端页面/组件，还是纯数据接口。

#### 5.2.10 需求 R9：迁移 `identity-platform`

- 迁移对象：`tauri-app/identity-platform`（Core + Web + 文档 + 部署脚本）。
- 用户判断："我自己这个授权系统是完全不必要的，完全可以借用 NAS 服务器上有的这些东西。"
- 待明确：
  - 哪些资产要保留（域名、issuer、客户端注册、用户/设备/授权记录、审计）；
  - 现有已签发的 refresh token / access token / 设备绑定如何过渡；
  - Vercel 项目是否下线；
  - 现有第三方接入方（如有）如何切换 issuer/客户端配置；
  - `developer.*` 门户是否保留为新前端（仅换后端）还是也由 Casdoor 自带 UI 替代。

---

## 6. 现状与需求的对应关系（能力矩阵）

> 说明：本表只陈述"现状有什么 / 缺什么"，不含方案。

| 需求 | 现状能力 | 现状缺口 |
|---|---|---|
| R1 登录后自动注册 Casdoor | 登录后可获得学号/姓名/角色；后端已有 Identity token 校验 | 后端无 Casdoor 客户端/SDK/管理 API 调用；无用户映射表；无注册触发链路 |
| R2 开发者平台代理 Casdoor | 自建 OIDC Provider、应用 CRUD、审核、凭据、审计齐全（`oauth_applications` 等 18 张表） | 无 Casdoor 应用同步；无 Casdoor 授权查询；无"后端代理 Casdoor"接口 |
| R3-内嵌 无认证页打开 | 客户端有模块窗口/iframe、`get_cookies`、页面内可调后端 | 身份平台授权页**明确禁止被嵌入**（CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY`）；无应用身份注入协议；无应用级数据授权 |
| R3-网页 扫码/授权码 | 有完整扫码/深链授权（auth.* + App 批准 + 设备签名 + 深链） | 授权主体是自建 Core，不是 Casdoor；**每次授权必须 App 内批准**且用户必须已 enrollment；"授权码"形态未定义 |
| R4 数据互通 | 论坛/云同步/游戏/统计均有 API 与数据模型；数据快照（#700）可存加密成绩/课表 | 无应用维度的数据授权；无统一 scope→数据域映射（现有 scope 仅覆盖学业/论坛/云同步/游戏） |
| R5 Rust 收缩 | Rust 已有全链路 Cookie 与 238 个命令 | 增量请求仍会倾向写 Rust；前端直连学校系统的 Cookie 注入/证书/CORS 未定义 |
| R6 前端热更（NAS） | 有整包热更框架（调试开关）、远程模块、远程配置 | 热更产物不在 NAS；请求逻辑仍编译进包；启动即生效链路未启用；签名信任链未落地；App Store 合规包禁用远程代码 |
| R7 应用独立窗口 | 有 `open_module_bundle_window`、独立 bundle 窗口 | 无"持续与 NAS 通信确认应用状态"的协议与 UI |
| R8 两家新接口 | 无记录 | 需求输入缺失 |
| R9 迁移 identity-platform | 完整实现 + 文档 + 安全测试；线上 Vercel 双项目 | 无迁移映射（用户/设备/客户端/令牌/域名）；无 `deny`/`cancel` 端点；无 DCR；无 introspection；设备撤销仅本机 |

---

## 7. 关键流程的期望形态（仅按用户描述推导）

> 以下流程是**用户描述的目标形态**，不是现状，也不是实施方案。

### 7.1 登录 → Casdoor 账户

```text
用户在 App 内登录学校账号
  → Rust 完成 CAS/门户/教务/学习通/一码通 全链路 Cookie
  → 前端拿到 UserInfo（学号/姓名/角色）
  → 调用 NAS 后端（ocr-service）登录态接口
  → 后端以服务端凭据访问 Casdoor，upsert 用户
  → 返回 Casdoor 用户标识 / 会话凭据（形态待定）
```

### 7.2 内嵌应用打开

```text
用户在 App 内打开某应用（模块窗口/新窗口）
  → 应用向 NAS 后端请求"我是谁 + 我能访问什么"
  → 后端依据当前登录会话（或短期应用 token）返回用户信息与数据授权
  → 应用直接渲染，无登录页
```

### 7.3 网页应用扫码/授权码

```text
外部网页点击「使用 Mini-HBUT 登录」
  → 跳转 NAS 后端的授权页（或后端返回二维码/授权码）
  → 用户用 Mini-HBUT App 扫码 / 在 App 输入授权码
  → App 向后端确认（用户已登录 + 同意 scope）
  → 后端向 Casdoor 完成授权/换取令牌
  → 网页拿到登录态（Casdoor 令牌或后端会话）
```

### 7.4 启动热更新

```text
App 启动
  → 拉取 NAS 上的热更清单（版本/兼容性/哈希/签名）
  → 下载并校验前端包
  → 应用新页面/新请求逻辑（或 stage 到下次启动）
  → 失败回滚到上一版/内置版
```

---

## 8. 事实缺口与待确认项

> 这些是撰写本文件时**仓库内无法确认**的信息；实现前必须由用户补齐。

### 8.1 Casdoor 侧

1. Casdoor 版本、部署方式（Docker？端口？数据库？）、`sso.hbut.site` 是否就是它。
2. 现有组织（Organization）、应用（Application）、角色/权限、用户来源。
3. 是否开放管理 API（`/api/*`）与凭据（client id/secret、应用 token），以及网络可达性（NAS 内部调用）。
4. Casdoor 支持的登录方式（用户名密码 / 扫码 / 第三方）与 MFA 策略。
5. Casdoor 的 OIDC 端点与 issuer 形态（是否 `https://sso.hbut.site`）。
6. 是否已有其他系统接入 Casdoor（如 `/admin` 计划中的 `mini-hbut-admin`）及其现状。

### 8.2 需求语义

7. "两家新接口"具体指哪两家、什么协议、是否需要 Cookie。
8. R7 中"应用"的准确所指（第三方 OAuth 应用 / 远程模块 / 统一应用模型）。
9. "授权码"的形态（Casdoor device code / 自定义一次性码 / OAuth code）。
10. "数据互通"的方向、粒度、数据域。
11. "每次登录都注册"的幂等/唯一键/合并规则。
12. "casdoor 里的应用和授权，可以经过授权放入 mini-hbut 后端"的具体语义。

### 8.3 迁移与兼容

13. 现有 identity-platform 的线上用户/设备/授权记录规模与是否需要迁移。
14. 现有已签发的 refresh token、设备绑定、第三方接入方清单。
15. 域名与 issuer 是否保留（`id./auth./developer.湖北工业大学.com`）。
16. Vercel 项目是否下线、数据库是否保留归档。
17. 现有第三方接入方的 client_id / redirect_uri / scope 是否需要在新系统中重建。
18. 现有平台不支持的 `deny`/`cancel`、DCR、introspection、iframe 内嵌，在迁移后是否需要补齐（用户需求中"内嵌使用"与"网页授权"都可能触碰这些缺口）。
19. **Token 协议映射**：现有 `identity_auth` 硬编码期望 `iss=https://id.xn--vhq74jc2fzpchter27a.com`、`aud=mini-hbut-hf-api`、受控 claim `hbut_student_id`（10 位数字）；Casdoor 默认签发 `sub/name/email` 等标准 claim，不含 `hbut_student_id`。两者的 issuer、audience、claim 映射规则待定。
20. **签名算法**：现有 `identity_auth` 白名单默认只有 RS256；Casdoor 的签名算法与 JWKS 形态（是否 `{issuer}/.well-known/jwks`）待核实。

### 8.4 客户端

21. 热更新的目标平台范围（仅桌面 Tauri？Android？iOS 合规包？）。
22. 前端直连学校系统的网络可行性（WebView 是否受系统代理/证书策略阻断；现有 identity 已因此改走 Rust）。
23. 现有 `module_bundle` 窗口是否可承载"应用窗口"。
24. 客户端版本兼容策略（旧版本如何拒绝/降级新热更包）。
25. 热更包的签名信任链（现有只有 SHA256；`verifyHotBundleSignature` 的签名方案未定义）。

---

## 9. 约束与不变式（现状已存在，迁移时必须知晓）

### 9.1 安全不变式（来自现有实现与威胁模型）

1. **学校密码/Cookie 不上传云端**：`docs/threat-model.md` 明确"本平台不接收、不存储、不上传 HBUT 密码 / CAS / JWXT cookie"。
2. **服务端不信任客户端自报身份**：Core 从 DB 推导 user/role/scope；OCR 后端从已验证 token 的受控 claim 取学号。
3. **设备私钥不出设备**：只在 OS keyring；不可用即 fail closed，不降级。
4. **JWT 验签失败不降级 legacy**：`identity_auth/dependencies.py` 明确。
5. **handoff / challenge / token 不落日志**：现有脱敏宏与 `redactSensitiveText`。
6. **管理员接口服务端 RBAC + step-up**：不依赖前端。

### 9.2 平台与合规约束

7. **iOS App Store 合规构建**：guest/demo 会话禁用远程代码与远程模块（`app_store_policy.ts`）；真实学校账号登录后放开。
8. **学校无官方 OIDC/CAS Client**：首次学校身份只能由客户端声明（`verification_method = mini_hbut_app`）。
9. **学校 HTTPS 证书历史问题**：客户端有兼容模式与证书探测（`probe_school_cert_status`）。
10. **WebView 网络限制**：身份请求已改走 Rust `identity_core_fetch`（`identityService.ts` 注释）。
11. **现有授权页不可被 iframe 嵌入**：auth/developer 站均设置 `frame-ancestors 'none'` + `X-Frame-Options: DENY`；"内嵌使用"不能复用现有网页授权页。
12. **现有授权不允许静默同意**：每次授权都必须 App 内批准；`prompt=none` 只返回 `interaction_required`。
13. **第三方用户必须已安装 App 并完成设备 enrollment**：否则无法完成现有授权流程。
14. **Core 无 CORS 中间件**：跨域能力由 OIDC provider 的 `clientBasedCORS` 与 BFF 承担。

### 9.3 工程约束

15. **单进程 FastAPI**：论坛/游戏平台以函数注册进同一 app，新增能力不得破坏启动顺序。
16. **后端端点契约**：客户端所有后端地址必须经 `backend_endpoints` 解析，不得硬编码域名。
17. **命令注册单点**：Tauri 命令集中在 `lib.rs` 的 `generate_handler!`；新增命令需同步权限/契约测试。
18. **CRLF / rustfmt 版本**：仓库 `.rs` 文件在 git 中为 CRLF；`cargo fmt` 会改写为 LF（见项目记忆）。
19. **测试与门禁**：前端 vitest、Rust cargo test/clippy、契约 spec 大量存在；改动需保持绿。

---

## 10. 代码索引（按主题）

### 10.1 客户端

| 主题 | 入口 |
|---|---|
| 应用壳/导航 | `apps/client/src/App.vue`、`src/navigation/app_navigation.ts` |
| 登录协调 | `src/app/coordinators/AuthCoordinator.ts`、`src/components/LoginV3.vue` |
| Rust 命令注册 | `apps/client/src-tauri/src/lib.rs`（`generate_handler!`） |
| 登录/Cookie | `src-tauri/src/http_client/auth.rs`、`http_client/session.rs`、`http_client/mod.rs` |
| 身份（Rust） | `src-tauri/src/identity/` |
| 身份（前端） | `src/features/identity/`、`src/utils/identity_device_token.ts`、`src/utils/identity_access_token.ts` |
| 远程配置 | `src/utils/remote_config.ts`、`src/utils/remote_config_defaults.ts` |
| 远程模块 | `src-tauri/src/modules/module_bundle.rs`、`src/components/MoreView.vue`、`src/utils/module_center.js` |
| 热更新 | `src/utils/hot_update.js`、`hot_update_bootstrap.js`、`hot_update_core.js`、`scripts/build_hot_bundle.mjs` |
| 全量更新 | `src/utils/updater.ts`、`src/utils/updater_sources.ts` |
| App Store 策略 | `src/config/app_store_policy.ts` |
| 后端端点 | `src/utils/backend_endpoints.ts`、`docs/architecture/backend-endpoints-contract.md` |
| 本地数据 | `src-tauri/src/infrastructure/db/`、`src-tauri/src/db.rs` |

### 10.2 身份平台

| 主题 | 入口 |
|---|---|
| Core 组装 | `identity-platform/core/src/app.ts`、`core/src/server.ts` |
| OIDC | `core/src/oidc/provider.ts`、`keys.ts`、`interaction.ts`、`resource-indicators.ts`、`device-access-token.ts` |
| API | `core/src/api/index.ts`（requests/app/developer/admin/account） |
| 鉴权 | `core/src/security/service-token.ts`、`core/src/api/app/auth.ts`、`core/src/security/api-key.ts` |
| 数据模型 | `core/migrations/*.sql`、`core/src/db/migrate.ts` |
| Web 站点 | `identity-platform/web/app/auth-site/`、`developer-site/`、`preview-site/` |
| Host 路由 | `identity-platform/web/proxy.ts`、`web/lib/host-router.ts` |
| BFF | `web/lib/auth/`、`web/lib/developer-api/`、`web/lib/admin/`、`web/lib/auth-session/` |
| Turnstile | `web/lib/turnstile-server.ts` |
| 安全 | `core/src/security/`、`web/lib/security/` |
| 文档 | `identity-platform/docs/README.md`、`runbook.md`、`threat-model.md`、`core/docs/contract.md` |

### 10.3 OCR 后端

| 主题 | 入口 |
|---|---|
| 主入口 | `ocr-service/runtime/entrypoint.py` |
| 身份校验 | `ocr-service/identity_auth/` |
| 论坛 | `ocr-service/forum_backend/` |
| 游戏平台 | `ocr-service/modules/game_platform/` |
| 云同步 | `ocr-service/modules/cloud_sync_storage.py` |
| 统计 | `ocr-service/modules/service_stats.py`、`client_usage_storage.py` |
| 给分记录 | `ocr-service/modules/grade_distribution.py` |
| 部署 | `ocr-service/Dockerfile`、`README.md`、`docs/identity_auth_rollout.md` |
| 管理台计划 | `ocr-service/docs/admin-panel-plan.md`、`admin-panel-design.md` |

---

## 11. 术语表

| 术语 | 含义 |
|---|---|
| 全链路 Cookie | 从 CAS 登录派生出的教务/学习通/一码通等全部学校域会话 |
| Identity Platform | 自建 OIDC/授权平台（`identity-platform`） |
| Casdoor | NAS 上已有的开源 IAM（`sso.hbut.site`，仓库文档记载；代码无集成） |
| Resource Server | OCR 后端在身份链路中的角色：只验令牌，不签发 |
| handoff | 网页 → App 的一次性授权凭据（HMAC 摘要存库） |
| Device 签名 | 设备 Ed25519 私钥对 canonical 字符串的签名 |
| 设备换票 | 设备签名换取 resource-scoped JWT Access Token（无 refresh） |
| module_bundle | 远程前端模块包（manifest + zip + 独立窗口） |
| hot_update | 整包前端热更新框架（stage + 下次启动切换） |
| remote_config | 远程配置 JSON（公告/端点/模块清单/开关） |
| 内嵌形态 | 应用运行在 Mini-HBUT 客户端内，无独立登录页 |
| 网页形态 | 应用为外部网页，通过扫码/授权码完成登录 |

---

*本文档仅记录现状与需求。任何实现方案、选型、迁移步骤均不在本文范围内。*
