# 离线降级覆盖与断网快速失败 —— 实施计划（2026-10-29）

> 对应 epic issue（本计划落地后补编号）。调研依据：
> - `docs/offline-coverage-investigation-2026-10-29.md`（JS 侧架构调研，已合入 main @ #1143）
> - 2026-10-29 Rust 侧逐模块调研（本文件 §2 汇总，含全部文件:行号证据）

---

## 1. 背景与问题

用户反馈：断网连不上教务系统时，「所有模块都没法进去、没法显示，缓存都没法加载」。

调研结论（已验证，非猜测）：

- **启动与登录态不锁死**：Splash 本地身份恢复后即关；`isLoggedIn = 学号非空`，断网保留缓存身份（#355）。用户不会「进不去 App」。
- **核心教务模块已有完整离线降级**：走 `/api` + `fetchWithCache` 的 10 个视图（成绩/课表/考试/排名/校历/学业/培养方案/空教室/电力等）有 SQLite 持久缓存（grades.db 26 张表）+ stale 回退 + `offline:true` 快照 + 模块离线横幅。
- **真正的缺口**：23 个走 `invokeNative`（Tauri IPC → Rust → 远端）的视图中，**11 个目标模块零本地持久缓存**（明细见 §2.2），断网即报错/空白/空面板。
- **体验放大器**：断网时会话恢复链每轮空等 HTTP 超时（单请求 30s / 登录门 90s），65s 轮询持续发注定失败的请求；「正在后台自动登录…」横幅长时间滞留。全 App **无任何 `online`/`offline` 事件监听**，网络恢复后最长等 65s（轮询）或 20min（keep-alive）才重试。

## 2. 现状调研结论（事实基线）

### 2.1 Rust 侧三类缓存机制

1. **SQLite 持久缓存**（`infrastructure/db/migrations.rs:374-401`，26 张 `*_cache` 表；读写 `infrastructure/db/cache.rs:14-63`）
2. **`/api` offline:true 快照机制**（`application/academic.rs:6-7` 语义定义：成功→写缓存+offline=false；失败→读缓存→`attach_sync_time(offline=true)`，未命中→`ApplicationError::network`。同模式：`application/schedule.rs:7`、`grade/service.rs:133-185`；缓存直读端点 `http_server/routes/system.rs:227-235` 恒带 `offline:true`）
3. **进程内存缓存（不落盘）**：校邮 180s（`modules/school_inbox.rs:20,637`）、迎新 20s（`modules/smart_orientation.rs:29,38`）、超星 SSO 运行态（`modules/chaoxing_sso.rs:87`）、小塔 WAF cookie（`http_server/routes/proxy.rs:94`）

### 2.2 缺口模块逐模块现状（11 个目标模块）

| 模块 | 主要 Rust 命令 | 数据源 | 本地缓存 | 断网行为 |
|---|---|---|---|---|
| 校邮 SchoolInbox/ChaoxingInbox | `school_inbox_fetch/detail/mark_read` | 门户 tzsjx + notice.chaoxing.com | 仅 180s 内存 | 内存命中外 Err；mark_read 写操作无回退 |
| 教学评教 TeachingEval | `teaching_eval_list/form/submit` | **无（协议桩）** | 无 | 不出网：空列表+占位题+success:false（#439 协议未定，**非离线问题**） |
| 学习通班级/Hub ChaoxingClass/Hub | `chaoxing_class_ensure_sso/list_resources/…` | i.chaoxing.com + p.ananas.chaoxing.com | 无（仅 SSO 内存态） | Err 透传；下载类无离线语义 |
| 图书馆预约 LibraryReserve + 3 Panel | `library_reserve_seat_*/item_*/time_list/my_reservations/…` | reserve.chaoxing.com | 无 | Err 透传 |
| 资料分享 ResourceShare | `resource_share_list_dir_native/…` | 用户自定义 WebDAV | 无 | 12s/45s 超时 → Err |
| 智慧迎新 SmartOrientation | `smart_orientation_list_panels/list_messages/profile_blocks` | stu.hbut.edu.cn/app/welcome | 仅 20s 内存 + demo fixture | 空面板+错误文案（不抛错） |
| 运动场馆 SportsVenue | `sports_venue_bootstrap/…` | **校内内网 IP** 172.16.54.20:9000 | 无 | Err（校外双重不可达） |
| AI 助手 AiChat | `hbut_ai_init/chat/upload` | 外部 AI 平台 | `ai_session_cache` 仅存 token | chat 数据请求无回退 → Err |
| 校园码 CampusCode（/api） | `POST /v2/campus_code/*` | code.hbut.edu.cn virtualCard | 无 | 400「请求发送失败」 |
| 教育网网费 Broadband | `one_code_app_open_prepare` | code.hbut.edu.cn lightapp | 无 | 已优雅：success:false+提示 |
| 小塔出行 TowerGo | 本地桥 :4399 → 透明代理 | ebike-oper.chinatowercom.cn | 无（仅 WAF cookie） | 错误透传 |

### 2.3 JS 侧恢复链现状（快速失败挂钩点）

- `attemptOnlineRecovery`（`SessionCoordinator.ts:675`）→ `tryRestoreSession` → `tryRestoreLatestSession` → `attemptAutoRelogin`（:363，真实 login invoke 走 `runExclusiveLogin` 单飞门）
- `refreshSessionSilently`（:555，20min keep-alive）、`startJwxtRecoveryPolling`（:742，65s 轮询，`JWXT_RECOVERY_INTERVAL` `constants.ts:50`）
- `isDeviceOffline()` 已存在（`SessionCoordinator.ts:127`）但仅用于临时扫码会话判定（:194），恢复链未用
- 维护横幅/会话状态点仅渲染在 Dashboard（`Dashboard.vue:71-159`，`onlineSessionState` + `jwxtRecoveryPhase` 驱动）；模块级离线横幅模式已存在（`exam.offlineBanner` 等 i18n 键 + `withOfflineMeta` `api.ts:533`）

## 3. 设计目标与总体原则

1. **全局铁律**：断网后任何模块不得白屏/无限 loading；要么「缓存数据 + 离线标记」，要么「可读的离线错误」。
2. **复用既有模式，不造新机制**：SQLite 缓存 + `offline:true` 快照（/api 已验证的 `academic.rs` 模式）；前端 `fetchWithCache`/横幅 i18n 模式。
3. **状态单一事实源**：设备在线状态只在 App 层维护一份（ref + `online`/`offline` 事件），恢复链与 UI 指示都消费它。
4. **快速失败、即时重试**：断网时跳过必然失败的网络调用（不等 30–90s）；网络恢复秒级触发重试（不等 65s 轮询）。
5. **写操作不缓存**：提交/预约/已读/支付等写操作断网时明确失败提示，不假装成功。
6. **无离线语义的数据不硬缓存**：实时占用、动态二维码、下载流等只给可读错误。

## 4. 阶段计划（E1–E6）

### E1 网络状态监控 + 恢复链快速失败（基础，最先做）

**范围**：`apps/client/src/app/`（SessionCoordinator、appState、useAppRuntime）

- 新增响应式设备在线状态 `deviceOnline`（初值 `navigator.onLine`），监听 `window` `online`/`offline` 事件（需验证 Capacitor/Android WebView 兼容性，iOS WKWebView 支持标准事件）。
- 恢复链快速失败：`attemptOnlineRecovery` / `attemptAutoRelogin` / `refreshSessionSilently` 入口处，`navigator.onLine === false` 时**立即返回失败**（不 invoke 网络命令），维护态提示区分「设备离线」与「教务不可用」（新 phase 或 hint 前缀，复用 `markJwxtMaintenance`）。
- 恢复即时重试：`online` 事件 → 立即触发一次静默 `attemptOnlineRecovery`；离线期间暂停（或拉长间隔）65s 恢复轮询，避免无效请求与 30–90s 空等。
- **验收**：断网后不再出现 30–90s 的「正在后台自动登录」长等待；恢复网络后 ≤10s 内完成会话验证/重登；单测覆盖快速失败分支。

### E2 全局离线状态指示

**范围**：Dashboard 维护横幅/状态点（`Dashboard.vue:71-159`）+ i18n

- 扩展现有 `onlineSessionState`/`jwxtRecoveryPhase` 状态机：区分「设备离线」相位（如 `device_offline`），横幅文案「当前离线 · 展示本地缓存数据 · 恢复网络后自动刷新」。
- 网络恢复后横幅自动清除（消费 E1 的 `online` 事件/`deviceOnline`）。
- 决策点：是否扩展到非首页（当前仅 Dashboard 有横幅；其他模块已有各自 offlineBanner）。建议：首页横幅 + 状态点足够，其余模块沿用现有模式，不做全局 toast。
- **验收**：断网首页即可明确感知离线态；恢复后 ≤10s 自动回正常态；三语文案齐全。

### E3 校邮离线回退（SQLite 持久化）

**范围**：`src-tauri/src/modules/school_inbox.rs` + 前端 SchoolInboxView/ChaoxingInboxView

- 新缓存表（如 `school_inbox_cache`，按 student_id + 列表/详情分 key）持久化最近一次成功抓取；网络失败时返回 `offline:true + sync_time` 旧快照（严格套用 `academic.rs` 模式）。
- 180s 内存缓存保留（热路径）。
- 前端：列表/详情展示离线横幅（套用 `exam.offlineBanner` i18n 模式）；`mark_read` 断网明确失败提示。
- **验收**：在线成功过一次后，断网（含重启 App）校邮列表/详情可查看+离线标记；已读操作断网给出明确失败。

### E4 智慧迎新离线回退（SQLite 持久化）

**范围**：`src-tauri/src/modules/smart_orientation.rs` + SmartOrientationView

- 20s 内存缓存升级为 SQLite 持久（迎新面板/消息/档案块），失败返回 offline 快照；demo fixture 兜底保留为最后一层。
- 前端离线标记（当前只有空面板+文案，升级为「缓存数据+更新时间」）。
- **验收**：断网可看最近一次迎新数据 + 离线标记。

### E5 学习通系离线降级（列表类只读）

**范围**：`src-tauri/src/modules/chaoxing_class*.rs` + ChaoxingClassView/ChaoxingHubView

- 班级列表/资料列表/课程中心等**只读列表类**数据持久缓存 + offline 快照。
- SSO 会话（`SSO_RUNTIME` 内存态）不持久化；断网时 SSO 无法续期 → 列表用缓存、资源下载明确报「网络不可用」。
- **验收**：断网班级/资料/课程列表可查看+离线标记；下载类明确失败提示。

### E6 剩余模块策略落地（低优先级，逐个小 PR）

| 模块 | 策略 | 理由 |
|---|---|---|
| 图书馆预约 | 我的预约列表（`my_reservations`）持久缓存+离线标记；实时占用/下单不缓存 | 订单是用户自己的数据；实时占用无离线语义 |
| 校园码 | 不缓存，错误文案升级（「当前无法生成校园码（需网络）」） | 动态二维码无离线语义 |
| 运动场馆 | 不缓存，错误文案升级 | 校内内网，校外双重不可达 |
| 资料分享 | 目录列表快照缓存（可选，低优先） | 用户自有 WebDAV |
| 小塔出行 | 不缓存（订单/车辆状态实时性要求高），错误文案可读化 | 外部服务 |
| 教育网网费 | 维持现状（已优雅 success:false+提示），仅核对文案 | 已达标 |
| AI 助手 | 不缓存（token 已缓存），chat 错误文案可读化 | 数据无离线语义 |
| 教学评教 | **不纳入本 epic**：协议未定（`protocol_ready:false` 桩），先做 #439 协议对接 | 无数据可缓存 |

- **验收（E6 整体）**：11 个缺口模块全部满足「§3 铁律」——缓存+标记或可读离线错误，无白屏/无限转圈/裸错误串。

## 5. 依赖关系与执行顺序

```
E1（网络状态+快速失败）──→ E2（全局离线指示）
E3（校邮）  ─┐
E4（迎新）  ─┼── 互相独立，可并行（均复用 /api 已验证的 SQLite+offline 模式）
E5（学习通）┘
E6（剩余模块）── 依赖 E1 完成（文案/状态基础），内部各模块独立
```

建议顺序：**E1 → E2 → (E3 ∥ E4 ∥ E5) → E6**。E3/E4/E5 可三人/三代理并行。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| `online`/`offline` 事件在部分 WebView 不可靠（Android WebView 冻结场景，#929 已有先例） | `deviceOnline` 仅作加速优化；恢复链保留 65s 轮询兜底，事件丢失不改变最终一致性 |
| 缓存快照过期误导用户（如旧课表/旧通知） | 所有 offline 快照强制带 `sync_time` + 横幅展示更新时间；TTL 过长的表（通知类）可设「超过 24h 提示数据可能过期」 |
| 写操作与缓存交互出错（如已读状态漂移） | 写操作永不走缓存路径，断网明确失败（§3.5） |
| 多模块同时改 Rust 缓存表 | 每模块独立表/key，互不干扰；migration 一次性加表（参考 26 表现有迁移） |
| 回滚 | 每个 sub-issue 独立 PR、独立可回滚；SQLite 表只增不删，前端横幅纯增量 |

## 7. 总体验收

- [ ] 断网 → 核心教务模块（10 个）缓存+横幅行为不回退（回归）
- [ ] 断网 → E3/E4/E5 模块有缓存数据+离线标记
- [ ] 断网 → 其余模块无白屏/无限 loading，错误可读
- [ ] 断网 → 无 30–90s 无效恢复等待；恢复网络 ≤10s 自动恢复
- [ ] 三语（zh-CN/en/ja）新文案齐全
- [ ] `test-frontend` + `test-rust` CI 全绿
