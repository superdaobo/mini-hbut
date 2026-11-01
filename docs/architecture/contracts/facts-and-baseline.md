# 事实基线与跨端能力矩阵（T01-A · Epic #1161 / Issue #1162）

> 版本：v1（2026-11-01）。作者：Mini-HBUT 客户端维护者（统筹者）。
> 姊妹文档：[模块与授权公共契约](./module-and-auth-contracts.md)（T01-B 产出）；背景材料：[10-30 架构现状与迁移需求说明](../mini-hbut-architecture-and-migration-requirements.md)、[11-01 迁移与模块运行时重新规划](../mini-hbut-migration-plan-2026-11-01.md)。
>
> **状态图例（全文统一）**
> - `已核实`：本仓库代码或本机命令可复现，本文给了 `file:line` 或命令。
> - `已定目标`：讨论结论明确要这么做，但代码尚未实现。
> - `待实测`：需要真机/真实部署/管理员凭据才能确认，当前不标通过。
> - `待决策`：需要人工拍板，未定前相关能力保持关闭。
>
> **能力矩阵取值**：只有 `supported / unsupported / unverified` 三种；`unverified` 包含「代码路径存在但未实测」与「完全无证据」两类，具体差别写在「证据」列。**没有实测证据的格子一律不是 `supported`。**

---

## 1. 代码与部署基线

| 项 | 值 | 状态 | 证据 |
|---|---|---|---|
| 主仓 | `superdaobo/mini-hbut` | 已核实 | — |
| 主仓基线 SHA | `3e2ce731b0ec5c8dd41c5ffe672c7b155bcbd925` | 已核实 | `git rev-parse origin/main`（2026-11-01）；Epic 记录的 `c520a9b6` 已落后 2 个离线 epic 提交，本轮一律以此 SHA 为准 |
| 后端 | `superdaobo/OCR-services`（PRIVATE） | 已核实 | 本地检出 `D:\Documents\C_learn\成绩查询\ocr-service` |
| 后端基线 SHA | `82706b212f01b6ad41e78bc8ba718d7585ca15fd` | 已核实 | `git rev-parse origin/main`，与 Epic §13 一致 |
| 生产部署镜像 | 未核对 | **待实测** | 仓库代码不能证明生产已启用/关闭某条路径（Epic §13 明确） |
| Casdoor 部署 | `https://sso.hbut.site` | 已核实（元数据） | `GET /.well-known/openid-configuration` → 200，`issuer=https://sso.hbut.site`、`jwks_uri=/.well-known/jwks`、`device_authorization_endpoint=/api/device-auth`、`registration_endpoint=/api/oauth/register` |
| Casdoor 版本/组织/应用/角色 | 未知 | **待实测** | 需 T09 用测试应用实测（#1165 的 T09） |
| 本机可用平台 | Windows | 已核实 | 本机 `adb devices` 为空；无 macOS/iOS 环境 |

## 2. 背景材料归档状态（#1162 验收 1）

| 材料 | 状态 | 位置 |
|---|---|---|
| 10-30《架构现状与迁移需求说明》 | **本 PR 首次入库** | `docs/architecture/mini-hbut-architecture-and-migration-requirements.md`（1228 行） |
| 11-01《客户端架构升级评审／迁移规划》 | **本 PR 首次入库** | `docs/architecture/mini-hbut-migration-plan-2026-11-01.md`（215 行） |
| 10-31《身份平台迁 Casdoor 评估》原文 | **未入库**（缺口） | 仅在讨论归档 zip 内；归档 SHA256 `5be2db0c…c40c` 记录于 11-01 规划 §1 |
| `讨论.md` 原始对话 | **未入库**（缺口） | 同上；已知不得依赖发起者本机 `D:\Download` |

- 上述两份文档此前只存在于工作区未跟踪状态，其他 Agent 无法通过仓库读取 —— 这正是 #1162 要解决的问题；本 PR 将其纳入版本控制。
- 10-31 评估的结论性内容已被 11-01 规划 §1.1/§1.2 与 §6 吸收（Casdoor 兼容性、平台能力、签名保管等），因此**不阻塞**后续任务；原文归档列为缺口，待负责人补充或明确不补。
- R1–R9 需求追踪的现有落点：需求文档 §5.2（R1–R9 逐条）＋ 11-01 规划 §4（任务映射）。正式追踪表在 T01-B 冻结。

## 3. 跨端能力矩阵（#1162 验收 3）

四个能力维度：**加载**（模块内容如何在客户端内呈现）、**桥**（本地 HTTP Bridge 可用性）、**IPC**（页面调用 Rust 命令的通道）、**更新**（不重装客户端即可更新模块）。

| 平台 | 加载 | 桥 | IPC | 更新 | 证据 |
|---|---|---|---|---|---|
| Windows（桌面 Release） | `unverified` | `unverified` | `unverified` | `unverified` | 加载：本地预览 iframe `apps/client/src/components/MoreModuleHostView.vue:783`＋`apps/client/src-tauri/src/modules/module_bundle.rs:214`（静态）；桥：Release 默认关闭，需 `HBUT_HTTP_BRIDGE_ENABLED`（`apps/client/src-tauri/src/http_server/mod.rs:50-56`，静态）；IPC：仅 `main` 窗口有 capability（`apps/client/src-tauri/capabilities/main.json`，静态）；更新：`module_bundle` 可准备/校验包，但**无发布者签名**（`apps/client/src-tauri/src/modules/module_bundle.rs:29-30` 的 `#[serde(default)] package_sha256`、`:502-509` 仅非空才比对）。三者均未在本机跑真实 App 验证 → unverified |
| Windows（Debug/dev） | `unverified` | `unverified` | `unverified` | `unverified` | 桥默认开启（`cfg!(debug_assertions)`，`apps/client/src-tauri/src/http_server/mod.rs:51`，静态）；其余同上 |
| macOS | `unverified` | `unverified` | `unverified` | `unverified` | 无环境，无法验证；代码路径与桌面分支共享（`apps/client/src-tauri/src/lib.rs:196-225` 的平台分支仅区分 mobile/desktop） |
| Android | `unverified` | `unsupported`（非 Debug 构建） | `unverified` | `unverified` | 加载：**排除本地桥预览**，走远端 iframe（`apps/client/src/utils/more_modules/core.js:50`）；桥：`is_http_bridge_enabled()` 只含 debug/iOS/env，不含 Android（`apps/client/src-tauri/src/http_server/mod.rs:50-56`）；构建链确为 Tauri（`.github/workflows/release.yml:232` `npm run tauri android init`） |
| iOS | `unverified` | `unverified` | `unverified` | `unverified` | 桥因内嵌页面依赖默认开启（`apps/client/src-tauri/src/http_server/mod.rs:52` `cfg!(target_os = "ios")`，静态）；构建链为 Tauri（`.github/workflows/ios-testflight.yml:170` `npm exec -- tauri --version`） |
| 商店版（iOS/其他合规构建） | `unverified` | `unverified` | `unverified` | `unsupported`（主壳整包热更） | 合规构建按会话裁决：非合规构建不收紧；合规＋演示会话→收紧；**合规＋真实已登录→全功能**（`apps/client/src/config/app_store_policy.ts:99-108`）；远程模块/热更各有开关（`apps/client/src/config/app_store_policy.ts:380,385,389` 的 `isRemoteExecutableAllowed/isHotUpdateAllowed/isRemoteModulesAllowed`）。整包热更只有规划函数、无激活器（见 §7） |

**说明（避免误读）**：
1. 「桥 = unsupported（Android Release）」是**当前默认配置**的结论，管理员可通过 `HBUT_HTTP_BRIDGE_ENABLED=1` 打开；这属于「默认关闭」而非「平台不支持」。
2. 本表所有 `unverified` 都要在 T08/T14 用真机或真实安装包升级为 `supported`；Windows 的格子会在 T02 落地后由统筹者在真实 App 上做一次冒烟（桥相关）并就地更新本表。
3. 商店版「真实登录后放开」是当前实现事实，**不构成** App Review 合规证明（Epic §10 明令）。

## 4. 五类凭据与信任边界（#1162 验收 5）

| # | 凭据 | 签发/持有方 | 存放位置 | 生命周期 | 谁能读到 | 状态 | 证据 |
|---|---|---|---|---|---|---|---|
| C1 | **学校会话**（教务/门户 Cookie Jar） | 学校系统签发，Rust 持有 | 进程内 Cookie Jar＋应用数据目录的快照文件（**不出设备**） | 会话有效期内；`jw_uf` 实测约 2h，进程内 90 分钟内视为新鲜 | 仅 Rust 原生层；前端只能经受控命令取数据 | 已核实 | `apps/client/src-tauri/src/http_client/session.rs:1-11,20-24` |
| C2 | **统一身份令牌**（Identity AT / Casdoor JWT，目标态） | 设备密钥换票（现状）→ 未来 Casdoor | **仅内存**；设备私钥在 OS keyring（service=`mini-hbut-identity`） | V1 无 refresh：过期即重新走设备签名换票 | 前端 `identity_access_token.ts` 模块级变量；不落盘、不进日志 | 已核实（现状链路） | `apps/client/src/utils/identity_access_token.ts:1-16`、`apps/client/src/utils/identity_device_token.ts:1-20`、`apps/client/src-tauri/Cargo.toml:81-82`（ed25519-dalek + zeroize） |
| C3 | **本地桥凭据** | 客户端进程自行生成 | ① `bridge_token`：进程内随机（每次启动变化）；② `HBUT_BRIDGE_TOKEN`：环境变量；③ `local_agent_token`：`%APPDATA%/mini-hbut/local-agent-token`（64 位 hex）；④ `local_api` JWT：RS256 公钥 `keys/local_api_public.pem` | ①进程生命周期；③持久（跨启动复用）；④见后端签发 | ①**当前没有任何前端通道**（T02 要新建）；③本机同用户进程可读；④任何持有对应私钥者 | ①③④已核实，①的下发通道**待建设** | `http_server/auth.rs:229-233,248-253,299-308`、`apps/client/src-tauri/src/http_server/local_token.rs:3-10`、`apps/client/src-tauri/src/http_server/auth.rs:36-58,81-121`（scope=`cache:read`） |
| C4 | **模块发布签名** | 目标态：离线发布密钥签 Ed25519 清单 | 清单随包分发 | 版本/发布序号；支持撤销与轮换（目标态） | 客户端内置信任根 | **不存在** —— 现状只有可选 `package_sha256`，无发布者身份 | `apps/client/src-tauri/src/modules/module_bundle.rs:29-30`（`#[serde(default)]` 的 `package_sha256`）、`:502-509`（仅当摘要非空才比对） |
| C5 | **游戏 Launch Ticket** | Mini 后端签发 | 仅内存 | 一次性；凭 Identity AT 换取（`POST /tickets`） | 调用方用于拼 iframe URL，不落盘不打印 | 已核实 | `apps/client/src/utils/game_center/api.ts:595-627` |

**互不替代原则（Epic §4 / 11-01 规划 §2.1）**：C1 不能替代 C2；C2 不能替代 C3；C4 只证明「这个包是发布者签的」，不授予任何运行期权限；C5 只对游戏会话有效。任何「用一个凭据换另一个」的实现都必须单独说明并验收。

## 5. 数据出设备的边界

- **学校数据默认留在设备**：C1 只在 Rust 侧使用，前端通过受控命令/桥取数；云端同步是**独立功能**（论坛、云同步、游戏另计），不是默认上传（11-01 规划 §3.4）。
- **Cookie 导出接口**：`/export_cookies` 属 `Protected`（`apps/client/src-tauri/src/http_server/routes/auth.rs:125`），当前受「来源信任」保护，T02 后须凭令牌（本仓库无「Cookie 可以给第三方」的授权）。
- **「Cookie 不出设备」的成文承诺：仓库内未找到原文**（`SECURITY.md`、`README.md`、`docs/**` 均无对应条款）→ **待决策**：若历史文档/对外说明里存在该承诺，T10 的候选方案（一次性服务端核验教务 Cookie）与之冲突，必须先由负责人确认承诺范围，再决定是否实施。**影响 T10，且 T10 在确认前不得开放真实学生自动建号。**
- **境外快照/备用副本**：不得作为学校数据供给来源（Epic §10、11-01 规划 §3.4）→ 影响 T11/T15。

## 6. Casdoor 待实测清单（#1162 验收 6；影响 T09/T10/T11/T13）

| 项 | 当前状态 | 需要什么 |
|---|---|---|
| issuer / jwks / 算法集 / 时间校验 | **元数据已实测**（见 §1） | 已可写入契约；仍需用真实 JWT 验证算法白名单与 kid 轮换 |
| 原生 public 客户端 PKCE 授权码流程 | **待实测** | Casdoor 测试应用（client_id、回调） |
| `sub` / 学号 claim / groups 的实际含义 | **待实测** | 测试账号 + 测试应用 |
| 已有成员绑定、重复绑定、关闭注册后上游建号 | **待实测** | 测试账号 + 管理员 |
| device 流程（App 批准/拒绝/过期/轮询） | **待实测**（端点存在不等于可用） | 管理员 + 测试设备 |
| token exchange（源 client/aud、目标应用、scope） | **待实测** | 两个测试应用 |
| group 撤权与密钥轮换效果 | **待实测** | 管理员 |
| 与现有 `identity_auth` 的 issuer/aud/claim 映射冲突 | **待实测** | 后端测试环境 |

**统一规则**：缺凭据的项一律保持「未验收」，不允许用文档或端点存在代替（Epic §2 场景 C、§10）。

## 7. 整包热更的现状（避免被当成可用能力）

- 存在纯函数 `resolveHotBundleLaunchPlan`（`apps/client/src/utils/hot_update_bootstrap.js:10`），返回「下次启动激活计划」；
- **生产代码无任何调用方**（本机 `grep -rn "resolveHotBundleLaunchPlan" apps/client/src` 除定义文件与其 spec 外无命中）→ 只有 state/manifest 模型与测试，没有启动激活器；
- 因此「整包热更」在矩阵中记为 `unsupported`（主壳更新仍走正式安装包），与 Epic §5「本期不建设整包热更激活器」一致。

## 8. 四项职责划分（原生权限 / 签名清单 / 用户同意 / 业务资源授权）

| 职责 | 现状 | 目标 | 归属 |
|---|---|---|---|
| 原生权限（IPC/桥/文件/网络） | 单一 `main` 窗口 capability 全集（`capabilities/main.json`）；模块窗口 label 为 `more-module-*`，不在该 capability 内（`apps/client/src-tauri/src/modules/module_bundle.rs:584-600`）；前端使用 **210** 个唯一命令名，Rust 侧注册 **238** 项 handler（`tauri::generate_handler!` 条目计数），差异待 T04 精算 | 模块只能拿到显式授予的能力；Rust 做最终判定 | T04（隔离）、T06（受控请求） |
| 签名清单 | 不存在（§4 C4） | Ed25519 清单验签 + 防回放 + 受控回退 | T05 |
| 用户同意 | 不存在（无数据域/同意/撤销模型） | 应用获批数据域 ∩ 用户有效同意 ∩ 操作 ∩ 数据归属 | T11 |
| 业务资源授权 | 现有后端 scope 校验可被空 scope 绕过（OCR#3 已记录） | 每次数据访问可证明是谁/哪个应用/哪个操作 | T11 |

## 9. 两个验收门（#1162 验收 8）

**旧认证止损门（T03 关闭条件）**
1. 合成身份下，「自报学号＋新设备密钥」不能接管既有身份、不能取得他人受保护数据；
2. 坏/过期/跨事务证明不产生部分绑定；论坛自报字段不能取得他人或管理员身份；
3. 旧论坛签发、旧 HMAC、旧 Identity JWT 各自写明支持与停用条件，坏 JWT 不降级；
4. 主仓与后端配对 PR 互链，记录版本组合与部署先后。

**新身份切换门（T13 关闭条件）**
1. 每个被接受 issuer 独立绑定 JWKS/aud/算法/claim/权限规则，未知 issuer 与串 kid 拒绝；
2. 登录/刷新/退出/切账号真实流程可用，资产（论坛帖子、游戏资产、云同步）归属正确；
3. 旧凭据的兼容窗口有明确起止，关闭后无旁路可重新取得；
4. 统一身份不可用时不阻塞仍有效的学校本地功能与离线缓存。

## 10. 事实缺口与待决策（本条是本文件最重要的部分）

| # | 缺口/待决策 | 影响 | 未决时的处理 |
|---|---|---|---|
| G1 | 生产部署镜像未核对 | 所有「生产已启用」类说法 | 一律不写「已上线」，只写代码事实 |
| G2 | 10-31 评估与原始讨论未入库 | T01 追溯完整性 | 已由 11-01 规划 §1.1/§1.2/§6 覆盖结论；原文归档待补 |
| G3 | 「Cookie 不出设备」承诺原文缺失 | T10 | 不开放真实学生自动建号 |
| G4 | Casdoor 实测凭据未到位（用户稍后提供） | T09/T10/T11/T13 | T09 只交可做部分 + 缺口清单 |
| G5 | 三端隔离无实测 | T04/T07/T08 | 未实测平台不授予敏感能力 |
| G6 | 两家新学校接口无协议输入（R8） | T08 后续接入 | 不猜测、不预开放任意 host |
| G7 | `capabilities` 与命令面未逐条对账（238 个已注册 handler vs 前端 210 个唯一命令名，两者集合关系未核对） | T04 | T04 开工第一步做精确对账 |
| G8 | `HBUT_BRIDGE_TOKEN` 是进程级万能钥匙（环境变量一旦设置，任何本机进程可读该变量） | T02/T06 | 保留（CLI 需要），在契约中登记为已知边界 |
