# Mini-HBUT Identity Platform

> Mini-HBUT 为第三方学生开发工具，本服务不是湖北工业大学官方统一身份认证服务。

## 这是什么

为第三方网站/应用提供统一身份接入的 OIDC / App Approval 服务端工程（GitHub issue #617–#630 的实现基线）。

Identity 源码现在随 Mini-HBUT 主仓库版本管理，便于安全审查、PR Review 和版本追踪；真实 `.env`、数据库凭据、OIDC 私钥、服务令牌、Vercel `.vercel/` metadata 与测试/构建产物继续由 `.gitignore` 排除。部署仍通过 Vercel CLI 手动执行，不要求开启 Vercel Git 自动部署。

```
identity-platform/
├─ core/       # Vercel Project A: mini-hbut-identity-core
│              #   Node.js + TypeScript + Koa；后续承载 oidc-provider / Core API / DB
├─ web/        # Vercel Project B: mini-hbut-identity-web
│              #   Next.js 16；auth.* / developer.* 双站点（Host 路由，fail closed）
├─ docs/       # README + runbook
└─ scripts/    # deploy.mjs（pnpm deploy:preview / deploy:prod）
```

## 三域名（IDN / Punycode）

| 站点 | 展示（中文） | 协议层（Punycode，唯一合法） |
|---|---|---|
| Core issuer | `id.湖北工业大学.com` | `https://id.xn--vhq74jc2fzpchter27a.com` |
| Auth Web | `auth.湖北工业大学.com` | `auth.xn--vhq74jc2fzpchter27a.com` |
| Developer Web | `developer.湖北工业大学.com` | `developer.xn--vhq74jc2fzpchter27a.com` |

**铁律**：OIDC Discovery `issuer`、ID Token `iss`、Access Token issuer、
resource server 校验配置、开发者文档机器可读示例——全部只用 canonical
Punycode issuer，禁止 Unicode/Punycode 混用（`core/src/config/issuer.ts`、
`web/lib/issuer.ts` 有自动测试兜底）。

## 环境分层

| 分层 | 用途 | 数据库 | issuer |
|---|---|---|---|
| Development | 本地 `pnpm dev` | 本地/临时（可无） | 显式配置 `IDENTITY_ISSUER` |
| Preview | `pnpm deploy:preview` | 独立 Preview DB（Neon 分支） | 显式配置，禁止 = Production |
| Production | `pnpm deploy:prod`（需人工确认） | 独立生产 DB（仅 Core 可写） | 固定 canonical |

## 环境变量清单（只定义名称，不填真实值）

**Core（Vercel Project A）**：

| 变量 | 用途 |
|---|---|
| `IDENTITY_ENVIRONMENT` | development / preview / production |
| `IDENTITY_ISSUER` | OIDC issuer（Production 固定 canonical） |
| `IDENTITY_DATABASE_URL` | PostgreSQL 连接串（Neon，仅 Core 有写权限） |
| `IDENTITY_JWKS_JSON` | JWKS 私钥 JSON（#620） |
| `IDENTITY_PAIRWISE_SUBJECT_KEY` | pairwise subject 派生密钥 |
| `IDENTITY_CLIENT_SECRET_KEK` | client_secret 加密 KEK |
| `IDENTITY_HANDOFF_HMAC_KEY` | Web 接力 handoff HMAC 密钥 |
| `IDENTITY_WEB_ORIGINS` | 允许的 Web 站点来源 |
| `IDENTITY_COOKIE_KEYS` | oidc-provider Cookie 签名密钥列表 |
| `IDENTITY_SERVICE_TOKEN` | Web BFF → Core 内部服务令牌 |
| `IDENTITY_AUTH_ORIGIN` | auth.* 接力页 origin |
| `IDENTITY_STATIC_CLIENTS_JSON` | 第一方静态 Client（仅 Preview/Test；Production 默认不配置） |

**Web（Vercel Project B）**：

| 变量 | 用途 |
|---|---|
| `IDENTITY_ENVIRONMENT` | development / preview / production |
| `IDENTITY_CORE_BASE_URL` | Core API 基地址（Web 只经 API 改状态） |
| `IDENTITY_SERVICE_TOKEN` | Web BFF → Core 内部服务令牌（与同环境 Core 一致） |
| `IDENTITY_PUBLIC_ISSUER` | 对外展示 issuer（Preview 必须显式改掉） |
| `AUTH_PUBLIC_ORIGIN` | auth.* 站点 origin（Host 路由匹配） |
| `DEVELOPER_PUBLIC_ORIGIN` | developer.* 站点 origin |
| `IDENTITY_PREVIEW_HOSTS` | Preview 允许 Host 白名单；未列出的 *.vercel.app fail closed |
| `DEVELOPER_OIDC_CLIENT_ID` | 门户自身登录 Client ID（#624） |
| `DEVELOPER_OIDC_CLIENT_SECRET` | 门户自身登录 Client Secret（#624） |
| `WEB_SESSION_SECRET` | Web 会话加密密钥 |

真实值只存在于：本地 `.env`（被忽略）、Vercel 项目环境变量面板。
`.env.example` 只含占位；主仓库 `scripts/guard_sensitive_uploads.mjs` 对
Vercel Token / PEM / PG 连接串 / OIDC 私钥 JWK 等做提交/推送拦截。

## 快速开始（本地）

```bash
cd identity-platform
pnpm install
pnpm check                 # core/web 各自 typecheck + test + build
pnpm --filter @mini-hbut/identity-core run dev   # http://localhost:3001
pnpm --filter @mini-hbut/identity-web run dev    # http://localhost:3000
```

详见 [docs/runbook.md](runbook.md)。

## 后续子 Issue 落点

- `core/src/oidc/` → #620（oidc-provider）；`core/src/db/` → #619（数据模型）
- `web/app/auth-site/` → #630（授权接力页）；`web/app/developer-site/` → #624/#625
- `core/src/security/`、`web/lib/security/` → #626（安全硬化）
