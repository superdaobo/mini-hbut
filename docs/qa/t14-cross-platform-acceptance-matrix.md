# T14 跨平台迁移与故障恢复验收矩阵（superdaobo/mini-hbut#1172）

> ⚠️ **口径提示（2026-11-12）**：本文为**旧链路**（设备换票 + 后端换令牌）口径。
> 身份 v2 **新链路**（OIDC 授权码+PKCE / refresh / 数据白名单 / 管理员 groups / 双 issuer）的验收见 [`identity-v2-acceptance-matrix.md`](identity-v2-acceptance-matrix.md)。
> 本文**保留作历史证据**，不再更新。

> 建立：2026-11-07。性质：**验收清单 + 既有证据回填 + 一次验收执行手册**。
> 本文档未执行任何部署、NAS 操作或 Casdoor 写操作；「实际结果」要么引用本机既有证据（标注来源与版本），要么写「未测」。
> 依据：`docs/architecture/mini-hbut-migration-plan-2026-11-01.md:144`（T14 定义）、`goal-9/plan.md`、`goal-9/tasks.md`。

## 0. 硬规则（违反即验收无效）

| # | 规则 | 依据 |
|---|---|---|
| R1 | Windows 的结果**不得**用于标记 iOS/Android（或 macOS）通过；macOS/iOS 构建与设备测试交由对应平台 | `docs/architecture/mini-hbut-migration-plan-2026-11-01.md:186` |
| R2 | 未测必须写「**未测**」（或「失败（实测）」），不得留空、不得写「通过」 | `mini-hbut-migration-plan-2026-11-01.md:184–187`；`apps/client/src-tauri/docs/module_platform_matrix.md:3` |
| R3 | 测试进程**单个最多 60 秒**；超时记为**不通过（失败）并拆分**为更小步骤重跑；长构建单列为构建步骤，不计入 60s 判定 | `mini-hbut-migration-plan-2026-11-01.md:185` |
| R4 | 每行「实际结果」必须有对应「证据」（文件:行号 或 产物）；无证据 = 未测，不以任务编号代替证据 | `mini-hbut-migration-plan-2026-11-01.md:153` |
| R5 | 复用旧证据必须标注**实测时代码版本**；与当前基线版本不同则注明差异 | 本文 §1、§3 |
| R6 | 不伪造通过：旧证据只能支撑其当时实测的那条链路、那个平台、那个账号类型 | `goal-9/plan.md:77` |

## 1. 基线记录（验收项 1）

| 项 | 值 | 来源 |
|---|---|---|
| 主仓代码 SHA | `02047b1e`（main，2026-11-07，PR #1197）；`266bfc0a`（PR #1198）已合并到 **`origin/main`**，但本机 `main` 落后 1 个提交（停在 `02047b1e`）→ 执行验收前先 `git fetch` 并核对 | 本机 `git log -1`（2026-11-07）；`goal-8/evidence/realmachine-verification.md:326–330` |
| 客户端版本 | `1.4.13`（真机矩阵 iframe 参数为 `1.4.13+local`） | `apps/client/package.json:3`；`goal-8/evidence/games-matrix.json:17` |
| 后端仓库 SHA | ocr-service `56ae174`（分支 `feat/t11-data-authz`，2026-11-07；含 T10 `1c02363`、T09 回填 `1ea15ef`） | ocr-service 本机 `git log`（2026-11-07） |
| 后端线上镜像 | **未核实**（以 NAS 该目录 `compose.yaml` 为准；本次不访问 NAS） | `fdl-server/docs/nas/services/README.md:80`（panda-club 仓） |
| IdP（Casdoor）版本 | 口径 4.20；issuer `https://sso.hbut.site`、组织 `fdl-users`、JWKS 单 key `kid=cert-built-in`（RS256）；**部署镜像摘要：未核实（未取得）** | `goal-9/plan.md:20`；ocr-service `docs/t09-casdoor-contract-matrix.md:15–19,84` |
| 设备与系统 | Windows 本机（WebView2 + CDP 9222）；**Android/iOS：无设备，未验证**（Android 复测需 `ADB_LIBUSB=1`，`adb devices` 无设备） | `goal-8/evidence/realmachine-verification.md:3–5`；`apps/client/src-tauri/docs/module_platform_matrix.md:11–12,35` |
| 构建渠道 | 客户端：本地 debug（`npx tauri dev`）/ GitHub Actions CI；模块：官方构建脚本 `scripts/build_website_modules.mjs` + 本地静态 CDN；ocr-service：Docker（`python:3.10-slim`，build-arg `APP_BUILD_SHA`） | `goal-8/evidence/realmachine-verification.md:3,222–225`；ocr-service `Dockerfile:5,16` |
| 账号类型 | 见 §2 各行；取值：校园学号账号 / Casdoor 组织管理员（`fdl-users`，`isGlobalAdmin=false`）/ Casdoor 合成测试用户（已删）/ 模块身份（4398 origin）/ 无账号 | `ocr-service/docs/t09-casdoor-contract-matrix.md:119` |

## 2. 验收矩阵（验收项 2–8）

> 列：验收项 | 代码 SHA | 后端/IdP 版本 | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期。
> 代码 SHA 缩写：`M=02047b1e`（主仓 main）；`B=b6e1ffd8`（#1196 模块运行时修复）；`O=56ae174`（ocr-service）；`O10=1c02363`（T10）。
> 平台取值：Win=Windows 真机；Web=浏览器（Casdoor 实例）；And/iOS=设备。

### A2 模块链路与网页身份链路（验收项 2）

| 验收项 | 代码 SHA | 后端/IdP | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A2-1 模块发现（目录/清单） | M | — | Win | debug+本地静态 CDN | 无账号 | 本地 CDN 取 catalog/manifest | 12 模块（11 游戏+more_panel）可解析 | **通过**（2026-11-06，实测版本 `afd08984`） | `goal-8/evidence/realmachine-verification.md:222–225,254–256` | 待登记 | 2026-11-07 |
| A2-2 可信加载（签名 prepare） | M | — | Win | 同上 | 模块身份 | `POST /module_bundle/prepare`（签名清单） | `success=true, trusted=true`，`source=download→cache` | **通过**（2026-11-06，`afd08984`） | `realmachine-verification.md:32–34,162–163` | 待登记 | 2026-11-07 |
| A2-3 用户授权（信任由 Rust 判定） | B | — | Win | 同上 | 模块身份 | 缓存已验签清单重新验签；前端自报无效 | 前端自报 `trusted` 不生效 | **通过**（真机+契约；2026-11-06） | `realmachine-verification.md:87–89`；`module_platform_matrix.md:22–23` | 待登记 | 2026-11-07 |
| A2-4 只读数据（受控请求） | B | — | Win | 同上 | 模块身份+校园会话 | `school.portal_client_ip`/`getPageView` 受控链路 | 200 真实 JSON 回传模块 | **通过**（2026-11-06） | `realmachine-verification.md:146–150`；`module_platform_matrix.md:9` | 待登记 | 2026-11-07 |
| A2-5 模块更新（同版本重发布） | B | — | Win | 同上 | 模块身份 | 同 version 新 seq/sha 重发布 → prepare | 丢弃缓存重新下载，不卡死 | **通过**（2026-11-06 第二轮修复后实测） | `realmachine-verification.md:162` | 待登记 | 2026-11-07 |
| A2-6 模块回退（固定回退规则） | M | — | Win | — | 模块身份 | 按固定规则回退到已验证版本 | 可用 | **未测**（契约有：`mini-hbut-migration-plan-2026-11-01.md:96`；未发现专项真机证据） | — | 待登记 | — |
| A2-7 网页登录（授权码+PKCE） | O | Casdoor 4.20（口径） | Web | 真机浏览器（Edge） | Casdoor 组织管理员 | PKCE S256 全流程 | 200 Bearer；`iss/aud` 正确；学号 claim 注入 | **通过**（2026-11-07 真机） | `ocr-service/docs/t09-casdoor-contract-matrix.md:44–47,85,105–107` | 待登记 | 2026-11-07 |
| A2-8 网页扫码 / device flow | O | Casdoor 4.20（口径） | Web | 同上 | 同上 | `POST /api/device-auth` | 流程可用 | **失败（实测：明确不可用）**——`device login is not enabled`，需服务端开启 | `t09-casdoor-contract-matrix.md:88`（5.1#5）；`goal-9/plan.md:94` | 待登记 | 2026-11-07 |
| A2-9 绑定（上游建号+properties） | O10 | Casdoor 4.20（口径） | Web | 契约测试+真机 | 组织管理员+合成用户 | 幂等 upsert `Name=hbut_<学号>`+4 键 properties | 建号成功、属性写入、幂等 | **部分通过**：`add-user`/`get-user` 真机可用；「关闭注册后由上游建号」未测；`update-group` 被拒有回退路径 | `t09-casdoor-contract-matrix.md:87,120,122–123`；`goal-9/tasks.md:67–84` | 待登记 | 2026-11-07 |
| A2-10 刷新与轮换 | O | Casdoor 4.20（口径） | Web | 真机 | 同上 | `refresh_token` | 200 且轮换；旧 AT/RT 立即失效 | **通过**（2026-11-07 真机） | `t09-casdoor-contract-matrix.md:47,85,124` | 待登记 | 2026-11-07 |
| A2-11 撤销 | O | Casdoor 4.20（口径） | Web | — | — | 撤销授权 | 确定性拒绝/成功 | **未测**（discovery 无 `revocation_endpoint`；只能靠 TTL+服务端会话表） | `t09-casdoor-contract-matrix.md:24,50`；`goal-9/plan.md:111` | 待登记 | — |

### A3 故障与恢复（验收项 3）

| 验收项 | 代码 SHA | 后端/IdP | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A3-1 断网 | M | — | Win/Web | — | 校园账号 | 断网后继续使用 | 学校本地功能+离线缓存可用；云身份功能明确提示不可用原因 | **未测**（真机） | `mini-hbut-migration-plan-2026-11-01.md:49` | 待登记 | — |
| A3-2 弱网 | M | — | Win/Web | — | 校园账号 | 弱网（限速/高延迟） | 按设计的超时/降级行为 | **未测** | `mini-hbut-migration-plan-2026-11-01.md:138`（T08 验收范围） | 待登记 | — |
| A3-3 NAS 不可用 | M+O | ocr-service 停止 | 全 | — | 校园账号 | 停 `fdl-ocr-service`（需 FDL 执行） | 学校本地+离线缓存不整体失效；身份功能 fail-closed | **未测**（NAS 未操作） | `mini-hbut-migration-plan-2026-11-01.md:49,144` | 待登记 | — |
| A3-4 Casdoor 不可用 | M+O | sso.hbut.site 不可达 | 全 | — | — | Casdoor 宕机/断网 | 同上；不创建默认开启应用，不依赖 Casdoor 在线 | **未测** | `mini-hbut-migration-plan-2026-11-01.md:118,152` | 待登记 | — |
| A3-5 后台恢复 | M | — | And/iOS | — | — | App 切后台再回前台 | 会话/模块状态恢复 | **未测**（无设备） | `mini-hbut-migration-plan-2026-11-01.md:137`（T07 暂停/恢复） | 待登记 | — |
| A3-6 过期会话 | M+O | Casdoor 4.20（口径） | Web | — | — | AT 过期后调业务 API | 401 → 客户端单飞刷新 → 成功 | **未测**（真机；契约事实：AT 有状态、轮换即时失效） | `t09-casdoor-contract-matrix.md:124` | 待登记 | — |
| A3-7 切账号 | M | — | Win | debug | 校园账号 A/B | 切换账号 | 旧实例授权/在途请求/缓存失效（实例 4 触发点） | **未测**（真机；契约：T07 实例生命周期 4 触发点） | `goal-8/evidence/epic-1161-phase2-report.md:6`；`mini-hbut-migration-plan-2026-11-01.md:87` | 待登记 | — |
| A3-8 坏包（未签名/恶意 ZIP） | B | — | Win | debug | 模块身份 | 篡改 manifest/包体 → prepare | 拒绝安装；不回退到未验签路径 | **通过**（契约测试+真机 prepare 拒绝；release 安装即拒） | `epic-1161-phase2-report.md:6,34,58–60`；`mini-hbut-migration-plan-2026-11-01.md:181` | 待登记 | 2026-11-07 |
| A3-9 密钥轮换 | O | Casdoor 4.20（口径） | Web | — | — | 轮换 JWKS/签名密钥 | kid 切换策略可用，旧 key 不被信任 | **未测**（blocked：需管理员操作；当前单 key `cert-built-in`） | `t09-casdoor-contract-matrix.md:38,90` | 待登记 | — |

### A4 安全负向（验收项 4）

| 验收项 | 代码 SHA | 后端/IdP | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A4-1 模块直接桥越权 | B | — | Win | debug | 模块身份（4398 origin 伪造） | 模块上下文 fetch `/sync_grades`、`/library/dict`、`/module_bundle/prepare` | 401/跨源拦截，无 200 数据 | **通过**（2026-11-06 真机 14 项负向） | `realmachine-verification.md:47–49,174–179`；`module_platform_matrix.md:30` | 待登记 | 2026-11-07 |
| A4-2 模块直接 IPC（invoke） | B | — | Win | debug | 模块身份 | 模块内 `invoke('bridge_session_token')` | 永不 settle；主机未执行 | **通过**（CSP 拦 `ipc.localhost` + 哨兵日志对照） | `realmachine-verification.md:53,62–72,179` | 待登记 | 2026-11-07 |
| A4-2b 应用命令 ACL 收窄 | B | — | Win | debug | 模块身份 | 模块窗口 invoke 应用命令（`AppManifest` 259 命令声明 + 仅 main 窗口授权） | 未授权命令被拒 | **通过**（契约守门 `check:module-platform`+真机抽查）；**残余**：主窗口 XSS 时 259 命令仍可达（未根治） | `module_platform_matrix.md:37–49`；`epic-1161-phase2-report.md:57–60` | 待登记 | 2026-11-07 |
| A4-3 读父页/cookie | B | — | Win | debug | 模块身份 | `parent.document/location`、`document.cookie` | SecurityError / 长度 0 | **通过**（2026-11-06 真机） | `realmachine-verification.md:50–51,180–183` | 待登记 | 2026-11-07 |
| A4-4 跨用户数据 | O | — | Web | 契约测试（假 Casdoor） | 两个合成用户 | A 读 B 数据 / body 带他入学号 | 403 | **通过**（契约测试；真机未测） | `ocr-service/docs/identity_auth_rollout.md:159` | 待登记 | 2026-11-07 |
| A4-5 撤权（数据授权） | O | — | Web | 契约测试 | 合成用户 | 撤销同意后旧 token 读数据 | 拒绝 | **未测**（T11 默认拒绝契约存在，未真机/真用户验证；goal-9 表 T4 状态 ⬜） | `goal-9/tasks.md:18,23`；ocr-service 提交 `56ae174` 说明 | 待登记 | — |
| A4-6 错 issuer / aud | O | Casdoor 4.20（口径） | Web | 契约测试 | — | 改 token `iss`/`aud` | 401，绝不降级放行 | **通过**（契约测试；双轨验签形状分流） | `ocr-service/docs/identity_auth_rollout.md:41–55`；`t09-casdoor-contract-matrix.md:42–50` | 待登记 | 2026-11-07 |
| A4-7 HMAC 旁路（legacy 自签发） | O10 | — | Web | 契约测试（21 例） | 无账号/自报学号 | 旧 HMAC / 无 Bearer / 自报学号取管理员 | 拒绝（`FORUM_LEGACY_SELF_ISSUE` 默认 false = fail closed） | **通过**（契约 21 例；真机旧窗口观察未测） | `goal-9/tasks.md:170–181`；`t09-casdoor-contract-matrix.md:123` | 待登记 | 2026-11-07 |
| A4-8 日志无敏感信息 | O | — | Web | 契约测试（断言日志不含 secret/token/断言/学号原文） | — | 检查日志输出 | 无敏感原文 | **通过**（契约测试断言；59 例含日志守卫） | `goal-9/tasks.md:107,146`；`goal-9/evidence/pr-t10.md`（secret 绝不进日志） | 待登记 | 2026-11-07 |

### A5 学校本地功能与旧客户端（验收项 5）

| 验收项 | 代码 SHA | 后端/IdP | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A5-1 学校本地功能+离线缓存不整体失效 | M | — | Win/Web | — | 校园账号 | 统一身份不可用时用查成绩/课表/离线缓存 | 不整体失效；明确提示 | **未测**（真机） | `mini-hbut-migration-plan-2026-11-01.md:49,113` | 待登记 | — |
| A5-2 旧客户端兼容/升级提示 | O | — | Web/Win | — | 旧客户端（legacy token） | `LEGACY_GRACE=false` 后旧 token 调 API | 401 + 明确中文升级提示，不 500 | **未测**（真机；契约：Rollout 第 5 步 + 风险表） | `ocr-service/docs/identity_auth_rollout.md:67–72,150` | 待登记 | — |

### A6 游戏 / 图书馆嵌入 / 关键登录与离线回归（验收项 6，复用既有证据）

| 验收项 | 代码 SHA | 后端/IdP | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A6-1 11 游戏真机矩阵 | M（实测时 `afd08984`） | — | Win | debug+官方构建产物+本地静态 CDN | 模块身份 | `goal8-games-matrix.mjs`：prepare→强制 remount→握手诊断 | 10/11 完成 `hello_accepted→welcome_sent→mode_reported`；`hbut_gomoku` 按契约不适用（不 import SDK，票据走 URL `gpt` 参数） | **通过**（ok=10 / n/a=1 / fail=0，2026-11-06）；**版本差异**：实测 `afd08984` ≠ 现 main `02047b1e`（差 2 个契约修复提交，不涉握手链路，复跑确认） | `goal-8/evidence/games-matrix.json:2–9,147–148`；`module_platform_matrix.md:31` | 待登记 | 2026-11-07 |
| A6-2 票据兑换（真实环境） | M | — | Win | debug（DEV 缝） | 模块身份 | `request-ticket` | 返回 `gpt_…` 票 | **真实链路未通过**（三层阻塞：`allowed_game_origins` 空 / canary 未纳入 / 设备未注册 404）；DEV 桩链路通过 | `realmachine-verification.md:271–322`；`module_platform_matrix.md:33` | 待登记 | 2026-11-07 |
| A6-3 图书馆嵌入（超星官方页） | M | — | Win | — | 校园账号 | `LibraryReserveEmbed` 三分支（子 WebView+cookie / 代理 iframe / 外部打开） | 嵌入可用、cookie 注入有效 | **未测**（本仓未发现专项真机证据；代码路径存在） | `apps/client/src/components/library-reserve/LibraryReserveEmbed.vue:8–14`；`mini-hbut-migration-plan-2026-11-01.md:32,72` | 待登记 | — |
| A6-4 关键登录/学校会话回归 | M | — | Win | debug | 校园账号 | 正常登录、取数、主窗口业务链路 | 200，无回归 | **部分通过**（真机 P4「主窗口业务链路不受影响」通过；全量功能未逐条） | `realmachine-verification.md:27`；`goal-8/evidence/s8-negative-test-recipe.md:253,279` | 待登记 | 2026-11-07 |
| A6-5 离线回归（fetchWithCache 快速路径） | M | — | Win/Web | — | — | 断网用缓存（fresh/stale/noCache） | 立即返回、不 hang | **未测**（身份迁移语境下） | `mini-hbut-migration-plan-2026-11-01.md:49` | 待登记 | — |

### A7 回退 / 预退役 / 对账 / 观察（验收项 7）

| 验收项 | 代码 SHA | 后端/IdP | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A7-1 回退演练（NAS 镜像 `:rollback`） | O | — | NAS（Win 观察） | FDL 执行 | — | 换回旧镜像 tag+重启+`/health` 校验 | 回到部署前行为 | **未测**（NAS 未操作） | `goal-9/plan.md:82`；`panda_bot/docs/nas_compose.md:123–136` | 待登记 | — |
| A7-2 回退演练（代码开关） | O | — | Web | — | — | 关闭 `MINI_HBUT_*_ENABLED` / 重开 `LEGACY_GRACE=true` | 行为与部署前逐字节一致 | **未测**（未部署）；契约：开关默认关、重开即回现状 | `goal-9/plan.md:81`；`ocr-service/docs/identity_auth_rollout.md:70–72` | 待登记 | — |
| A7-3 预退役风险清单 | — | — | — | — | — | 全范围预退役审查 | 风险清单冻结并逐项闭环 | **未完成**（T14 结束前必须完成） | `mini-hbut-migration-plan-2026-11-01.md:206–207` | 待登记 | — |
| A7-4 数据一致性对账 | O | — | Web | — | — | 行数 + 抽样字段哈希 + 关键聚合双向核对 | 一致 | **未测**（方法已定，未执行） | `panda-club/fdl-server/docs/archive/2026-10-02-ocr-service上NAS与全PG化重构实施方案.md:192`；`goal-9/plan.md:109` | 待登记 | — |
| A7-5 上线观察阈值 | O | Casdoor 4.20（口径） | Web | — | — | 观察 6 个 auth 指标 + `/health` + 登录成功率 | 无异常抬升 | **未执行**（阈值已定：`/health` 不健康、指标异常比例、登录成功率下降 → 立即回滚并停止灰度） | `ocr-service/docs/identity_auth_rollout.md:62–72,81–88`；`goal-9/plan.md:84` | 待登记 | — |

### A8 类型检查 / 构建 / 相关测试 / 设备证据（验收项 8）

| 验收项 | 代码 SHA | 后端/IdP | 平台 | 构建渠道 | 账号类型 | 方法 | 期望 | 实际结果 | 证据 | 负责人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A8-1 typecheck | M | — | Win | 本地 | — | `npm run typecheck`（`vue-tsc --noEmit`） | 0 错误 | **通过**（#1197 时） | `realmachine-verification.md:267`；`apps/client/package.json:56` | 待登记 | 2026-11-07 |
| A8-2 test:ci | M | — | Win | 本地 | — | `npm run test:ci`（vitest） | 全过 | **通过**（3908 passed @#1197；3911 passed @#1198 合并后） | `realmachine-verification.md:267,328`；`apps/client/package.json:48` | 待登记 | 2026-11-07 |
| A8-3 build | M | — | Win | 本地 | — | `npm run build`（vite build） | 0 错误 | **通过**（#1197 时） | `realmachine-verification.md:267`；`apps/client/package.json:12` | 待登记 | 2026-11-07 |
| A8-4 Rust cargo test --lib | B | — | Win | 本地 | — | `cargo test --lib`（CI 同命令 `--manifest-path apps/client/src-tauri/Cargo.toml --lib`） | 全过 | **通过**（709 passed，#1196 第二轮时） | `realmachine-verification.md:202`；`.github/workflows/ci.yml:239` | 待登记 | 2026-11-07 |
| A8-5 CI（PR Gate 11 项） | B/M | — | GitHub Actions | CI | — | test-frontend / test-rust（linux/win/mac）/ rustsec / build-and-smoke / Analyze / secret-guard / npm-lockfiles / changes / PR Gate | 全绿 | **通过**（#1196/#1197 时） | `realmachine-verification.md:193–194,265–266` | 待登记 | 2026-11-07 |
| A8-6 ocr-service pytest | O | — | Win | 本地 | — | `python -m pytest tests -q` | 全过 | **通过**（1542 passed / 30 skipped，大检查 1 时分支；`feat/t11-data-authz` 分支未重跑，**未核实**） | `goal-9/tasks.md:141–142` | 待登记 | 2026-11-07 |
| A8-7 设备证据 | — | — | Win / And / iOS | — | — | Windows 真机（HTTP bridge + CDP 9222）；Android/iOS 设备 | Windows 有设备证据；And/iOS 无 | **Win：通过**（证据齐全）；**And/iOS：未验证**（无设备） | `realmachine-verification.md:3–5,109–130`；`module_platform_matrix.md:11–12,35` | 待登记 | 2026-11-07 |
| A8-8 check:module-platform | M | — | Win | 本地 | — | `npm run check:module-platform`（命令授权一致性+签名材料） | 通过 | **通过**（#1197/#1198 时） | `realmachine-verification.md:267,328`；`apps/client/package.json:25` | 待登记 | 2026-11-07 |

## 3. 既有证据来源清单（引用前必读）

| 证据 | 路径（仓库） | 实测版本/日期 | 可用范围 | 不可用于 |
|---|---|---|---|---|
| 11 游戏真机矩阵 | `goal-8/evidence/games-matrix.json`（tauri-app） | `afd08984`，2026-11-06，v1.4.13+local | Windows debug 下 11 游戏握手/降级 | 票据兑换真实链路；And/iOS；当前 main 复跑 |
| 模块运行时真机验证（四轮） | `goal-8/evidence/realmachine-verification.md` | `afd08984`→`b6e1ffd8`→`266bfc0a`，2026-11-06/07 | 端口矩阵/签名/沙箱/负向/受控请求/票据 DEV 链路 | NAS/生产；And/iOS |
| 平台降级矩阵（T07） | `apps/client/src-tauri/docs/module_platform_matrix.md` | 2026-11-05 建，11-06 更新 | 平台状态三态标注（Win 已验 / macOS、And、iOS unverified） | — |
| 阶段 2 交付报告 | `goal-8/evidence/epic-1161-phase2-report.md` | `afd08984`，2026-11-06 | T04–T08 交付与 G-D/G-E/G-F 检查结论 | — |
| 负向测试手册（S8） | `goal-8/evidence/s8-negative-test-recipe.md` | t04 worktree，2026-11-05 | 4 负向+4 正向用例操作法 | — |
| 票据链 DEV 验证 | `goal-8/evidence/ticket-chain.json` + `realmachine-verification.md:271–330` | 2026-11-07 | DEV 桩下票据链路 | 真实设备/会话 |
| T09 Casdoor 契约矩阵+真机补测 | `docs/t09-casdoor-contract-matrix.md`（ocr-service） | Casdoor 口径 4.20，2026-11-07 | PKCE/refresh/学号 claim/权限边界/device flow 不可用 | 镜像摘要（未取得）；JWT-Bearer 端到端 |
| T10 交付（PR #7） | `goal-9/evidence/pr-t10.md`（tauri-app） | ocr-service `1c02363`，2026-11-07 | 建号/断言/引导 59 例契约测试 | 真机端到端（机器凭据未取得） |
| T14 定义与验证方法 | `docs/architecture/mini-hbut-migration-plan-2026-11-01.md:144,184–187` | 2026-11-01 | 验收口径 | — |

> 注意：任务背景提到的 `docs/architecture/module_platform_matrix.md` **在该路径不存在**；实际文件为
> `apps/client/src-tauri/docs/module_platform_matrix.md`（见上表）与 `goal-8/evidence/games-matrix.json`。

## 4. 如何执行一次验收（步骤）

> 纪律：单进程 ≤60s（R3）；在 `origin/main` 的**独立 worktree** 执行（本地 main 曾落后 21 个提交，教训见 `realmachine-verification.md:9–11`）。

| 步 | 步骤 | 命令（工作目录） | 超时处理 | 本机可否 |
|---|---|---|---|---|
| 0 | 建独立 worktree：`git worktree add <dir> origin/main -b verify/t14-acceptance`；junction `node_modules`+`apps/client/node_modules`；`CARGO_TARGET_DIR` 复用主仓 target | （git） | — | ✅ |
| 1 | 客户端类型检查 | `npm run typecheck`（apps/client） | ≤60s；超时记失败并拆分 tsconfig 子集 | ✅ |
| 2 | 前端 CI 测试 | `npm run test:ci`（apps/client） | 全量可能 >60s → 按 spec 文件拆分为多次运行，每次单独计时 | ✅ |
| 3 | 前端构建 | `npm run build`（apps/client） | 长构建单列（不计 60s 判定），失败即停 | ✅ |
| 4 | 模块平台门禁 | `npm run check:module-platform`（apps/client） | ≤60s | ✅ |
| 5 | Rust 库测试 | `cargo test --manifest-path apps/client/src-tauri/Cargo.toml --lib`（仓库根；CI 同命令 `ci.yml:239`） | 编译另计；测试阶段 ≤60s 内按模块拆 | ✅ |
| 6 | 后端测试 | `python -m pytest tests/test_casdoor_provisioning.py tests/test_identity_assertion_bootstrap.py tests/test_identity_bootstrap_routes.py -q`（ocr-service） | 按文件拆，单文件 ≤60s | ✅（仅契约/假 Casdoor；真机 e2e 否） |
| 7 | Windows 真机：模块+游戏+负向 | 起 `target/debug/hbut-helper.exe`（跳过 watcher，`realmachine-verification.md:11–14`）+ 本地静态 CDN（`tools/goal8-static-cdn.mjs --port 8899`）；HTTP bridge（`HBUT_BRIDGE_TOKEN`）+ CDP 9222；跑 S8 四负向、11 游戏矩阵、受控请求 | 单用例 ≤60s；矩阵逐游戏拆 | ✅（Windows） |
| 8 | 网页/Casdoor：PKCE+refresh+负例 | 回环回调接收器 + `t09-node-check.mjs`（`ocr-service/docs/t09-casdoor-contract-matrix.md:145–151`） | 单步 ≤60s（浏览器 evaluate 超时会吞授权码，纪律见该文件 154 行） | ⚠️ 需真实 Casdoor 会话；device flow 因未启用必失败 |
| 9 | NAS 部署/回滚/身份 e2e | 见 `docs/architecture/nas-identity-deploy-runbook.md` | — | ❌ 本机无 SSH（09-22 快照 `ssh_enable=0`，仅 SFTP 2222）；由 FDL/用户执行 |
| 10 | 回填本矩阵 | 更新 §2 各行的实际结果/证据/日期 | — | ✅ |

**本机无法完成**：Android/iOS 设备测试（无设备，R1）；NAS 执行（无 shell 通道）；Casdoor 机器凭据端到端建号+换令牌（凭据在 NAS `secrets/`，未取得）；device flow（服务端未启用，A2-8）。

## 5. 未核实 / 待办清单

| # | 事项 | 状态 | 解除条件 |
|---|---|---|---|
| 1 | 任务背景所指 `docs/architecture/module_platform_matrix.md` 路径 | **不存在**（实际在 `apps/client/src-tauri/docs/`） | 按实际路径引用 |
| 2 | `266bfc0a`（PR #1198）与本地 main 的关系 | 已在 `origin/main`（HEAD）；本机 `main` 停在 `02047b1e`，落后 1 个提交 | `git fetch` 后核对 origin/main |
| 3 | ocr-service 线上镜像 tag/digest | **未核实** | NAS 上 `docker image inspect`（FDL） |
| 4 | Casdoor 部署镜像摘要 | **未核实**（仅口径 4.20） | FDL 提供 |
| 5 | 图书馆嵌入专项真机回归 | **未发现证据**（未测） | 按 A6-3 方法跑 |
| 6 | Android/iOS 全部平台行 | **未验证** | 设备到位 |
| 7 | 端到端建号+换令牌（机器凭据） | **未测**（blocked） | 取得 NAS `secrets/` 机器凭据 |
| 8 | JWT-Bearer 换令牌、token-exchange、密钥轮换、group 撤权 | **未测**（blocked，T09 矩阵 §5.1#5/6/7） | 全局管理员/能改应用 |
| 9 | 旧客户端升级提示真机、离线缓存（迁移语境）、回退演练、对账、灰度观察 | **未测/未执行** | A7 各行按方法执行 |
| 10 | ocr-service `feat/t11-data-authz` 分支全量 pytest | **未在本分支重跑**（历史数 1542/30） | 本机重跑 |
| 11 | A2-6 模块回退、A3-1/2/3/4/5/6/7 故障演练 | **未测**（无 NAS/无设备/未演练） | 按 A3 方法执行 |
| 12 | A4-5 撤权真机（T11） | **未测**（goal-9 表 T4 状态 ⬜，代码已在分支） | T11 完成后真机 |
