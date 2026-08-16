# Identity Platform Runbook（本地 / Preview / Production / 回滚）

> 前置：已安装 Node ≥ 22、pnpm ≥ 10、Vercel CLI（`pnpm add -D vercel` 于本目录）。
> 所有命令在 `identity-platform/` 根目录执行。

## 1. 本地启动（Development）

```bash
pnpm install

# 终端 A：Core（Koa）
cp core/.env.example core/.env          # 按需填 Development 值（可留空）
pnpm --filter @mini-hbut/identity-core run dev
# 验证：
curl http://localhost:3001/healthz      # 200 {"status":"ok"}
curl http://localhost:3001/readyz       # 未配 DB -> 503 DATABASE_URL_NOT_SET；配了 DB -> 200/503

# 终端 B：Web（Next.js）
cp web/.env.example web/.env.local
pnpm --filter @mini-hbut/identity-web run dev
# 本地 host 在 development 环境放行到 auth-site：
curl -H "Host: localhost:3000" http://127.0.0.1:3000/          # 200
curl -H "Host: unknown.example.com" http://127.0.0.1:3000/     # 404（fail closed）
```

## 2. 质量门禁（每次改动后）

```bash
pnpm check          # = core/web 的 typecheck + unit test + build 全部通过
pnpm --filter @mini-hbut/identity-core run test -- --run   # 单独跑 core 测试
```

## 3. 首次关联 Vercel 项目（一次性）

```bash
cd core && vercel link        # 选择/创建 mini-hbut-identity-core
cd ../web && vercel link      # 选择/创建 mini-hbut-identity-web
# 生成的 .vercel/ 被 .gitignore 忽略，不进任何 Git
```

## 4. 拉取环境变量

```bash
vercel env pull core/.env            # 只进本地 ignored 文件
vercel env pull web/.env.local       # 同上
```

**环境变量配置建议**（Vercel 项目面板 → Settings → Environment Variables）：
- Production：`IDENTITY_ENVIRONMENT=production`、canonical issuer 相关值、生产 DB URL；
- Preview：`IDENTITY_ENVIRONMENT=preview`、`IDENTITY_ISSUER`/`IDENTITY_PUBLIC_ISSUER`
  显式设为 Preview 专用值、Preview DB（Neon branch）；
- Preview 与 Production 禁止共用 signing key / DB / issuer。

## 5. Preview 部署

```bash
pnpm deploy:preview
# 等价于：vercel --cwd core && vercel --cwd web
```

Preview 域名（`*.vercel.app`）必须显式配置到 Web 的 `IDENTITY_PREVIEW_HOSTS`
才会放行；未列出的 Preview 域名返回 404（fail closed）。

## 6. Production 部署（真实写操作，必须单独确认）

```bash
pnpm deploy:prod
```

脚本强制要求：
- 终端交互（非 TTY 直接拒绝）；
- 输入确认词 `deploy-prod` 才会继续；
- 依次对 core/web 执行 `vercel --prod`。

**前置检查清单**（上线前）：
1. `IDENTITY_ENVIRONMENT=production` 且 issuer 为 canonical Punycode；
2. 生产 DB 只被 Core 引用；migration 已**显式执行**（禁止冷启动自动迁移）；
3. Preview/Production 环境变量无交集；
4. 域名已绑定：`id./auth./developer.湖北工业大学.com`（Punycode 形式）；
5. 武汉校园网/常用运营商实测 Core region 到 DB 的延迟可接受。

## 7. 回滚

```bash
# 列出最近部署，取要回滚的 deployment URL
vercel ls --cwd core
vercel ls --cwd web

# 回滚到指定 deployment
vercel rollback --cwd core <deployment-url>
vercel rollback --cwd web <deployment-url>
```

注意事项：
- 回滚是**部署层**回滚；**不自动回滚数据库 schema**。
  若本次发布伴随 schema 变更，需先按 #619 的回滚迁移流程处理 DB，再回滚函数代码；
- 回滚后立即核对 `/healthz`、`/readyz` 与站点页面；
- 若涉及密钥轮换，回滚后必须同步 Vercel 环境变量。

## 8. 常见问题

| 现象 | 处理 |
|---|---|
| `readyz` 返回 503 DATABASE_URL_NOT_SET | Core 未配置 `IDENTITY_DATABASE_URL`，属预期 fail closed |
| Web 任意域名 404 | 未识别 Host，检查 `AUTH_PUBLIC_ORIGIN` / `DEVELOPER_PUBLIC_ORIGIN` / `IDENTITY_PREVIEW_HOSTS` |
| Preview 页面提示 issuer 未配置 | Preview 环境必须显式配置 `IDENTITY_PREVIEW_ISSUER` |
| 本地 `curl localhost` 404 | `IDENTITY_ENVIRONMENT` 被设成了非 development |

## 9. 密钥轮换（#626 Signing Key / Client Secret Rotation）

> 所有密钥材料只允许出现在 Vercel 面板与本地 `.env*`（被忽略）；**禁止**明文私钥备份进任何仓库。

### 9.1 OIDC Signing Key 常规轮换（7 步）

```text
1. 生成新 signing key（RSA-2048 或 P-256；新 kid 必须与旧 key 不同，如 rsa-<sha256(n).slice(0,12)>）；
2. 新 key 写入 IDENTITY_JWKS_JSON（Vercel Production secret）；
3. JWKS 端点同时发布 old + new 公钥（Discovery 自动生效，Verifier 用 kid 选 key）；
4. oidc-provider 签名默认使用 keys 数组第一个条目 → 把新 key 放第一位；
5. 等待 >= 所有旧签名 token 的最大有效期 + clock skew（access token 默认 1h + id_token 5m + refresh 轮换周期，建议 >= 48h）；
6. 从 JWKS 移除旧公钥（删除旧 key 条目）；
7. 保留审计记录（轮换时间/kid/原因），不保留明文 private backup 在 repo。
```

### 9.2 紧急泄漏轮换（Signing Key 疑似泄露时）

立即执行，顺序敏感：

1. **先断后换**：在 Vercel 面板直接替换 `IDENTITY_JWKS_JSON` 为新 key（新 kid），此时旧签名 token 全部失效——需要强制用户重新登录；
2. 按 9.1 步骤 3-6 处理双 key 过渡（可跳过过渡期，直接移除旧公钥）；
3. 按需 revoke 全部 refresh tokens / grants（`oidc_provider_records` 清理，或按 #625 admin revoke 流程）；
4. 通知受影响 Client 重新走授权流程；
5. 审计事件记录。

### 9.3 PAIRWISE Subject Key 特殊轮换策略（重要）

`IDENTITY_PAIRWISE_SUBJECT_KEY` **不可像 signing key 一样随便轮换**：

- 轮换即所有第三方 Client 的 `sub` 值全部变化 → 第三方账号体系「断联」（用户被当成新用户）；
- 只在以下情况轮换：确认泄露 / 迁移到硬件密钥管理 / 平台级重置；
- 轮换必须配套**版本化迁移窗口**：提前公告、业务低谷执行、预留 Client 重新关联用户的时间窗（建议 >= 30 天）；
- 过渡期策略：同 `sub` 校验失败时允许用旧 key 二次派生比对（平台内部预留 `sub` 映射表方案），V1 不做自动映射，直接公告迁移；
- 任何轮换都写 audit + 更新 runbook 记录。

### 9.4 Client Secret 轮换

- 创建时 **show-once**（返回一次明文，之后只能轮换不能读取）；
- DB 只存 `enc:v1:` AES-256-GCM 密文（KEK = `IDENTITY_CLIENT_SECRET_KEK`，仅 Core）；
- 轮换走 Developer/Admin API（`credentials/rotate`），**GET API 永不返回原 secret**；
- 每次轮换写 audit（`client_secret_rotated`）；
- 若实现旧 secret grace period，必须显式短期（建议 <= 5 分钟）且写入文档；
- revoke client 时同时清除 secret。

### 9.5 BFF → Core 服务令牌（#626）

- Core/Web 各配置 `IDENTITY_SERVICE_TOKEN`（≥ 32 字节随机值，Preview/Production 独立生成，禁止共用）；
- Web BFF 自动附加 `x-identity-service-token` 头调用 Core 的 `/api/v1/requests|admin|developer/**`；
- Core 常量时间校验；缺失/伪造 → 401；Production/Preview 未配置 → 503（fail closed）；
- 轮换：两端同时更新（先 Core 后 Web 或并行），滚动窗口内旧令牌仍可校验（可临时放两份，V1 直接切换 + 短时间窗口）；
- 该令牌绝不出现在浏览器 bundle、日志（脱敏）、错误响应。

### 9.6 持久化限流（#626）

- 实现：`rate_limit_buckets` 表 + Postgres 原子计数（migration 0003），无外部依赖；
- Production/Preview 默认启用；按 endpoint 分组 + IP 哈希；429 + Retry-After；
- fail-closed 面：token / enroll challenge / enroll / approve / developer-write / admin；
- fail-open 面：authorize / status 轮询 / userinfo / developer-read；
- 上线前执行 `pnpm --filter @mini-hbut/identity-core run migrate:up` 应用 0003（显式迁移，禁止冷启动自动迁移）；
- 观察 429 比例：正常流量不该触发；误伤时调整 `core/src/security/rate-limit.ts` 分组数值后重新部署。

## 10. 维护提醒

- 任何真实 secret 只允许出现在本地 `.env*`（被忽略）与 Vercel 面板；
- 主仓库 SecretGuard（`scripts/guard_sensitive_uploads.mjs`）会在
  提交/推送时拦截 Vercel Token、PEM、PG 连接串、OIDC 私钥 JWK、
  Identity 密钥类 env 赋值、服务令牌、handoff 样例等；
  改动规则后必须跑 `node --test scripts/guard_sensitive_uploads.test.mjs` 与
  `node scripts/guard_sensitive_uploads.mjs self-test`；
- 供应链：依赖全部 pinned major + lockfile（`pnpm-lock.yaml`）；升级前跑
  `pnpm audit`；oidc-provider major 升级前必须先过协议 E2E（`core/tests/oidc/*`）；
- 安全回归：`pnpm --filter @mini-hbut/identity-core run test`（含
  `tests/security/*`：限流/服务令牌/脱敏/16 条 Gate）与
  `pnpm --filter @mini-hbut/identity-web run test`（含 security-hardening）；
- 威胁模型（`identity-platform/docs/threat-model.md`）随架构变更同步更新；
  首次 `mini_hbut_app` 学校身份 enrollment 属已知 residual risk，
  不得宣传为「官方认证」，不得用于需要校方强实名的高风险用途。

---

# 11. 测试分层与门禁流水线（#628）

## 11.1 测试分层定义（L0-L8）

每层失败都不能靠「下一层也许能用」跳过；分层与落地证据：

| 层 | 名称 | 落地位置 | 本地可跑 |
|---|---|---|---|
| L0 | Static / Type / Lint | `pnpm check`（typecheck + test + build）；主仓库 `vue-tsc`/`cargo fmt`/`clippy` | ✅ |
| L1 | Unit | `core/tests/*`（205 用例）+ `web/tests/*`（283 用例） | ✅ |
| L2 | DB + Provider | `core/tests/db|adapter|oidc`（pg-mem / TEST_DATABASE_URL 双后端） | ✅ |
| L3 | Web Browser E2E | `e2e/tests/auth-site|developer|admin.spec.ts`（Playwright，mock 模式） | ✅ |
| L4 | Tauri / Desktop | 主仓库 `scripts/identity_deep_link_smoke.mjs` + `src-tauri/src/identity` golden fixture 测试 | ✅（静态部分；真机深链人工） |
| L5 | Cross-device / Mobile Contract | `e2e/tests/qr-cross-device.spec.ts`（PC + Phone 双 context）；主仓库 `scripts/check_mobile_scheme_contract.mjs` | ✅（QR）；gen 检查需 android 构建后 |
| L6 | Preview Deployment E2E | 本 runbook 第 12-13 节流程 + `e2e/demo-client`（openid-client 消费者） | 需 Vercel 凭据（用户执行） |
| L7 | Production Smoke | 第 14-15 节 12 步上线 + smoke 清单 + demo-client | 需用户确认（人工执行） |
| L8 | Manual Real-device | 主仓库 `docs/release-readiness/identity-real-device-checklist.md` | 真机人工 |

## 11.2 标准流水线

```text
check → preview → e2e → prod confirmation → smoke
```

1. **check**：`pnpm check`（typecheck + 205/283 单测 + build）+ 主仓库 gate
   （`scripts/check_mobile_scheme_contract.mjs --skip-gen` 静态部分、
   `scripts/identity_deep_link_smoke.mjs --check`）；
2. **preview**：第 5 节 `pnpm deploy:preview`（Preview 独立 DB/issuer/signing key）；
3. **e2e**：`cd e2e && pnpm test`（L3/L5 全量）；Preview 域名下跑
   `E2E_MOCK=0 E2E_BASE_URL=https://<preview-auth-domain> pnpm exec playwright test` 冒烟；
   协议级校验用 `node demo-client/index.mjs`（openid-client 自动校验
   state/nonce/id_token iss·aud·alg·签名，bad state 用 `--tamper-state 1` 必须拒绝）；
4. **prod confirmation**：第 14 节 12 步，需用户明确确认后按序执行；
5. **smoke**：第 15 节只读 smoke（Discovery/JWKS/health + 受控测试 Client code flow）。

## 11.3 Negative matrix 11 项核对表（#628 第 3 节）

| # | 场景 | 断言位置 | 状态 |
|---|---|---|---|
| 1 | missing PKCE（public client） | `core/tests/oidc/authcode.test.ts` 4 | ✅ 已有 |
| 2 | plain PKCE（policy 只允许 S256） | `core/tests/oidc/native-negative-matrix.test.ts` N1 | ✅ 本次补齐 |
| 3 | wrong verifier | `core/tests/oidc/authcode.test.ts` 3 | ✅ 已有 |
| 4 | code replay | `core/tests/oidc/authcode.test.ts` 5 | ✅ 已有 |
| 5 | code wrong client | `core/tests/oidc/authcode.test.ts` 6 | ✅ 已有 |
| 6 | wrong redirect | `core/tests/oidc/authcode.test.ts` 负向 + 7 | ✅ 已有 |
| 7 | expired code | `core/tests/oidc/authcode.test.ts` 8 | ✅ 已有 |
| 8 | bad state（回跳 state 必须一致；客户端拒绝） | `native-negative-matrix.test.ts` N3 + `e2e/demo-client --tamper-state` | ✅ 本次补齐 |
| 9 | bad nonce（id_token.nonce 必须一致） | `native-negative-matrix.test.ts` N4 + openid-client 内置校验 | ✅ 本次补齐 |
| 10 | suspended client | `core/tests/oidc/provider.test.ts` A3 / `refresh-revoke.test.ts` 4 | ✅ 已有 |
| 11 | unapproved scope | `native-negative-matrix.test.ts` N2 | ✅ 本次补齐 |

## 11.4 Security 10 Suite（release blocker，#626 汇总）

以下 10 个 suite 任何依赖/代码变更后必须全绿，任一失败即 **release blocker**（不得上线）：

```text
security:redirect-uri    core/tests/oidc/authcode.test.ts（恶意 redirect_uri 变体）
security:pkce            core/tests/oidc/authcode.test.ts + native-negative-matrix N1/N3
security:handoff         core/tests/security/gate.test.ts G3 + e2e/tests/auth-site.spec.ts
security:device-replay   core/tests/security/gate.test.ts G4 + e2e/tests/qr-cross-device.spec.ts（幂等/双手机）
security:idor            core/tests/api/admin/* + web/tests/admin-*.test.ts
security:csrf            web/tests/developer-oidc.test.ts / admin-*.test.ts（双提交 + Origin）
security:xss            web/tests/security-hardening.test.ts + e2e/tests/developer.spec.ts（XSS 不执行）
security:rate-limit      core/tests/security/rate-limit.test.ts
security:secret-redaction core/tests/security/redact.test.ts + guard_sensitive_uploads（提交门禁）
security:issuer          core/tests/issuer.test.ts + web/tests/issuer.test.ts（Punycode canonical）
security:refresh-reuse   core/tests/oidc/refresh-revoke.test.ts
```

> #626 的 16 条 Security Test Gate 已由 `core/tests/security/gate.test.ts` 与 web 侧
> security-hardening 覆盖；本清单是面向发布门禁的固定 suite 集合。

## 11.5 SLO 事件埋点清单（#628 第 15 节）

按 `correlation_id` 串联，不记录 secret/PII；写入结构化日志（`observability/`）：

```text
authorize_started            授权端点收到合法请求
auth_request_created         AuthRequest 创建（含 expires_at）
app_opened                   App 被深链唤起（Tauri onOpenUrl 收到 identity link）
approved                     App 设备签名批准成功
denied                       App 拒绝
expired                      AuthRequest 过期
interaction_finished         oidc-provider interaction 完成（resume 成功）
token_exchange_success       /oauth/token 200（code 兑换）
token_exchange_failure       /oauth/token 4xx/5xx（含 replay/verifier 错误）
device_enroll_success        设备 enrollment 成功
device_enroll_failure        设备 enrollment 失败（验签/TTL/重复公钥）
client_suspended             admin 暂停 client（含原因，不含敏感信息）
```

> 性能验收以武汉/中国大陆实测为准：auth 页首次可交互、request detail、approve、
> status 轮询、token exchange 的 P50/P95；不要只用 Vercel 数据中心内延迟。

---

# 12. Preview 隔离断言（L6）

除第 5 节部署外，每次 Preview 部署后必须断言：

1. Preview 独立 DB（`readyz` 200 且数据与 Production 无交集）；
2. Preview issuer 显式不同（`IDENTITY_PREVIEW_ISSUER`），Discovery 的 `issuer` 字段
   不等于 Production canonical；
3. Preview signing key 独立（`IDENTITY_JWKS_JSON` 与 Production 无交集）；
4. Production 资源校验器（demo client / 主仓库 future Forum 迁移）用 Production
   issuer+JWKS 校验 Preview token **必须失败**（`security:issuer` 方向性断言）；
5. Preview 页面有环境标识（auth/developer 页 `dev-env-badge` 等），防止用户误当生产；
6. Preview Developer first-party client 单独配置（`IDENTITY_STATIC_CLIENTS_JSON`）；
7. E2E 读取真实 deployment URL（`E2E_BASE_URL`），不硬编码 Production issuer。

---

# 13. Production 上线 12 步（L7，#628 第 12 节）

> 真实 Production 部署、域名绑定、Production migration 属于高风险动作，
> **必须在执行前获得用户明确确认**。禁止把「deploy 成功」当作「上线成功」。

```text
1. 备份/确认 DB migration 状态（migrate.ts 版本号 + schema_migrations 表）；
2. Production env completeness check（只检查存在，不输出值）：
   IDENTITY_ENVIRONMENT / IDENTITY_ISSUER / IDENTITY_PUBLIC_ISSUER /
   IDENTITY_JWKS_JSON / IDENTITY_PAIRWISE_SUBJECT_KEY / IDENTITY_CLIENT_SECRET_KEK /
   IDENTITY_HANDOFF_HMAC_KEY / IDENTITY_COOKIE_KEYS / IDENTITY_SERVICE_TOKEN /
   IDENTITY_DATABASE_URL / WEB_SESSION_SECRET / DEVELOPER_OIDC_CLIENT_SECRET /
   AUTH_PUBLIC_ORIGIN / DEVELOPER_PUBLIC_ORIGIN；
3. migration：`pnpm --filter @mini-hbut/identity-core run migrate:up`（显式，禁止冷启动自动迁移）；
4. deploy Core（`pnpm deploy:prod` 的 core 部分）；
5. health/readiness：`/healthz` 200、`/readyz` 200（DB 可达）；
6. deploy Web（auth + developer 同部署）；
7. DNS/TLS：三域名（id./auth./developer.湖北工业大学.com Punycode）解析到 Vercel，
   TLS 生效（curl -I https://… 无证书错误）；
8. Discovery/JWKS smoke：GET /.well-known/openid-configuration 与 /oauth/jwks 200，
   issuer 为 canonical Punycode；
9. 第一方 demo/developer login：developer 门户完整登录 + 创建应用；
10. 一个测试 App Approval（受控测试 Client + 测试设备）；
11. 观察 error/audit：结构化日志无 5xx 异常、无 secret 泄漏、audit 有记录；
12. 确认稳定后才开放第三方 Client（发布公告 + 本文档更新）。
```

## 13.1 Production Smoke（只读，不得破坏数据）

```text
GET  /.well-known/openid-configuration
GET  /oauth/jwks
GET  /healthz /readyz
一个受控测试 Client 的 authorize/code flow（demo-client，测试设备，用户授权后执行）
revoke 该测试凭据
```

- 不批量修改用户/Client；不执行 destructive DB 操作；
- 测试数据带明确前缀/标签（`e2e-smoke-*`）并可安全清理；
- demo-client 使用后 revoke token，凭证不留存。

---

# 14. Rollback 与 Kill Switch（#628 第 14 节）

## 14.1 Code rollback

```text
vercel ls --cwd core && vercel rollback --cwd core <deployment-url>
vercel ls --cwd web && vercel rollback --cwd web <deployment-url>
```

- Vercel rollback 到上一个稳定 deployment；
- Core/Web 版本兼容矩阵：同一版本对（core↔web）一起回滚，禁止只回滚一端；
- oidc-provider 依赖回滚：恢复旧 lockfile 后重新部署，须重跑 11.4 全部 suite。

## 14.2 DB rollback（forward-compatible migration）

- 优先 **forward-compatible migration**：新 migration 只加列/表，不删除、不改语义，
  不依赖直接 DOWN 删除生产字段；
- 部署顺序必须保证：

```text
旧代码可读新 schema    （migration 先于新代码，或新列有默认值/可空）
新代码可兼容部署窗口    （新代码对旧 schema 也要能启动/降级）
```

- 回滚顺序：先回滚代码 → 确认旧代码在新 schema 下正常 → 再按需执行向下兼容的
  `migrate:rollback`（rollback 脚本必须幂等并写 audit）。

## 14.3 Signing key 不回滚

- 普通代码 rollback **不能回滚到已废弃/泄漏的 signing key**；
- key 泄漏必须按第 9.2 节紧急轮换（先断后换 + revoke grants），
  之后所有部署继续使用新 key（即使代码回滚到旧版本，`IDENTITY_JWKS_JSON` 保持新值）。

## 14.4 五种 Kill Switch

| # | Kill Switch | 实现/触发 | 恢复 |
|---|---|---|---|
| 1 | **migration 版本开关** | schema_migrations 版本号作为运行门槛：Core 启动时校验当前版本 ≥ 期望版本，低于则 fail closed（不发 token） | 显式 `migrate:up` 后自动恢复 |
| 2 | **Feature flag（暂停新第三方 authorize）** | `IDENTITY_ALLOW_NEW_AUTHORIZE=0`：Provider 对非第一方 client 的 authorize 返回 503 维护页 | 置回 1 后恢复 |
| 3 | **限流开关（device approval 临时禁用）** | `rate_limit_buckets` 分组调整：approve/enroll 阈值收紧到 0 或改 fail-closed（见 9.6） | 恢复阈值后部署 |
| 4 | **服务令牌轮换** | 更新两端 `IDENTITY_SERVICE_TOKEN`（先 Core 后 Web，滚动窗口双值） | 见 9.5 |
| 5 | **Preview-PROD 隔离** | Preview/Production 独立 DB/issuer/signing key/static clients；Production 资源校验器拒绝 Preview issuer（第 12 节断言） | 保持隔离配置即可 |

演练要求：kill switch 1/2/3 在 Preview 环境至少各演练一次（改 env → 验证行为 → 恢复），
并记录到本文档；本地可用 `E2E_MOCK` 或 Preview 域名实测。

---

# 15. E2E 运行说明

```bash
cd identity-platform/e2e
pnpm install && pnpm exec playwright install chromium
pnpm test                 # mock 模式：L3 + L5 全量（22 用例，无需凭据）
pnpm exec playwright test tests/auth-site.spec.ts   # 单文件
# 真实服务（Preview/Production smoke）：
E2E_MOCK=0 E2E_BASE_URL=https://<domain> pnpm exec playwright test tests/auth-site.spec.ts --grep WAITING_APP
# 协议消费者（bad state 验证）：
node demo-client/index.mjs --issuer <issuer> --client-id <id> [--client-secret <secret>] \
  --redirect-uri http://127.0.0.1:4567/cb --scope "openid profile"
node demo-client/index.mjs ... --tamper-state 1    # 必须退出码 1
```

详细说明见 `e2e/README.md`。

## §16 实际部署经验（2026-08-14 Production 上线记录）

### 16.1 云端构建失败的根因链（已解决）
1. **vercel.json 的 `builds` 会覆盖项目设置的 Install Command**——设置 pnpm install 无效，Vercel 用默认 npm install
2. `@koa/router@15.x` 的 prepare 脚本是 `husky install`，npm 安装时 husky 缺失 → 构建失败 → 部署永远 UNKNOWN（Instant Preview 占位页）
3. **解法**：core/.npmrc 加 `ignore-scripts=true`；或本地 `vercel build --prod` + `vercel deploy --prebuilt`（推荐，可完全绕开云端构建，10s 部署）

### 16.2 prebuilt 部署的 workspace 坑
- pnpm workspace 下 CLI 的依赖检查路径错乱（core\node_modules 报不存在）
- **解法**：把 core 复制到 workspace 外独立目录（vercel-core-deploy/），npm install --ignore-scripts + vercel build + vercel deploy --prebuilt

### 16.3 env 配置要点
- `IDENTITY_JWKS_JSON`：必须是**单个私钥条目**的 JWK Set（`{keys:[{...含 d/p/q...}]}`）；分成公钥+私钥两个条目会 fail closed（assertSigningJwk 要求每条目含 d）
- `IDENTITY_CLIENT_SECRET_KEK`：必须 **32 字节 UTF-8**（32 字符字符串）；base64url 43 字符会 fail closed
- `IDENTITY_STATIC_CLIENTS_JSON`：**数组格式**（非 `{clients:[...]}` 包装）
- 静态 client 首次由 ensureStaticClients 写入 DB（fire-and-forget，Serverless 冷启动下可能未完成 → invalid_client；手动 seed 或预热后生效）

### 16.4 Neon/Serverless 连接
- `connectionTimeoutMillis` 3000 不够（Neon compute 休眠唤醒）→ 已改 15000
- 本机网络无法稳定直连 Neon 5432 时，可显式配置 HTTP 代理并使用 `neon-tunnel.cjs` 建立本地 CONNECT 隧道（`NEON_TUNNEL_TARGET_HOST` / `NEON_TUNNEL_PROXY_HOST` / `NEON_TUNNEL_PROXY_PORT`）；仓库不固化个人代理软件、端口或生产数据库主机。也可以在 Vercel 侧执行 migration。
- **migration 执行**：Vercel 海外网络可直连 Neon；用临时 runner 项目（vercel-migrate-runner）执行 SQL（用完删除）

### 16.5 待办
- Preview env 在面板手动补齐（CLI 非 TTY 交互卡住）：IDENTITY_DATABASE_URL/AUTH_ORIGIN/STATIC_CLIENTS_JSON/JWKS_JSON/CLIENT_SECRET_KEK
- DNS 绑定 id/auth/developer.湖北工业大学.com 到两个项目（web 接力页需 auth 域名才可访问）
- 删除临时 runner 项目（vercel-migrate-runner）与诊断端点
- 大陆用户访问 Vercel 域名依赖 karing 代理（正式使用建议绑定域名后走 Cloudflare/国内可达路径）

### 16.6 上线联调发现并修复的问题（2026-08-14 第二次会话）
1. **web REQUEST_ID_RE 仍是 req_ 前缀**（#630 交付时的旧值，与 Core #619 的 ar_ 漂移）→ 已改 ar_（web/lib/auth/handoff.ts + 测试 fixtures）
2. **web IDENTITY_CORE_BASE_URL 线上值未更新**（rm+add 交互失败）→ 已用 API PATCH 更新为 id 域名
3. **BFF→Core 服务令牌**：Core 的 /api/v1/requests/* 受 service-token 中间件保护（#626），web BFF 转发必须带 x-identity-service-token（两项目 env 一致）
4. **Hobby 团队 BLOCKED**：git 仓库内部署会带上报 commitMeta（noreply 邮箱未验证）→ 被团队配置阻止；**解法：从 git 仓库外目录部署**（vercel-core-deploy/vercel-web-deploy），或连接 GitHub 验证邮箱
5. **env 用 CLI 非 TTY 添加会交互卡住**（Type Sensitive 询问）→ 用 `vercel env rm` + API PATCH（token）最可靠

### 16.7 当前线上状态（全链路已通）
- core: https://mini-hbut-identity-core.vercel.app（healthz/readyz/Discovery/JWKS/authorize 全通）
- web: https://mini-hbut-identity-web.vercel.app（接力页 200 + BFF 详情/状态通）
- 域名: id/auth/developer.xn--vhq74jc2fzpchter27a.com 已绑定（DNS + Vercel）
- 数据库: Neon 16 表 + 2 client（e2e-demo/developer-portal active）

### 16.8 接力页"正在加载授权信息"卡住的根因与修复（2026-08-15 浏览器实测）
1. **Core 重定向 fragment 格式不一致**：Core 生成 `#<handoff>`，web 解析期望 `#h=<handoff>` → handoff=null → 页面无法拉详情。**已修**：interaction.ts 改为 `#h=${handoffSecret}`（与 web 约定对齐）
2. **CSP script-src 阻止 Next.js 内联 hydration**：`script-src 'self'` 无 unsafe-inline → 页面 SSR 显示 LOADING 但 JS 不执行（永远卡住）。**已修**：strictContentSecurityPolicy 的 script-src 加 `'unsafe-inline'`（Next.js RSC 必需；XSS 由 React 转义 + 无 dangerouslySetInnerHTML 兜底；unsafe-eval 仍禁止）
3. **验证方式升级**：必须用真实浏览器（playwright）走全链路，curl 只能验证 API 层，无法发现 hydration/CSP 类问题

### 16.9 测试环境（mini-hbut-test）使用说明
- 测试链接/PKCE/换 token 步骤：见 docs/parallel-execution/identity-testing-guide.md
- 接力页/App 授权栏/本地设置三处显示"🧪 测试、不获取真实数据"横幅（client.is_test 标记）
