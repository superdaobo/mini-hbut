/**
 * Koa 应用组装（App Composition Root，#620 扩展）。
 *
 * 中间件顺序（关键）：
 *   1. 请求日志/requestId
 *   2. /healthz、/readyz
 *   3. /api/v1/**（#630 requests API；#622 app 端点由 Gate merge 到 api/index.ts）
 *   4. oidc-provider 路由委托（/.well-known/**、/oauth/**）
 *   5. 404 兜底
 *
 * OIDC 委托说明（v9 集成陷阱）：oidc-provider v9 的 Provider 实例本身是
 * Koa app（内部 koa 3.x），而本应用的容器是 koa 2.x。不能直接
 * `app.use(provider.callback())`——Koa 中间件签名是 (ctx, next)，
 * 会被误当作 (req, res) 传入 provider（res 变成 next 函数，响应时报
 * "this.res.setHeader is not a function"）。正确姿势：只把 OIDC 前缀路径
 * 委托给 `provider.callback()(ctx.req, ctx.res)`（原生 req/res），
 * 其余路径（healthz/readyz/api/v1/404）由外层 Koa 处理。
 */
import Koa from 'koa'
import Router from '@koa/router'
import type pg from 'pg'
import { randomBytes } from 'node:crypto'
import { createPool } from './db/client.js'
import { probeReadiness } from './db/readiness.js'
import { requestId, createLogger } from './observability/logger.js'
import { createPgExecutor, type SqlExecutor } from './db/types.js'
import { resolveIssuer } from './config/issuer.js'
import { createIdentityProvider, type IdentityProviderDeps } from './oidc/provider.js'
import { ensureStaticClients, loadStaticClientsFromEnv, type StaticClientEntry } from './oidc/static-clients.js'
import { registerApiRoutes, type ApiDeps } from './api/index.js'
import { rateLimitMiddleware, type RateLimiterOptions } from './security/rate-limit.js'
import { serviceTokenMiddleware } from './security/service-token.js'

declare module 'koa' {
  interface DefaultState {
    requestId?: string
  }
  interface DefaultContext {
    db: pg.Pool | null
  }
}

export type App = Koa

/** createApp 返回的 Koa app 上的扩展属性（oidcProvider 供测试/运维访问） */
export interface AppWithProvider extends Koa {
  oidcProvider: ReturnType<typeof createIdentityProvider>
}

export interface AppOptions {
  /** 注入连接池便于测试；缺省时按 IDENTITY_DATABASE_URL 创建 */
  databaseUrl?: string
  /** 注入 SqlExecutor（测试传 pg-mem / TEST_DATABASE_URL 后端；优先于 databaseUrl） */
  executor?: SqlExecutor
  /** 覆盖 provider 依赖（测试注入 issuer/cookieKeys/ttl 等） */
  providerDeps?: Partial<IdentityProviderDeps>
  /** 覆盖静态 Client 预置（测试）；缺省读取 IDENTITY_STATIC_CLIENTS_JSON */
  staticClients?: StaticClientEntry[]
  /** 限流配置（#626；测试注入小 limit 或 enabled:false；缺省按环境推断） */
  rateLimit?: RateLimiterOptions
  /** 服务令牌覆盖（#626；测试注入；缺省读 IDENTITY_SERVICE_TOKEN） */
  serviceToken?: string
}

/**
 * 未配置 DB 时的 executor（fail closed）：
 * /healthz、/readyz 可用；任何业务查询直接抛错，绝不静默降级。
 */
function createNoDbExecutor(): SqlExecutor {
  const noDb = () => {
    throw new Error('[app] IDENTITY_DATABASE_URL 未配置，无法执行数据库查询')
  }
  return {
    query: noDb as never,
    withTransaction: noDb as never,
  }
}

/** 组装 Provider 依赖：显式注入 > 环境变量 */
function resolveProviderDeps(
  executor: SqlExecutor,
  overrides: Partial<IdentityProviderDeps> | undefined,
): IdentityProviderDeps {
  const env: Record<string, string | undefined> = process.env
  const environment = (overrides?.environment ?? env.IDENTITY_ENVIRONMENT ?? 'development').trim().toLowerCase()
  let cookieKeys = overrides?.cookieKeys
    ?? (env.IDENTITY_COOKIE_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  // Cookie 签名密钥：Production/Preview 必须显式配置（fail closed）；
  // development 允许临时生成（同 JWKS 临时策略，仅本地调试，重启即失效）。
  if (cookieKeys.length === 0) {
    if (environment === 'production' || environment === 'preview') {
      throw new Error('[app] IDENTITY_COOKIE_KEYS 未配置（production/preview 必须显式配置）')
    }
    cookieKeys = [randomBytes(32).toString('base64url')]
  }

  let authWebBaseUrl = overrides?.authWebBaseUrl ?? env.IDENTITY_AUTH_ORIGIN
  if (!authWebBaseUrl) {
    // development 给本地默认值；preview/production 必须显式配置（fail closed）
    if (environment === 'development') {
      authWebBaseUrl = 'http://localhost:3002'
    } else {
      throw new Error('[app] IDENTITY_AUTH_ORIGIN 未配置（preview/production 必须显式配置）')
    }
  }

  return {
    sql: executor,
    issuer: overrides?.issuer ?? resolveIssuer(env),
    environment,
    pairwiseKey: overrides?.pairwiseKey ?? env.IDENTITY_PAIRWISE_SUBJECT_KEY,
    handoffHmacKey: overrides?.handoffHmacKey ?? env.IDENTITY_HANDOFF_HMAC_KEY,
    clientSecretKek: overrides?.clientSecretKek ?? env.IDENTITY_CLIENT_SECRET_KEK,
    cookieKeys,
    authWebBaseUrl,
    jwksJson: overrides?.jwksJson ?? env.IDENTITY_JWKS_JSON,
    authRequestTtlSeconds: overrides?.authRequestTtlSeconds,
    ttlOverrides: overrides?.ttlOverrides,
  }
}

export function createApp(options: AppOptions = {}): App {
  const app = new Koa()
  const router = new Router()
  const logger = createLogger('core')

  // 反向代理（Vercel serverless）：production/preview 信任 X-Forwarded-*，
  // 否则 oidc-provider 的 Discovery/回调 URL 会基于内部 origin 输出 http://
  // endpoint（v9 用 ctx.href 生成协议 URL）。开发/测试环境不信任，
  // 防止 host 头伪造（#620 CORS/URL 安全）。
  const environment = (options.providerDeps?.environment
    ?? process.env.IDENTITY_ENVIRONMENT ?? 'development').trim().toLowerCase()
  app.proxy = environment === 'production' || environment === 'preview'

  const databaseUrl = options.databaseUrl ?? process.env.IDENTITY_DATABASE_URL
  const pool = createPool(databaseUrl)
  app.context.db = pool
  const executor = options.executor ?? (pool ? createPgExecutor(pool) : createNoDbExecutor())

  // 请求日志 + 请求 ID（不记录任何请求体/敏感头）
  app.use(async (ctx, next) => {
    const id = requestId()
    ctx.state.requestId = id
    ctx.set('x-request-id', id)
    // OIDC 委托请求直接写原生 res（provider 的 koa3 不经过外层 koa2 的 headers）
    ctx.res.setHeader('x-request-id', id)
    await next()
    logger.info('http', {
      requestId: id,
      method: ctx.method,
      path: ctx.path,
      status: ctx.status,
      ms: ctx.response.get('x-response-time'),
    })
  })

  // /healthz：不依赖 DB
  router.get('/healthz', (ctx) => {
    ctx.status = 200
    ctx.body = { status: 'ok', requestId: ctx.state.requestId }
  })

  // /readyz：轻量 DB 连通性检查
  router.get('/readyz', async (ctx) => {
    const result = await probeReadiness(pool)
    if (result.ready) {
      ctx.status = 200
      ctx.body = { status: 'ready', requestId: ctx.state.requestId }
      return
    }
    ctx.status = 503
    ctx.body = { status: 'not_ready', reason: result.reason, requestId: ctx.state.requestId }
  })

  // OIDC Provider（核心：#620）。Provider 实例本身是 Koa app（v9）。
  const providerDeps = resolveProviderDeps(executor, options.providerDeps)
  const provider = createIdentityProvider(providerDeps)
  // 暴露给测试/运维（E2E 需要 Interaction 模型等 provider 能力）
  ;(app as AppWithProvider).oidcProvider = provider

  // 第一方静态 Client 预置（仅 Preview/Test 配置时才生效；幂等，不阻塞启动）
  const staticEntries = options.staticClients ?? loadStaticClientsFromEnv()
  if (staticEntries.length > 0) {
    void ensureStaticClients(executor, staticEntries, {
      clientSecretKek: providerDeps.clientSecretKek,
    }).then((created) => {
      if (created.length > 0) {
        logger.info('static_clients_ready', { created })
      }
    }).catch((err) => {
      logger.error('static_clients_failed', { message: (err as Error).message })
    })
  }

  // Core API（#630 requests + #622 挂载点）
  const apiDeps: ApiDeps = {
    sql: executor,
    provider,
    handoffHmacKey: providerDeps.handoffHmacKey,
  }
  registerApiRoutes(router, apiDeps)

  // #626 安全中间件（中间件方式接入，不改动任何现有路由实现）：
  //   1. 限流在前：未认证的暴力请求也计数（服务令牌猜测被限流兜底）；
  //   2. 服务令牌在后：保护 /api/v1/requests|admin|developer/**（BFF 通道）。
  // 两者都只豁免 healthz/readyz/.well-known 与未匹配分组，OIDC 协议端点
  // /oauth/** 按分组规则覆盖（token/authorize/userinfo）。
  app.use(rateLimitMiddleware(options.rateLimit ?? { sql: executor }))
  app.use(serviceTokenMiddleware({ env: process.env, token: options.serviceToken }))

  app.use(router.routes())
  app.use(router.allowedMethods())

  // OIDC 协议端点委托：/.well-known/**（Discovery/JWKS 文档）、/oauth/**（authorize|
  // token|userinfo|jwks|revoke|logout|resume）。只委托给 provider，其余路径继续
  // 外层 Koa（healthz/readyz/api/v1/404），避免 koa2/koa3 混合中间件的签名错位。
  const providerCallback = provider.callback()
  app.use(async (ctx, next) => {
    const isOidcPath = ctx.path === '/.well-known/openid-configuration'
      || ctx.path === '/.well-known/jwks.json'
      || ctx.path.startsWith('/oauth/')
    if (!isOidcPath) {
      await next()
      return
    }
    // provider 是独立 Koa app（koa 3.x）：传入原生 req/res，由它完整响应
    await providerCallback(ctx.req, ctx.res)
  })

  // 未匹配路由统一 404（provider 未处理的路径兜底）
  app.use((ctx) => {
    ctx.status = 404
    ctx.body = { error: 'not_found', requestId: ctx.state.requestId }
  })

  app.on('error', (err, ctx) => {
    logger.error('unhandled', { requestId: ctx.state.requestId, message: err.message })
  })

  return app
}
