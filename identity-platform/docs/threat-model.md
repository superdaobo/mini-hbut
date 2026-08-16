# Identity Platform 威胁模型（Threat Model）

> 归属：issue #626（[Identity/Security] 统一身份平台安全硬化）
> 范围：`identity-platform/`（Core / Auth Web / Developer/Admin Web / Mini-HBUT App 对接面）
> 原则：**本平台不接收、不存储、不上传 HBUT 密码 / CAS / JWXT cookie**。这些凭证只在用户设备上存在，不属于云端资产。

---

## 1. 核心资产（Asset Inventory）

| # | 资产 | 存放位置 | 访问边界 |
|---|---|---|---|
| 1 | OIDC signing private key | `IDENTITY_JWKS_JSON`（Vercel Production secret，仅 Core） | 仅 Core 进程；绝不出现在 JWKS 文档（只发 public）、日志、错误 |
| 2 | Pairwise subject HMAC key | `IDENTITY_PAIRWISE_SUBJECT_KEY` | 仅 Core；轮换属破坏性操作（见 runbook §9.3） |
| 3 | Client Secret 加密 KEK | `IDENTITY_CLIENT_SECRET_KEK`（32 字节，仅 Core） | 仅 Core；DB 只存 AES-256-GCM 密文（`enc:v1:` 格式） |
| 4 | Confidential client secrets | `oauth_applications.client_secret_encrypted` | 仅 Core 解密；show-once；GET API 永不返回原值 |
| 5 | Web session secret | `WEB_SESSION_SECRET`（仅 Web） | 仅 Web BFF；AES-256-GCM 会话 cookie（HttpOnly） |
| 6 | AuthRequest handoff secrets | 只在内存 + `auth_requests.handoff_secret_hash`（HMAC 摘要） | 明文只出现在 URL fragment 与 `x-identity-handoff` 头；日志脱敏 |
| 7 | 设备公钥 / 设备身份映射 | `devices`（public JWK + fingerprint + user 绑定） | 私钥永远只在用户设备 OS secure storage |
| 8 | Authorization codes / refresh tokens / grants | `oidc_provider_records` | 一次性消费、短 TTL、绑定 client/redirect/PKCE |
| 9 | user → HBUT linked identity 映射 | `linked_identities`（provider/subject/verification_method） | 服务端唯一权威来源；**绝不信任 App 提交的 student_id/role/scopes** |
| 10 | Admin roles | `user_roles`（identity_admin / identity_reviewer） | 每次请求实时查询，撤销即时生效 |
| 11 | Audit records | `audit_events` | 只追加；管理员可查（identity_admin） |
| 12 | Production database credentials | `IDENTITY_DATABASE_URL`（Vercel secret） | 仅 Core；least privilege（Core 唯一持有生产 DB 写权限） |

---

## 2. 信任边界（Trust Boundaries）

```text
第三方 Client（不可信）
        |
        v
OIDC Core（高信任） <-> Postgres（高信任）
        |
        +-> Auth Web（半信任展示/BFF，无 DB 写权限）
        +-> Developer/Admin Web（有 session，但所有权限由 Core 重验）
        |
        v
Mini-HBUT App（可被反编译/修改，不能天然完全信任）
        |
        v
OS secure storage / device private key
        |
        v
HBUT 本地 session（只在用户设备）
```

关键推论：

- **App 是用户授权器，但客户端代码本身可能被 patch**。服务端信任「设备公钥签名 + 注册状态」，不信任 App 任意提交的 `student_id / is_admin / scopes`（`core/src/api/app/verify.ts` 全部从 DB 推导身份）。
- **Web BFF 不是权威**：auth/developer/admin 站点的 session 只证明「这个浏览器登录过」，所有权限判定在 Core（RBAC 实时查询）。
- **BFF→Core 通道有独立传输认证**（`x-identity-service-token`，#626），`x-admin-subject` / `x-developer-subject` / `x-identity-handoff` 只是身份头，不能作为认证（防伪造）。

---

## 3. 最大已知身份保证限制（Residual Risk：首次学校身份 Enrollment）

由于学校不提供官方 OIDC/CAS Client（server-to-server），首次 HBUT identity enrollment 只能：

```text
verification_method = mini_hbut_app
```

**风险**：修改版客户端理论上可以伪造首次学校身份声明（学号/姓名由设备签名提交）。

本平台已采取（不靠混淆/反调试/硬编码 secret 假装解决）：

1. `student.identity` scope 的 claims 携带 `verification_method`，Token/Developer Docs 明示保证级别；
2. 不叫「湖北工业大学官方认证」，UI 固定非官方声明；
3. 该身份不得用于需要校方官方强实名的高风险用途（平台侧在 Admin 审核界面标注）；
4. 相同 `(hbut, student_id)` 的后续设备 enrollment 走独立 challenge + 已注册设备签名，**禁止自动接管**（`duplicate identity takeover blocked` 有自动化测试）；
5. 学校未来开放官方 OIDC 时，`linked_identities.verification_method` 可升级为 `hbut_oidc`（枚举已预留）；
6. Admin 审核 `student.identity` scope 时看到该风险提示。

> 该 residual risk 是 issue #626 明确接受的业务级根信任限制，不因本 issue 关闭而消失；由 #628 Production E2E gate 与未来校方官方通道演进。

---

## 4. 威胁与控制（Threats & Controls）

### Threat 1：恶意 OAuth Client / Redirect 劫持

控制（实现于 `oidc-provider` v9 配置 + `web/lib/developer/redirect-uri.ts`）：

- Client 必须人工审核后 Active（#625 review 快照机制，approve 比对 revision）；
- exact redirect URI 匹配（含 encoded/path/host/userinfo/open redirect 负向测试）；
- native loopback 仅按 RFC 8252 合法端口例外（`localhost`/`127.0.0.1`，随 http 端口）；
- PKCE S256 强制（native 客户端禁 plain、缺失拒绝）；
- state/nonce 校验；禁 implicit flow；`response_type=code` only；
- callback 不由 auth web 的 `next=` 决定（BFF 拒绝 `next` 参数）；
- suspended/revoked client 在 Provider 层立即不可用（`adapter` 同步状态）。

**剩余风险**：低。第三方 client 的 UI 质量不在平台控制内（钓鱼由浏览器/用户教育承担）。

### Threat 2：Authorization Code 截获/重放

控制：

- oidc-provider 生成 code，一次性 consume（`oidc_provider_records` 状态机）；
- TTL 短（可配置，默认分钟级）；绑定 client/redirect/PKCE；
- code 只出现在 303 Location 的 query（redirect_uri 为 https），不进入日志/referrer（`Referrer-Policy: no-referrer` + 日志脱敏 `redactSensitiveText`）；
- Token endpoint 重放测试（同 code 二次兑换拒绝）；
- Native 强制 PKCE（缺 code_verifier 拒绝）。

**剩余风险**：低。取决于 redirect_uri 归属 client 的域名安全（Threat 1 审核覆盖）。

### Threat 3：Deep Link 抢占/伪造（`minihbut://`）

控制（#621/#622/#623 实现 + 本 issue 校验）：

- Deep Link 不是身份凭据：只含 request id + 短期 handoff（fragment）；
- App 必须向 Core 重新读取详情（`GET /api/v1/requests/:id`，handoff 校验）；
- approve 还需 active device private-key 签名（`MINI-HBUT-AUTH-V1` canonical）；
- request TTL 极短（默认 120s）；handoff 只存 hash-at-rest；
- handoff 泄露本身不能伪造 device signature（两因子正交）；
- OS verified app/universal link 属后续增强，V1 安全不依赖 custom scheme 独占。

**剩余风险**：中。另一本地程序可抢先注册 scheme 导致用户授权被诱导；缓解 = 双因子（handoff + 设备签名）+ 短 TTL + 用户看到 app 名/scope 再确认。平台侧无法根除 OS 层 scheme 抢占。

### Threat 4：Handoff 泄漏

控制：

- 初始 handoff 放 URL fragment（不发给 CDN/Vercel access log），页面只内存持有；
- 不写 cookie/localStorage/analytics（Auth Web 禁止第三方 analytics）；
- Deep Link 出现时不记录完整 URL；
- Server 只存 HMAC 摘要；短 TTL；status/read/approve/deny 全部重验；
- 单独 request id 无权限（必须 handoff）；
- `x-identity-handoff` 头在 Core/Web 日志统一脱敏（`redactSensitiveText` 模式覆盖）。

**剩余风险**：低。浏览器扩展/设备本地日志可读取 fragment（属用户设备信任边界）。

### Threat 5：Device Signature Replay/Tamper

控制（`core/src/api/app/canonical.ts` + `verify.ts`）：

- 签名绑定 `protocol_version | request_id | server_challenge | client_id | scope_hash | device_id | decision | issued_at | nonce`；
- canonical 序列化（字段顺序固定、UTF-8）；nonce 唯一性检查；
- timestamp skew（`IDENTITY_CLOCK_SKEW_SECONDS`，默认 60s）；
- 请求原子状态迁移（条件更新，并发 approve 只有一次生效）；
- revoked device 拒绝；scope 快照不可变；server 从 device 推导 user（不信 body 里的 student_id/user）；
- Rust/Node golden fixtures + tamper 测试（#622 交付，本 issue gate 引用）。

**剩余风险**：低。

### Threat 6：设备丢失/盗用

控制（#622 实现 + #626 政策）：

- 设备可在安全设置撤销（`POST /api/v1/app/devices/:id/revoke`）；
- revoked public key 不能 approve（状态实时校验）；
- 撤销后相关 first-party long-lived session/grants 按 policy 处理（#623/#628 收口）；
- 最后一个设备撤销强提示；新设备不能凭同学号自动接管；
- 恢复流程独立审计（`audit_events` 记录设备事件）；
- private key secure storage 不可用 → 客户端 fail closed（不降级签名）。

**剩余风险**：低（取决于设备 OS 安全存储强度）。

### Threat 7：XSS / Web 内容注入

控制：

- 全站 CSP（auth/developer/admin 同强度：`default-src 'self'`、禁 unsafe-inline/eval、`frame-ancestors 'none'`）；`Permissions-Policy` 最小化；Trusted Types 显式开关（`IDENTITY_CSP_TRUSTED_TYPES=1`，Next RSC 兼容后再默认）；
- client name/description/developer 内容 React 默认 text-escaped（禁用 `dangerouslySetInnerHTML`，grep 校验无调用点）；
- logo V1 不接受任意 URL（无该字段）；无 client-provided HTML；
- error message 不回显原始请求参数（统一 `{ error: <code> }`）；
- Auth Web 禁止第三方 analytics（CSP connect-src 'self' 强制）。

**剩余风险**：低。

### Threat 8：CSRF / Session Fixation

控制：

- 会话 cookie HttpOnly + Secure（生产/预览）+ SameSite=Lax；
- OIDC callback state/nonce（oidc-provider）；
- session id 登录后 rotate（#625 step-up：会话 iat 作为 auth_time，高风险动作要求近期认证窗口）；
- mutation 三重守卫：会话 + Origin 白名单 + 双提交 CSRF cookie（`web/lib/developer/csrf.ts`）；
- mutation 一律非 GET；logout/revoke session 有行为测试；
- AuthRequest App API 不依赖浏览器 session（handoff + device signature），与浏览器会话体系分离。

**剩余风险**：低。旧浏览器 Origin 头缺失场景由 CSRF 双提交兜底。

### Threat 9：CORS 过宽

控制：

- 全局禁止 `Access-Control-Allow-Origin: *` + credentials；
- Core 不输出任何 CORS 宽放头（默认 deny）；auth web BFF / developer BFF / App 都是 server-to-server 或 native HTTP client，不需要浏览器 CORS；
- OIDC UserInfo/token 若未来出现 browser public client，按 registered client origin/provider hook 精确判断（当前未开放）。

**剩余风险**：无（当前无任何浏览器直连 Core 的 CORS 面）。

### Threat 10：SSRF / Open Redirect

控制：

- Core 不对 client homepage/logo/privacy URL 自动 server-side fetch（无 fetcher）；
- Developer/Admin 外链渲染带 `noopener noreferrer`（页面模板约束 + 审核）；
- auth resume 不接受任意 `next` URL（BFF 拒绝 `next` 参数，resume 由 provider 决定）；
- redirect URI 校验拒绝 userinfo/奇异 scheme；无 callback wildcard（精确匹配）。

**剩余风险**：低。

### Threat 11：Secrets 泄漏

Vercel Production Secrets 独立（互相不共用）：

```text
IDENTITY_JWKS_JSON / IDENTITY_PAIRWISE_SUBJECT_KEY / IDENTITY_CLIENT_SECRET_KEK
IDENTITY_HANDOFF_HMAC_KEY / IDENTITY_COOKIE_KEYS / IDENTITY_DATABASE_URL
IDENTITY_SERVICE_TOKEN / IDENTITY_STATIC_CLIENTS_JSON（仅 Preview/Test）
WEB_SESSION_SECRET / DEVELOPER_OIDC_CLIENT_SECRET
```

控制：

- Preview/Production 环境变量无交集（runbook 强制检查项）；
- 不写源码 / 不写 `.env.example` 真值（占位 + 尖括号）；不回显 health/debug；
- 不发给 Web bundle（服务端 secret 只在 BFF 进程读取）；
- 不在 error/log（logger 落盘前统一脱敏）；
- DB 凭据 least privilege（Core 唯一持有）；
- 主仓库 SecretGuard（`scripts/guard_sensitive_uploads.mjs`）拦截：Vercel Token、PEM、PG 连接串、OIDC 私钥 JWK、Identity 密钥类 env 赋值、服务令牌、handoff 样例等（见 §6）。

**剩余风险**：低（依赖 Vercel 面板访问控制与开发者纪律）。

---

## 5. 纵深防御：限流 / DoS / 日志（#626 新增）

- **持久化限流**：`rate_limit_buckets` 表（migration 0003）+ Postgres 原子 `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`，Serverless 多实例共享；按 endpoint 分组 + IP 哈希（不封整 NAT）；429 + Retry-After；高风险面（token/enroll/approve/admin/developer-write）fail-closed，低风险面（status/userinfo）fail-open；桶概率清理防膨胀。详见 `core/src/security/rate-limit.ts`。
- **BFF→Core 服务令牌**：`x-identity-service-token` 常量时间比对，防 `x-admin-subject` 等身份头伪造；production/preview 未配置即 503（fail closed）。详见 `core/src/security/service-token.ts`。
- **输入边界**（#619/#620/#624 既有）：app name/description 长度上限、redirect URI 数量/长度、scope 数量、device name/JWK 尺寸、请求体上限（64KB）、pagination limit（100）、audit metadata 限制。
- **日志隐私**：结构化日志只记 correlation_id/event_type/route/status/duration/client_id/内部 hash/error_code；禁止 password/cookie/Authorization/code/token/client_secret/private JWK/handoff/完整学号/请求体 dump。生产响应只返回安全 error code/message。

---

## 6. Security Test Gate（16 条自动化矩阵）

所有条目以自动化测试落地（`core/tests/security/gate.test.ts` + 既有套件 + web 测试）；pg-mem 与 TEST_DATABASE_URL 双后端。

| # | Gate | 自动化位置 |
|---|---|---|
| 1 | redirect URI attack cases（encoded/path/host/userinfo/open redirect） | core/tests/oidc/* + developer redirect-uri 测试 |
| 2 | PKCE missing/wrong/replay | core/tests/oidc/authcode.test.ts |
| 3 | handoff leak/replay | core/tests/api/requests.test.ts + redact 测试 |
| 4 | device signature tamper/replay | core/tests/api/app-devices.test.ts |
| 5 | revoked device | core/tests/api/app-devices.test.ts |
| 6 | duplicate identity takeover blocked | core/tests/db/identity.test.ts |
| 7 | XSS payloads in app/developer fields | web developer-validation.test.ts + 无 dangerouslySetInnerHTML 检查 |
| 8 | CSRF | web developer-session/bff-routes 测试 |
| 9 | IDOR | core/tests/api/admin/* |
| 10 | suspended/revoked client | core/tests/oidc/* |
| 11 | refresh reuse | core/tests/oidc/refresh-revoke.test.ts |
| 12 | rate limit | core/tests/security/rate-limit.test.ts |
| 13 | secret/log fixture scanning | core/tests/security/redact.test.ts + SecretGuard self-test |
| 14 | pairwise sub privacy | core/tests/subject/subject.test.ts |
| 15 | Unicode/Punycode issuer mismatch | core/tests/issuer.test.ts |
| 16 | Preview token cannot be accepted by Production resource verifier | core/tests/security/gate.test.ts（环境隔离校验） |

---

## 7. 剩余风险汇总（Accepted Residual Risks）

| 风险 | 等级 | 缓解 | 演进路径 |
|---|---|---|---|
| 首次 `mini_hbut_app` 身份可被修改版客户端伪造 | **高（业务接受）** | verification_method 明示、禁止自动接管、Admin 审核提示、不用于强实名 | 校方官方 OIDC/CAS 通道（预留 `hbut_oidc`） |
| custom scheme 被本地程序抢占 | 中 | handoff + 设备签名双因子、短 TTL、用户确认 UI | OS verified links / universal links |
| Vercel 面板被入侵 → 全部 secret 泄露 | 中 | 环境变量分域、least privilege、runbook 紧急轮换 | 硬件密钥管理（HSM/KMS）远期 |
| 限流按 IP 可能误伤共享出口 | 低 | 分组 + 窗口设计、429 语义明确 | 按 client/device 二级 key 演进 |
| 依赖供应链（oidc-provider 等） | 低 | lockfile + pinned major + pnpm audit | 协议 major 升级前 E2E 门禁 |

---

## 8. 明确不做（本 issue 边界）

- App 混淆 / 反调试 / 硬编码 secret（不解决根信任问题，且自欺）；
- 校方官方认证通道建设（未来 issue）；
- 浏览器端密钥管理（依赖 OS secure storage）。
