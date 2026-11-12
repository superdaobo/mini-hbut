# 身份 v2 · Casdoor 5 项实测验收矩阵（mini-hbut#1216 / P4-1）

> 采集时间：**2026-11-12**。目标 issuer：`https://sso.hbut.site`（可达，HTTP 200）。
> 采集方式：**curl/探针**——主 agent 只读 curl 探测（GET discovery/JWKS + 无凭据 POST/GET 错误探测，原始输出见 [`docs/architecture/identity-v2-execution-runbook.md`](../architecture/identity-v2-execution-runbook.md) §7.1，证据编号 F1–F13）；探针工具 `casdoor_probes.py` 用于复跑（§4）。
> 复验：2026-11-12 18:28 已把 F1–F13 共 13 条只读探测逐条重跑一遍（F11–F13 用未注册的伪造 `client_id=p41-spoof`），结果与 §7.1 记录完全一致（24 字段 / JWKS 单 key / 200+body error / 401 / 200）。
> **本矩阵采集过程未执行任何 Casdoor 写操作**（未创建/修改/删除任何 Casdoor 对象，未调 admin 写接口）。
> 硬规则遵循 [`docs/qa/t14-cross-platform-acceptance-matrix.md`](t14-cross-platform-acceptance-matrix.md) §0：未测必须写「未测」（R2）、每行必须有证据（R4）、不得伪造通过（R6）、复用旧证据必须标注实测时代码版本（R5）。
> 基线版本：mini 仓 `de0c7181`（分支 `feat/p4-1-casdoor-records`）；ocr-service 本地 `origin/main` `0855392`；采集日 2026-11-12。

## 0. 硬规则（违反即验收无效）

| # | 规则 |
|---|---|
| C1 | 无凭据的项一律「**未测**」/「**部分实测**」，不得写「通过」；证据列必须写清「已测什么、缺什么」 |
| C2 | 每行「结论」必须有证据：文件:行 或原始输出（F1–F13 / 规格 §1 原文）；无证据 = 未测 |
| C3 | 只读外部系统：不得调用 Casdoor 写接口（创建/修改/删除对象） |
| C4 | 零泄露：`client_secret`/令牌原文不得出现在本文档（只允许长度、前 4 字符或掩码） |
| C5 | 真实事实逐条对齐 P4-1 规格 §1，不得自行发挥（例：device flow 只能说「端点存在 + grant 已声明」，不得写「已启用」） |

## 1. 验收矩阵（5 项）

> 列：项 / 结论（通过·不通过·不可用·未测；已测部分与未测部分并存时按规格 §3 写「**部分实测**」，先例见 t14 矩阵 A2-9「部分通过」）/ 证据 / 复跑命令 / 阻塞原因 / 负责人（FDL 配合项已标注）。

| 项 | 结论 | 证据 | 复跑命令 | 阻塞原因 | 负责人 |
|---|---|---|---|---|---|
| 1. `device_grant` device grant 二维码入口 | **部分实测** | **已测**（2026-11-12 无凭据）：F3 端点存在 `/api/device-auth`；F4 discovery 声明 `device_code` grant；F11 伪造 client → 200 + `{"error":"Invalid client_id"}`（错误在 body，状态码 200）。**未测**：用真实 client 拿 `device_code`/`user_code`/`verification_uri`（缺：FDL 已注册 client 凭据） | `python deploy/nas/rehearsal/casdoor_probes.py --mode=live --issuer=https://sso.hbut.site --client-id=<真实> --client-secret=<真实>` | 凭据项阻塞：需 FDL 提供已注册 client | **FDL 配合** + mini 复跑 |
| 2. `token_exchange` token exchange 权限检查 | **部分实测** | **已测**：F4 声明 `token-exchange` grant；F12 伪造 client_id 打 token 端点 → 401 `{"error":"invalid_client","error_description":"client_id is invalid"}`（可分类：客户端无效，**非** `unsupported_grant_type`/`invalid_request`）。**未测**：真实 client + 真实 `subject_token` → 是否返回新 AT 且 aud 正确（缺：真实 client + 真实 subject_token） | 同上（追加真实 `subject_token`，规格 §2） | 同上 | **FDL 配合** + mini 复跑 |
| 3. `token_attributes` Token attributes 改名（`hbut_student_id` / `groups`） | **部分实测** | **已测**：仅记录 `claims_supported` 实际内容——F7 无自定义 scope；F8 未显式列 `groups`、无 `hbut_student_id`。**未测**：真实 AT 调 `/api/userinfo` + 解 id_token → 报告真实 claim 名集合（缺：真实 access token；此项直接决定 `MINI_HBUT_IDENTITY_STUDENT_ID_CLAIM(_FALLBACKS)` / `MINI_HBUT_IDENTITY_ADMIN_GROUP_CLAIM` 填什么） | `python deploy/nas/rehearsal/casdoor_probes.py --mode=live --issuer=https://sso.hbut.site --access-token=<真实 AT>` | 同上 | **FDL 配合** + mini 复跑 |
| 4. `account_linking` 已有账号绑定上游 | **未测** | 未测（无凭据不可测；无既有证据；规格 §1 明确无凭据时「无」可测内容） | `python deploy/nas/rehearsal/casdoor_probes.py --mode=live --issuer=https://sso.hbut.site --admin-token=<admin token>`（`GET /api/get-user?name=...`，只读） | **阻塞：需 FDL 提供 admin token** | **FDL 配合** |
| 5. `registration_off` 关闭注册时上游用户建号 | **未测** | 未测（无凭据不可测；无既有证据；规格 §1 明确无凭据时「无」可测内容） | `python deploy/nas/rehearsal/casdoor_probes.py --mode=live --issuer=https://sso.hbut.site --admin-token=<admin token>`（`GET /api/get-organization`/`get-application`，只读） | **阻塞：需 FDL 提供 admin token** | **FDL 配合** |

> 复跑命令引用的探针工具为 P4-1 agent A 交付物（auth 仓 `deploy/nas/rehearsal/casdoor_probes.py`，分支 `feat/p4-1-casdoor-probes`）；命令按规格 §2 书写，**本矩阵未验证该脚本本身**（见 §4 第 3 条）。

## 2. 配置开关落地（issue 验收③）

> 逐条给「已存在 / 不新增 + 理由」。env 名与默认值均于 2026-11-12 在 ocr-service `identity_auth/config.py`（本地 `origin/main` `0855392`）核对，行号按该版本。

| 开关项 | 结论 | 证据（env 名 / 默认值 / 位置） | 理由与约束 |
|---|---|---|---|
| claim 名可配（学号） | **已存在**（不新增） | `MINI_HBUT_IDENTITY_STUDENT_ID_CLAIM` 默认 `hbut_student_id`；`MINI_HBUT_IDENTITY_STUDENT_ID_CLAIM_FALLBACKS` 默认 `oauth_OIDC_id,student_id` — ocr `identity_auth/config.py:81,83,85,87`（P2-6 `692c35c`，已并入 `origin/main`） | P2-6 已实现；P4-1 凭据实测确定真实 claim 名后**填 env 即可**，无需改代码 |
| claim 名可配（管理员群组） | **已存在**（不新增） | `MINI_HBUT_IDENTITY_ADMIN_GROUP_CLAIM` 默认 `groups` — ocr `identity_auth/config.py:162,166`（P3-3 `166954c`，已并入 `origin/main`） | P3-3 已实现；F8 显示 discovery 未列 `groups`，若真实 claim 名不是 `groups`，填此 env 即可 |
| 签名算法 | **不新增开关** | 客户端 RS256-only：`apps/client/src-tauri/src/identity/oidc_core.rs:551,615-617`（先断言 `header.alg == "RS256"`，`none`/`HS256`/其它一律拒；JWKS 只接受 RSA 公钥）；ocr 侧 `identity_auth/config.py:34` `DEFAULT_ALLOWED_ALGS = "RS256"` | 2026-11-12 实测真实 JWKS 只有 1 个密钥 `alg=RS256`（F10）→ 客户端 RS256-only 与真实一致，无需新增算法开关。**约束：若 Casdoor 改 alg，需同步改客户端（`oidc_core.rs`）并回归**（F9 discovery 虽列 `RS256/RS512/ES256/ES384/ES512`，以 JWKS 实际密钥为准，见 F10） |
| 公有客户端 | **不新增客户端 secret 开关**（改为**部署前提**） | 部署前提：Casdoor 应用必须**可无 secret 换票**（应用侧配置为 public/PKCE）；discovery `token_endpoint_auth_methods_supported` 未声明 `none`（F6） | 桌面端内嵌 `client_secret` = 公开（安全反模式），不得在客户端/仓库内嵌 secret。「无 secret 换票是否被接受」待 FDL 凭据实测（矩阵第 1–2 项）；若 Casdoor 拒绝，正确落点是 **Casdoor 应用侧配置**，不是新增 secret 开关 |
| 自定义 scope | **不使用** | `scopes_supported` 只有标准集（F7：`openid/email/profile/address/phone/offline_access`）；P3-2 `0d93ae7`「数据授权改为 client_id→数据域白名单（scope/同意整体退役）」（只验 `aud`） | P3-2 已退役 scope 授权，与 F7 一致；客户端/服务端不得依赖自定义 scope 做授权；Casdoor 侧亦无自定义 scope 可用 |

## 3. 既有证据来源清单（引用前必读）

| 证据 | 路径（仓库） | 实测版本/日期 | 可用范围 | 不可用于 |
|---|---|---|---|---|
| 13 条真实事实原始输出（F1–F13） | `docs/architecture/identity-v2-execution-runbook.md` §7.1（mini，本矩阵同批回填） | 2026-11-12，`https://sso.hbut.site`，只读 curl | discovery/JWKS 字段值；无凭据错误形状（200+body error / 401） | 凭据项：`device_code` 获取、真实 claim 名集合、admin 只读查询 |
| P4-1 规格（13 事实 + 5 探针 + 复跑命令口径） | `goal-10/evidence/p4-1-casdoor-probes-spec.md`（mini 主仓工作区 `D:\Documents\C_learn\成绩查询\tauri-app`，未入 git） | 2026-11-12 冻结 | 规格口径、探针 I/O 形态、硬约束 | 作为实测证据本身（它是任务书；实测证据以 §7.1 F1–F13 为准） |
| 客户端 RS256-only 断言 | `apps/client/src-tauri/src/identity/oidc_core.rs:13,551,615-617`（mini `de0c7181`） | 2026-11-12 静态核对 | alg 约束、JWKS 只收 RSA 公钥 | — |
| claim/admin-group 开关 env 与默认值 | ocr `identity_auth/config.py:34,81,83,85,87,162,166`（ocr 本地 `origin/main` `0855392`） | 2026-11-12 静态核对 | §2 各行 env 名/默认值 | 真实 Casdoor claim 名（以 FDL 凭据实测为准） |

## 4. 未核实 / 待办清单

| # | 事项 | 状态 | 解除条件 |
|---|---|---|---|
| 1 | 矩阵项 1–3 的凭据部分（`device_code` 获取 / token exchange 换票 / 真实 claim 名集合） | **未测**（blocked） | FDL 提供已注册 client（`client_id`/`client_secret`）+ 真实用户 access token → 探针 `--mode=live` 带凭据复跑 |
| 2 | 矩阵项 4–5（`account_linking` / `registration_off`） | **未测**（blocked） | FDL 提供 admin token → 探针 `--admin-token=...` 只读复跑 |
| 3 | 探针脚本 `casdoor_probes.py` 本身 | **未验证**（agent A 交付物，auth 仓分支 `feat/p4-1-casdoor-probes`；本矩阵未运行） | agent A 交付后：`python deploy/nas/rehearsal/casdoor_probes.py --mode=offline --out=report.json`（CI/无网可跑；5 项都产出 status，其中 2 项 `needs_credentials`） |
| 4 | 0 泄露复核 | 本矩阵已自查（无 token/secret 原文） | 复跑后对 `report.json`/`report.md` grep secret/令牌原文（规格 §0） |

## 5. 观察到的 claim 与我们的用法（2026-11-12 live 实测）

`claims_supported` 实测 28 项，其中与本项目相关的三条：

| claim | 实测 | 我们的用法 |
|---|---|---|
| `groups` | **未出现在 `claims_supported`** | 管理员判定**只用** `groups`（`ocr#30`），claim 名可由 `MINI_HBUT_IDENTITY_ADMIN_GROUP_CLAIM` 改；真实名字待凭据实测回填 |
| `hbut_student_id` | **未出现在 `claims_supported`** | 学号 claim 名可配（`MINI_HBUT_IDENTITY_STUDENT_ID_CLAIM` + `_FALLBACKS` 默认 `oauth_OIDC_id,student_id`），真实名字待凭据实测回填 |
| `isAdmin` | **出现在 `claims_supported`** | **本项目不采信 `isAdmin`**：管理员只由 `groups` 决定（`ocr#30` 明确「按学号/自报判定已退役」）。若将来要采信 `isAdmin`，必须单独立项（涉及信任根变更），**不得**在本期悄悄启用 |
| `signupApplication` | 出现 | 可作 `account_linking` 项的线索（账号来自哪个上游应用），仍属**未测** |

> 结论：`claims_supported` 是**声明**而非**令牌实际内容**，以上均不得作为「已实测」依据；真实 claim 名必须用真实 AT 调 `/api/userinfo` + 解 id_token 后才能回填。
