# Identity Core 数据合同（#619 → #621/#620/#622 消费）

> 本文件由 #619 冻结 schema 后输出，供 #621（Tauri Deep Link）、#620（OIDC Core）、#622（Device）按合同对接，**无需再猜表结构**。
> 变更本合同时必须同步修改本文件并告知相关 Issue。

---

## 1. AuthRequest 合同（#621 直接消费）

### 1.1 创建（Core API 侧，供 #620 调用）

`src/domain/auth-requests/service.ts` → `createAuthRequest(sql, input)`

| 输入 | 类型 | 说明 |
|---|---|---|
| `interactionUid` | string | oidc-provider interaction UID（UNIQUE） |
| `clientId` | string | 必须引用已存在 application（FK） |
| `requestedScopes` | string[] | 创建后不可变快照（规范化去重排序后入库） |
| `handoffHmacKey` | string \| undefined | `IDENTITY_HANDOFF_HMAC_KEY`；缺失 fail closed |

**返回（只此一次）**：

```ts
{
  requestId: string        // 'ar_' + base64url(16B)，例：ar_qhjINIITtkzwIg5pU3K9ew
  serverChallenge: string  // base64url(32B)，设备签名的对象（非 secret）
  handoffSecret: string    // base64url(32B)，Web 接力/二维码凭据，只返回一次
  expiresAt: Date
}
```

### 1.2 TTL 与过期

- 默认 **120 秒**（`AUTH_REQUEST_TTL_SECONDS`，`src/domain/auth-requests/service.ts`）；
- 过期后任何业务操作（approve/deny/open）失败，懒迁移到 `EXPIRED`；
- 过期判定以 `auth_requests.expires_at > NOW()` 为准（DB 条件更新内联）。

### 1.3 状态机（#621 驱动 App 唤起与轮询）

```
CREATED → WAITING_APP → APP_OPENED → APPROVED → INTERACTION_FINISHED
        → CODE_ISSUED → CONSUMED
异常终态：DENIED / EXPIRED / CANCELLED / FAILED
```

- 合法迁移表：`src/domain/auth-requests/state-machine.ts`（`ALLOWED_TRANSITIONS`）；
- approve 允许从 `WAITING_APP | APP_OPENED` 进入；并发 approve 只有一次生效（条件更新），重复同设备幂等、异设备安全失败；
- 所有迁移走 `transitionAuthRequest` 原子条件更新，禁止直接 UPDATE 状态列。

### 1.4 Web 接力语义（#617 信任边界 12）

- `request_id` **不能单独**读取/批准请求；
- 必须同时出示 `handoffSecret`，服务端用 `verifyHandoffSecret()` 比对 HMAC；
- 数据库只存 `handoff_secret_hash`（HMAC-SHA256），明文不出现在任何日志/响应/审计。

### 1.5 设备 approve 输入（#622 消费）

```ts
approveAuthRequest(sql, requestId, deviceId)
```

- `approved_user_id` 由服务端按 device.user_id 决定（不信客户端）；
- 前置条件：#622 已用 `serverChallenge` 完成 Ed25519 验签；
- revoked/pending 设备一律拒绝（`findActiveDeviceById`）。

---

## 2. 设备合同（#622 消费）

- 注册：`createEnrollmentChallenge(sql, { purpose })` → 明文 challenge 只返回一次，DB 存 `sha256(challenge)`；
- 绑定：`registerDevice(sql, { userId, publicKeyJwk, platform, appVersion, deviceName, challenge })`
  - 只接受 Ed25519 公钥 JWK（`kty=OKP, crv=Ed25519, x`，**禁止 `d`**）；
  - 指纹 = `sha256(canonical JWK JSON)`（base64url），UNIQUE；
  - challenge 一次性（`consumed_at IS NULL AND expires_at > NOW()` 条件更新）；
- 状态机：`pending → active`（激活）；`pending|active → revoked`（吊销）；**revoked 不可再激活**；
- `last_seen_at` 只在签名验证成功后由 `touchDeviceLastSeen` 更新。

## 3. Client 合同（#620 消费）

- 数据权威：`oauth_applications`（+`oauth_redirect_uris`/`oauth_application_scopes`）；
- **只有 `status='active'` 才被 oidc-provider 加载**（suspended/revoked/draft → invalid_client）；
- Client Adapter 组装 metadata：`redirect_uris` 精确匹配、`grant_types=['authorization_code']`、`response_types=['code']`、`subject_type=pairwise`、scope=已批准 scope；
- confidential secret：AES-256-GCM(KEK) 密文入库（`enc:v1:` 前缀），Adapter 加载时解密供 `client_secret_basic/post` 认证；rotate 后旧 secret **立即失效**（行为已测试固化）；
- V1 scope 白名单（8 项，与 `domain/clients.ts SCOPE_WHITELIST`、`oidc/provider.ts OIDC_SCOPES`、
  DB CHECK（最新迁移 `0008_game_scopes_check.sql`）逐项一致）：
  `openid | profile | student.identity | offline_access | student.grades.read | student.timetable.read | game.read | game.play`。

## 4. 用户/身份合同

- 用户主键 `users.id` = UUIDv7（应用层生成），**student_id 绝不作主键/sub**；
- 学校身份 `linked_identities`：`UNIQUE(provider, subject)`；冲突显式 `IDENTITY_ALREADY_BOUND`；
- `verification_method='mini_hbut_app'`、`verification_level='low'`（DB CHECK 约束固化，不允许谎称官方认证）；
- 首次绑定：`createUserWithHbutIdentity(sql, snapshot)` 事务创建 user + identity。

## 5. OIDC 协议 artifact（#620 消费）

- 全部走 `oidc_provider_records` 通用表 + `src/oidc/adapter/` 的 `createPostgresAdapterFactory`；
- provider 配置：`adapter: createPostgresAdapterFactory({ sql, clientLoader })`，**不要**静态注册 clients 数组；
- v9 契约方法：`upsert/find/findByUserCode/findByUid/consume/destroy/revokeByGrantId`；
- 与官方 memory adapter 逐方法对比测试通过（tests/adapter/oidc-records.test.ts）；
- **#620 配置注意**（集成测试中发现，v9 默认值陷阱）：
  - `scopes` 默认只有 openid，必须显式配置 V1 白名单；
  - `subjectTypes` 默认只有 public，pairwise 必须显式声明；
  - `findAccount` 必须返回带 `claims()` 的对象；`pairwiseIdentifier` 接入 `src/domain/subjects.ts`；
  - 授权码必须绑定 Grant（`new provider.Grant({ accountId, clientId }).save()` 后 code 带 `grantId`），否则 token endpoint 报 invalid_grant。

## 6. 测试环境（#619 本地无 PG 的方案）

| 环境 | 行为 |
|---|---|
| 无 `TEST_DATABASE_URL` | pg-mem 内存执行**同一份 migration SQL**（tests/helpers/pg.ts 已注册 pg-mem 缺失函数 polyfill） |
| 设置 `TEST_DATABASE_URL` | 连接真实 PostgreSQL，每测试随机 schema 隔离（`search_path`），跑同一套 SQL 与断言 |

## 7. 写边界备忘

- #619 独占：`core/src/db/**`、`core/src/domain/**`、`core/src/oidc/adapter/**`、`core/migrations/**`、`core/src/observability/audit/**`、core 的 tests；
- 本文件（`core/docs/contract.md`）由 #619 独占维护；#621 按 §1 消费。

## 8. Access Token 格式与 resource indicator（#902a）

> ⚠️ **P1 决策待用户确认**（`docs/game-platform/protocol-v1.md` U1）：本节的落地实现采用
> **推荐方案 (b) resource-scoped JWT AT**。若用户最终选择 (a) introspection，改动清单见 §8.4。

### 8.1 两级令牌格式（默认零行为变化）

| 授权形态 | AT 格式 | 依据 |
|---|---|---|
| 未请求 `resource` 参数（既有 Forum / Cloud Sync / 全部第三方授权） | **opaque**（字符串，无点，服务端存储 payload） | oidc-provider 9.11.3：`AccessTokenFormat = token.resourceServer?.accessTokenFormat ?? 'opaque'`（`lib/models/mixins/has_format.js:5-7`） |
| 请求了游戏 resource indicator 且 client 在第一方白名单内 | **JWT**（`typ=at+jwt`，RS256，含 `aud`） | `features.resourceIndicators.getResourceServerInfo` 返回 `{ audience, scope, accessTokenFormat: 'jwt' }` |

- 游戏 audience 固定为 `mini-hbut-hf-api`（与 `ocr-service/identity_auth/config.py DEFAULT_HF_AUDIENCE` 一致，
  协议 §6.4 硬性前提 2）；可用 `IDENTITY_GAME_RESOURCE_AUDIENCE` 覆盖。
- resource indicator 默认 `https://<audience>`（形如 `https://mini-hbut-hf-api`；oidc-provider 要求绝对 URI），
  可用 `IDENTITY_GAME_RESOURCE_INDICATOR` 覆盖。
- 第一方白名单 `IDENTITY_GAME_RESOURCE_CLIENTS`（逗号分隔 client_id）：**默认空 = 全部 fail closed**
  （任何带 `resource` 的授权请求返回 `invalid_target`），灰度期必须显式配置宿主 client_id 才生效。
- `resource` 必须在 **authorize 阶段**请求（v9 会在 token 阶段校验 code/refresh token 自带的 resource 集合）；
  配合 `useGrantedResource: () => true`，token 请求可省略 `resource` 仍得到 JWT AT。
- 交互桥（`oidc/interaction.ts resumeAuthRequest`）在创建 Grant 时必须 `addResourceScope(indicator, grantedScope)`，
  否则 JWT AT 的 `scope` 为空（v9 的 `getResourceScopeFiltered` 只从 Grant 的 resource 记录取值）。

### 8.2 受控 claim 注入范围（协议 §6.4 硬性前提 1）

`extraTokenClaims(ctx, token)` 仅在**同时满足**下列两条时注入
`hbut_student_id` / `hbut_student_name` / `hbut_verification_method` / `hbut_verified_at`：

1. `token.resourceServer.audience === 游戏 audience`（即该 AT 是给游戏资源服务器的 JWT）；
2. `token.clientId` 在 `IDENTITY_GAME_RESOURCE_CLIENTS` 白名单内（第一方）。

其余 AT（含全部 opaque AT）payload **零变化**；第三方 client 永远拿不到含学号的 AT
（负向断言见 `tests/oidc/game-resource.test.ts`）。JWT 是 base64url 明文，注入范围必须按
audience + client 双重限定（`core/src/oidc/resource-indicators.ts`）。

### 8.3 game.* scope 的同步点（改名前必须全改，共 8 处）

1. `core/src/domain/clients.ts` `SCOPE_WHITELIST`
2. `core/src/oidc/provider.ts` `OIDC_SCOPES`
3. `core/src/domain/scope-risk.ts` `SENSITIVE_SCOPES`（唯一权威；`api/admin/reviews.ts` re-export、`api/admin/queries.ts` 复用）
4. DB CHECK 约束：`core/migrations/0008_game_scopes_check.sql`（回退 `rollback_0008.sql`）
5. `web/lib/developer/scopes.ts` `SCOPE_WHITELIST`
6. `web/lib/developer/scopes.ts` `SCOPE_META`（risk/requiresJustification）
7. `web/app/developer-site/_components/app-form.tsx`（创建表单初始态 `Record<ScopeId, ...>`，漏改即 typecheck 失败）
8. 客户端 scope 列表（`apps/client/src/features/identity/identityScopes.ts`，由 #902b 维护，本 worktree 不改）

> 仅当用户确认最终命名（协议 §12 U1）后，才可把 `game.read` / `game.play` 视为冻结值。

### 8.4 若用户选择 (a) introspection，需要改动的位置

| # | 位置 | 改动 |
|---|---|---|
| 1 | `oidc/provider.ts` resource server info | `accessTokenFormat` 由 `'jwt'` 改为 `'opaque'`（或删除该字段） |
| 2 | `oidc/provider.ts` features | 启用 `features.introspection`（含 confidential RS client 认证策略） |
| 3 | `core/src/api/**` | 新增 `/oauth/introspect` 的调用方鉴权（confidential client 认证 + 只返回 active/sub/scope/exp/aud/client_id） |
| 4 | `core/src/oidc/resource-indicators.ts` | audience/resource indicator 保留（scope 绑定仍需要）；`extraTokenClaims` 可保留为纵深防御（opaque payload 经 introspection 返回） |
| 5 | `ocr-service/identity_auth/**`（#902b 侧） | 新增 introspection 客户端 + 缓存 + `DualTrackAuthenticator` 形状分支（不在本 worktree） |
| 6 | 协议 §6.1/§6.5/§6.6、`trust-model.md` §2 | 文档同步（由 #901/#902b 负责） |

本 worktree 的实现不依赖 introspection，因此 (a) 的切换是**替换**而非叠加：
`§8.1` 的两级格式表退化为"全部 opaque + 资源服务器 introspection 校验"。
