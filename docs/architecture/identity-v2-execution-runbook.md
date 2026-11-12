# 身份迁移 v2 · 执行手册（设备签名直证）

> 配套：[`identity-v2-device-attestation.md`](identity-v2-device-attestation.md)（ADR / 为什么这么做）
> 状态：2026-11-09 定稿。**按阶段推进，每个阶段有出口条件，未达标不进入下一阶段。**
> 执行者：mini 团队（代码/测试/客户端）+ FDL（Casdoor 配置、NAS 部署、变更窗口）
> **禁止**：跳过阶段 0 直接做"上线"；**禁止**执行已作废的 [`nas-identity-deploy-runbook.md`](nas-identity-deploy-runbook.md) §14。

---

## 0. 一页速查

| 阶段 | 谁做 | 出口条件（可机械检查） | 是否会断线 |
|---|---|---|---|
| 0 调试接口 | mini | 本机四方联调跑通（贴真实输出） | 否（全在本机） |
| 1 设备登记与验签 | mini | ocr-service 单测/契约测试绿；冒领被拒用例通过 | 否 |
| 2 学生认证服务 | mini + FDL（Casdoor 上游） | discovery 正确 + 一次完整登录 | 否（灰度容器） |
| 3 ocr 退化为资源服务器 | mini | 全量测试绿 + 双 issuer 验证 + 回滚演练 | **是**（重启容器） |
| 4 客户端接 Casdoor | mini | 首次/换设备/退出/切号 全过 | 否（发版） |
| 5 清单仓库 + 接入程序 | mini + FDL | 一个示例应用自动接入 | 否 |
| 6 实测与验收 | mini（自测） | 验收矩阵全绿 | 视项 |
| 延后 | mini | 桥安全（成员应用进模块中心前必做） | 否 |

---

## 1. 阶段 0 · 调试接口（先做这个）

**目的**：让后面每一步都能**在本机自证**，不等 NAS、不等 FDL。

### 1.1 交付
| 组件 | 端点 / 缝 | 说明 |
|---|---|---|
| 新仓 `mini-hbut-student-auth` | `/health`、`/health/deps` | 轻量（几十毫秒）；依赖单列 |
| 同上 | `/debug/authorize`、`/debug/verify`、`/debug/devices` | **仅 `DEBUG_ENDPOINTS=1` 时挂载**；生产默认不存在（404） |
| ocr-service | `/identity/debug/device/{register,verify,list,revoke}` | 同上：`MINI_HBUT_IDENTITY_DEBUG=1` 才挂载 |
| App（Tauri） | DEV 签名自检缝 | 在 DEV 构建里对固定串签名并展示（复用 `__HBUT_IDENTITY_AT_STUB__` 同类做法） |

### 1.2 出口条件
- `npx tauri dev` 起 App；本机起新服务 + ocr-service（+ 假 Casdoor）；
- 走通：**App 签名 → 新服务验签（调 ocr）→ 登记 → 发 id_token → 假 Casdoor 换令牌**；
- 把命令与真实输出写进 `docs/architecture/identity-v2-phase0-evidence.md`。

### 1.3 明确不做
- 不动生产 Casdoor/NAS/DNS；
- 不修本地桥漏洞（列"延后"）；不碰测试应用清理。

---

## 2. 阶段 1 · 设备登记与验签（ocr-service）

- 设备表：`device_id`(PK)、`public_key`、`alg`、`student_id`(唯一索引)、`status`(pending/active/revoked)、`created_at`/`last_seen_at`、`bound_by`(首次/换机/人工)；
- 验签：canonical 串固定、`nonce` 一次性、`ts` 时间窗（默认 ±120s）、`kid` 轮换；
- **首次登记**：若学号已被绑定 → 拒绝（不得静默接管）；
- **换设备**：需旧设备签名批准，或管理员在 ocr 侧显式放行（写入审计 `bound_by=manual`）；
- 限流：按 IP / device_id / 学号；
- 一致性：学号↔姓名/院系首次登记后不得静默变更，变更 → `conflict` + 告警；
- 吊销：管理员可吊销设备（并发 `subjects`/令牌失效路径）。

**出口条件**：冒领（他人学号 + 新设备）被拒；换机走批准；吊销后旧设备签名失效。

---

## 3. 阶段 2 · 学生认证服务（新仓）

- 端点：`/.well-known/openid-configuration`、`/authorize`、`/token`、`/jwks.json`；
- 流程：Casdoor 登录页 → 本服务 → 深链拉起 App 产生设备签名（或本机桥）→ 调 ocr 验签/查登记 → 发 `id_token`（`sub`、`hbut_student_id`、`hbut_verification_method=device_attestation`）；
- **不收 cookie、不连教务、不存密码**；
- FDL 侧：在 Casdoor 建"上游提供方（type=OIDC）"指向本服务；具体字段见 `mini-hbut-student-auth/docs/oidc-upstream-contract.md`。

**出口条件**：discovery 字段正确；一次完整登录在 NAS 灰度容器上完成（Casdoor 侧由 FDL 配合）。

---

## 4. 阶段 3 · ocr-service 退化为资源服务器

按 FDL 与指南 §5：
1. 删 `/identity/bootstrap`、建号（管理 API）、断言签发；旧路径不可达要有测试；
2. 双 issuer（Casdoor + 旧平台）+ 学号 claim 名可配（`hbut_student_id` 或 `oauth_OIDC_id`）；
3. 数据授权改 `client_id → 数据域` 白名单（只验 `aud`），退役 scope 矩阵与 `consents`；
4. 权限改读令牌 `groups`，退役 `hf_role_table` 按学号判定；
5. **CORS 收紧**（当前是 `allow_origins=["*"]`）；
6. **`/health` 轻量**（当前 1.9–2.1s），依赖移 `/health/deps`；
7. 镜像交付改 **CI→ACR**（NAS 只拉取），tag 规范 + `:rollback` 保留。

**出口条件**：全量测试绿 + 双 issuer 各自验证通过 + `03:00–05:59` 窗口内完成一次回滚演练。

---

## 5. 阶段 4 · 客户端

- App 作为 Casdoor 原生客户端：授权码 + PKCE，回调 `minihbut://identity/callback`（若自定义 scheme 不被接受，退回 loopback）；
- 会话由 Casdoor `refresh_token` 接管；退役设备换票 provider（保留 legacy 开关一个过渡期）；
- 保留 `handoff`（浏览器 ↔ App 对齐）；
- 学号 claim 名适配（与阶段 3-2 同一开关）。

**出口条件**：首次登录、换设备、退出、切号、权限变更生效时间 全部按验收矩阵通过。

---

## 6. 阶段 5 · 清单仓库 + 接入程序

- 清单 YAML = 插槽规范 v2 的 8 维度 + 身份（client 类型/回调/放行群组/形态/数据域）+ 应用中心条目；
- PR 审核（1 位 `ops` 批准且非作者）为唯一门；
- NAS 接入程序幂等生成：Casdoor 应用 + `perm-<应用>-<群组>`、mini 数据域白名单、New API key、compose/Traefik/frpc、module_center 清单；secret 落 `secrets/`；
- 退役（P4-4 已完成 2026-11-12，worktree `feat/p4-4-registry-retire`）：自建应用注册表/审核/provisioner 写接口
  （core `POST /apps` 提交/`approve`/`reject`/`provision` + web BFF 全部 developer 写路由 + admin approve/reject）
  一律 **410 Gone** + 固定响应体 `{"error":"registry_retired",...}`（会话/CSRF 守卫 401/403 仍先于 410；
  固定响应先于任何 store 调用，零副作用）；developer 门户改**只读目录**（应用列表/详情/回调地址/数据域/审核历史/动态），
  移除全部写按钮与写凭据（创建表单/密钥/轮换/撤销），「接入申请 = 开 PR」入口替代创建表单；
  admin 保留只读队列/详情/审计与运行时动作（suspend/unsuspend/revoke）。
- 未交付（由 Agent A · P4-1 承担）：清单仓库 PR 流程本体（`manifest/apps.json` 条目规范 + 1 位 `ops` 非作者批准门 +
  清单仓库 + 接入程序），见下两条与阶段 6。

**出口条件**：一个示例应用仅靠清单 PR 完成接入（含权限与数据域）。

---

## 7. 阶段 6 · 实测与验收（自测）

| 项 | 内容 |
|---|---|
| Casdoor 5 项 | device grant 二维码入口；token exchange 权限检查；**Token attributes 改名**；已有账号绑定上游；关闭注册时上游新用户建号 |
| 端到端矩阵 | 首次登录 / 换设备 / 退出 / 切号 / 权限变更生效时长 / 过渡期双 issuer |
| 数据 | 3 用户 / 4 设备 / 0 快照 的迁移核对（含学号↔用户映射导出） |
| 回滚 | 镜像 `:rollback` + 配置开关，逐项列症状 |

### 7.1 Casdoor 实测记录（2026-11-12）

> 采集：2026-11-12；目标 `https://sso.hbut.site`（可达，HTTP 200）。
> 方法：主 agent 只读 curl 探测（GET discovery/JWKS + 无凭据 POST/GET 错误探测）；探针工具复跑见 §7.1.4。
> 复验：2026-11-12 18:28 已把上述 13 条只读探测逐条重跑一遍（F11–F13 用未注册的伪造 `client_id=p41-spoof`），结果与 F1–F13 完全一致（24 字段 / JWKS 单 key / 200+body error / 401 / 200）。
> **未执行任何 Casdoor 写操作**：未创建/修改/删除任何 Casdoor 对象，未调 admin 写接口。
> 零泄露：本记录不含 `client_secret`/`access_token`/`id_token`/`refresh_token` 原文。
> 事实编号 F1–F13，供配套验收矩阵 [`docs/qa/identity-v2-casdoor-acceptance.md`](../qa/identity-v2-casdoor-acceptance.md) 引用（该矩阵硬规则：未测必须写「未测」、每行必须有证据、不得伪造通过）。

#### 7.1.1 真实事实（13 条，2026-11-12 实测）

| # | 事实 | 命令 | 原始输出摘要 |
|---|---|---|---|
| F1 | discovery **24 个字段** | `curl -sS https://sso.hbut.site/.well-known/openid-configuration` | HTTP 200；顶层 24 个字段 |
| F2 | `issuer` = `https://sso.hbut.site`；`authorization_endpoint` = `/login/oauth/authorize`；`token_endpoint` = `/api/login/oauth/access_token`；`userinfo_endpoint` = `/api/userinfo`；`jwks_uri` = `/.well-known/jwks` | 同 F1 | 同上（字段值逐字） |
| F3 | **`device_authorization_endpoint` 存在** = `/api/device-auth` | 同 F1 | 同上 |
| F4 | `grant_types_supported` **含** `urn:ietf:params:oauth:grant-type:device_code` 与 `urn:ietf:params:oauth:grant-type:token-exchange` | 同 F1 | 同上 |
| F5 | `code_challenge_methods_supported` = **`["S256"]`** | 同 F1 | 同上 |
| F6 | `token_endpoint_auth_methods_supported` = `["client_secret_basic","client_secret_post","private_key_jwt"]` → **未声明 `none`** | 同 F1 | 同上 |
| F7 | `scopes_supported` = `["openid","email","profile","address","phone","offline_access"]` → **无自定义 scope** | 同 F1 | 同上 |
| F8 | `claims_supported` 实测 **28 项**：`affiliation`/`aud`/`avatar`/`bio`/`displayName`/`email`/`exp`/`homepage`/`iat`/`id`/`isAdmin`/`isForbidden`/`isOnline`/`iss`/…；**未列出 `groups`**、**未列出 `hbut_student_id`**、**也没有 `name`**（只有 `displayName`）；含 `signupApplication`（账号来源线索）与 **`isAdmin`** | 同 F1 + 探针 `token_attributes` | 28 项列表（探针 live 输出） |
| F9 | `id_token_signing_alg_values_supported` = `["RS256","RS512","ES256","ES384","ES512"]` | 同 F1 | 同上 |
| F10 | **JWKS 实际只有 1 个密钥**：`kty=RSA`、`alg=RS256`、`use=sig`、`kid=cert-built-in` | `curl -sS https://sso.hbut.site/.well-known/jwks` | HTTP 200；`keys` 仅 1 条 |
| F11 | `POST /api/device-auth`（**伪造 client_id**）→ **HTTP 200** + body `{"error":"Invalid client_id"}` | `curl -sS -X POST https://sso.hbut.site/api/device-auth --data-urlencode "client_id=<伪造未注册值>"` | 200 + body error（**注意：错误在 body，状态码 200**） |
| F12 | `POST /api/login/oauth/access_token`（伪造 client_id）→ **401** + `{"error":"invalid_client","error_description":"client_id is invalid"}` | `curl -sS -X POST https://sso.hbut.site/api/login/oauth/access_token --data-urlencode "grant_type=authorization_code" --data-urlencode "client_id=<伪造未注册值>"` | 401 + body error |
| F13 | `GET /login/oauth/authorize`（伪造 client_id）→ **HTTP 200**（错误在页面/body，非 4xx） | `curl -sS "https://sso.hbut.site/login/oauth/authorize?client_id=<伪造未注册值>&response_type=code&scope=openid"` | 200（错误渲染在页面） |

#### 7.1.2 5 项状态表（issue mini-hbut#1216）

| 探针 | 状态 | 已测（无凭据） | 未测（阻塞：FDL 凭据） |
|---|---|---|---|
| `device_grant` device grant 二维码入口 | **部分实测** | F3/F4：discovery 声明 `device_code` grant + 端点存在；F11：伪造 client 的 body error 形状（200 + error） | 用真实 client 拿 `device_code`/`user_code`/`verification_uri` → 判定「入口可用」 |
| `token_exchange` token exchange 权限检查 | **部分实测** | F4：discovery 声明 `token-exchange` grant；F12：伪造 client_id → 401 `invalid_client`（分类：客户端无效，非 `unsupported_grant_type`） | 真实 client + 真实 `subject_token` → 判定是否返回新 AT 且 aud 正确 |
| `token_attributes` Token attributes 改名（`hbut_student_id` / `groups`） | **部分实测** | 仅能记录 `claims_supported` 实际内容：F7（无自定义 scope）、F8（无 `groups`、无 `hbut_student_id`） | 真实 AT 调 `/api/userinfo` + 解 id_token → 报告真实 claim 名集合（直接决定 `MINI_HBUT_IDENTITY_STUDENT_ID_CLAIM(_FALLBACKS)` / `MINI_HBUT_IDENTITY_ADMIN_GROUP_CLAIM` 填什么） |
| `account_linking` 已有账号绑定上游 | **未测** | 无（无凭据不可测，无既有证据） | 需 `--admin-token`：`GET /api/get-user?name=...` → 报告 `signupApplication`/`properties` 是否与上游一致（只读） |
| `registration_off` 关闭注册时上游用户建号 | **未测** | 无（无凭据不可测，无既有证据） | 需 `--admin-token`：`GET /api/get-organization`/`get-application` → 报告 `enableSignUp` 与是否存在上游自动建号路径（只读） |

#### 7.1.3 对实现的直接影响（6 条结论）

1. **签名算法**：真实 JWKS 只有 **RS256**（F10）→ 客户端 `alg==RS256` 硬断言**与真实一致**，**不需要**新增算法开关（记录为约束：若 Casdoor 改 alg，需同步改客户端并回归）。
2. **公有客户端**：discovery **未声明** `token_endpoint_auth_methods_supported: none`（F6）→「无 secret 换票是否被接受」**必须实测**（需 FDL 提供已注册 client）。**不得**因此在客户端内嵌 `client_secret`（桌面端内嵌 secret 等于公开）。若 Casdoor 拒绝，正确落点是 **Casdoor 应用侧配置为 public/PKCE**，并把「应用必须可无 secret 换票」写成**部署前提**（见验收矩阵 §2）。
3. **自定义 scope 不可用**：`scopes_supported` 只有标准集（F7）→ 与 **P3-2「数据授权不靠 scope」**一致 ✅；客户端/服务端**不得**依赖自定义 scope 做授权。
4. **claim 名**：`claims_supported` 无 `groups`、无 `hbut_student_id`（F8）→ 真实 claim 名**待实测**；已具备的兜底：`MINI_HBUT_IDENTITY_STUDENT_ID_CLAIM(_FALLBACKS)`（P2-6）与 `MINI_HBUT_IDENTITY_ADMIN_GROUP_CLAIM`（P3-3）→ **开关已就位**，待实测后填值即可。
5. **device flow**：端点存在且 grant 已声明（F3/F4）→ 可作后续「扫码登录」选项（**本期不实现**，仅记录）。口径限定：只能说「端点存在 + grant 已声明」，**不得**据此写「device flow 已启用」（F11 表明无有效 client 时入口返回 body error，可用性待凭据实测）。
6. **错误形状**：Casdoor 对错误返回 **200 + body error**（F11/F13：device-auth / authorize）与 **401**（F12：token）两种形态 → 探针与客户端解析**必须**按 body 判定，不能只看状态码。

#### 7.1.4 复跑命令

**① 原始只读探测（2026-11-12 方法；`<伪造未注册值>` = 任意未注册的 client_id，如 `p41-spoof`）**

```bash
curl -sS "https://sso.hbut.site/.well-known/openid-configuration" | python -m json.tool | head -5
curl -sS "https://sso.hbut.site/.well-known/jwks" | python -m json.tool | head -5
```

```bash
curl -sS -w "\nHTTP=%{http_code}\n" -X POST "https://sso.hbut.site/api/device-auth" --data-urlencode "client_id=<伪造未注册值>"
curl -sS -w "\nHTTP=%{http_code}\n" -X POST "https://sso.hbut.site/api/login/oauth/access_token" --data-urlencode "grant_type=authorization_code" --data-urlencode "client_id=<伪造未注册值>"
curl -sS -o /dev/null -w "HTTP=%{http_code}\n" "https://sso.hbut.site/login/oauth/authorize?client_id=<伪造未注册值>&response_type=code&scope=openid"
```

期望输出形态：discovery/JWKS → `200` + JSON（字段值应同 F1–F10）；`/api/device-auth` → `HTTP=200` + `{"error":"Invalid client_id"}`；token 端点 → `HTTP=401` + `invalid_client`；authorize → `HTTP=200`（F11–F13）。

**② 探针工具（auth 仓 `deploy/nas/rehearsal/casdoor_probes.py`，P4-1 agent A 交付；`--mode=offline` 用内置 fixture，CI/无网可跑）**

```bash
python deploy/nas/rehearsal/casdoor_probes.py --mode=offline --out=report.json
python deploy/nas/rehearsal/casdoor_probes.py --mode=live --issuer=https://sso.hbut.site --out=report.json
# FDL 提供凭据后可选：--client-id=... --client-secret=... --access-token=... --admin-token=...
```

期望输出形态：`report.json` + `report.md`（表格，可直接贴进 ADR/矩阵）；每个探针输出 `{id, title, status, evidence, needs, notes}`，`status ∈ pass|fail|unavailable|needs_credentials`；offline 模式 5 项都产出 status（其中 `account_linking`/`registration_off` 为 `needs_credentials`）；令牌/secret 只输出长度或前 4 字符（零泄露）。

> 注：本 §7.1 为 ADR/矩阵回填（agent B，mini 仓，分支 `feat/p4-1-casdoor-records`）；探针脚本本身属 agent A 交付物（auth 仓分支 `feat/p4-1-casdoor-probes`），以上命令按 P4-1 规格 §2 书写，live 复跑以该脚本合并后为准。

### 7.2 端到端验收矩阵

六类场景（**首次登录 / 换机 / 退出 / 切号 / 权限变更生效时间 / 双 issuer 过渡期**）的端到端验收见新口径矩阵 [`docs/qa/identity-v2-acceptance-matrix.md`](../qa/identity-v2-acceptance-matrix.md)（含权限变更生效时间表与双 issuer 表；harness 输出待 P4-2 PR 合并后回填，P4-1 真实 Casdoor 2 项 `needs_credentials` 不重复计为通过）。

---

## 8. 延后项（**成员小应用进模块中心之前必须完成**）

1. 本地桥把 `127.0.0.1` **任意端口**当可信来源；远程模块从桥的同源地址加载且 **iframe 无 sandbox** → 任何远程模块代码都能用学生的学校会话调桥上的成绩、课表、cookie 导出接口；
2. 测试应用与空名应用清理（后台脏数据）。

---

## 9. FDL 协作清单（越早越好）

| # | 事项 | 备注 |
|---|---|---|
| 1 | 建 Casdoor 应用（mini，native public，授权码+PKCE）与 `perm-mini-*` | 阶段 4 前置 |
| 2 | 建"上游提供方（type=OIDC）"指向学生认证服务 | 阶段 2 前置 |
| 3 | 确认 Token attributes 能否把学号改名成 `hbut_student_id` | 决定 claim 名是否必须可配 |
| 4 | `POST /api/login` 30 次/分钟（全校同一 NAT 出口）需重定 | 否则 mini 接入会误伤 |
| 5 | NAS 上给学生认证服务分配容器/网络/Traefik 路由/secrets/资源上限 | 阶段 2 部署 |
| 6 | ACR 推送权限 + 变更窗口确认（03:00–05:59） | 阶段 3/5 |
| 7 | 清单仓库归属（FDL 建仓）与接入程序协作分工 | 阶段 5 |
