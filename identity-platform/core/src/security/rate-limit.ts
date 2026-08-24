/**
 * Postgres 原子限流中间件（#626 Threat 12：Rate Limit / Abuse）。
 *
 * 设计（issue 要求逐条对应）：
 * - 持久化：不依赖进程内 Map（Serverless 多实例共享状态），计数落在
 *   rate_limit_buckets 表（migration 0003），单条
 *   INSERT ... ON CONFLICT DO UPDATE ... RETURNING 原子完成，并发请求
 *   各自拿到正确的 count（行锁保证，pg-mem 与真 PG 行为一致）；
 * - key 组合：endpoint 分组 + IP 哈希（IP 只存 sha256 前 16 hex，不落日志）；
 *   不做「一人攻击封整个校园 NAT」——分组按 endpoint 区分，IP 级不叠加
 *   到网段级；
 * - fail-open / fail-closed：按 endpoint 风险区分。登录/注册/审批/管理等高
 *   风险面 fail closed（limiter 后端失败直接 503，宁可不服务不可放行）；
 *   只读/轮询等低风险面 fail open（后端抖动时放行，由业务自身 DB 查询兜底）；
 * - 429 + Retry-After：命中限流返回 429，并在响应头给出剩余等待秒数；
 * - 桶清理：写入时按概率清理过期桶（updated_at < 阈值），防止表无限膨胀
 *   （Serverless 无后台任务，概率清理是低成本折中）。
 *
 * 启用策略：
 * - production / preview 默认启用（identity 对外开放的前提防线）；
 * - development / test 默认禁用（本地调试不受干扰），测试可显式注入
 *   rules/enabled 构造限流场景。
 */
import type { Middleware } from 'koa'
import type { SqlExecutor } from '../db/types.js'
import { sha256Hex } from './hash.js'

export type RateLimitFailPolicy = 'open' | 'closed'

/** 单个 endpoint 分组的限流规则 */
export interface RateLimitRule {
  /** 窗口内允许的请求上限 */
  limit: number
  /** 固定窗口长度（秒） */
  windowSeconds: number
  /** limiter 后端失败时的策略：closed = 拒绝（503），open = 放行 */
  failPolicy: RateLimitFailPolicy
}

/** endpoint 分组：按路径前缀 + 方法聚合（key 粒度是分组而非完整 path） */
export interface RateLimitGroup {
  name: string
  prefixes: string[]
  methods?: readonly string[]
  rule: RateLimitRule
}

export type EnvLike = Record<string, string | undefined>

/**
 * 默认分组与规则（#626 要求至少保护：/authorize、AuthRequest status、
 * enrollment challenge、enroll、approve/deny、developer write、admin、
 * /token brute/replay）。
 *
 * 数值口径（规模可接受时）：
 * - token 是暴力/重放主战场：60/min/IP fail closed；
 * - authorize 用户可能反复重试（Deep Link 未响应）：120/min fail open；
 * - status 轮询是高频只读：600/min fail open（页面 2s 轮询约 30/min/设备）；
 * - enroll challenge/enroll/approve 是设备注册与授权关键面：fail closed，
 *   同时有 handoff + 签名双因子，限流只是纵深；
 * - developer/admin mutation 是管理员/开发者面：fail closed。
 */
export const DEFAULT_RATE_LIMIT_GROUPS: readonly RateLimitGroup[] = [
  { name: 'token', prefixes: ['/oauth/token'], methods: ['POST'], rule: { limit: 60, windowSeconds: 60, failPolicy: 'closed' } },
  { name: 'authorize', prefixes: ['/oauth/authorize'], methods: ['GET', 'POST'], rule: { limit: 120, windowSeconds: 60, failPolicy: 'open' } },
  { name: 'requestStatus', prefixes: ['/api/v1/requests/'], methods: ['GET'], rule: { limit: 600, windowSeconds: 60, failPolicy: 'open' } },
  { name: 'requestRead', prefixes: ['/api/v1/requests/'], methods: ['POST'], rule: { limit: 120, windowSeconds: 60, failPolicy: 'open' } },
  { name: 'enrollChallenge', prefixes: ['/api/v1/app/devices/enrollment-challenges'], methods: ['POST'], rule: { limit: 30, windowSeconds: 300, failPolicy: 'closed' } },
  { name: 'enroll', prefixes: ['/api/v1/app/devices/enroll'], methods: ['POST'], rule: { limit: 20, windowSeconds: 300, failPolicy: 'closed' } },
  { name: 'approve', prefixes: ['/api/v1/app/auth-requests/'], methods: ['POST'], rule: { limit: 60, windowSeconds: 60, failPolicy: 'closed' } },
  { name: 'deviceRevoke', prefixes: ['/api/v1/app/devices/'], methods: ['POST'], rule: { limit: 30, windowSeconds: 60, failPolicy: 'closed' } },
  { name: 'developerRead', prefixes: ['/api/v1/developer/'], methods: ['GET'], rule: { limit: 300, windowSeconds: 60, failPolicy: 'open' } },
  { name: 'developerWrite', prefixes: ['/api/v1/developer/'], methods: ['POST', 'PATCH', 'DELETE'], rule: { limit: 60, windowSeconds: 60, failPolicy: 'closed' } },
  // #688 账户级 API Key（Bearer 直连）：读多写少，读 fail open / 写 fail closed
  { name: 'apiKeyRead', prefixes: ['/api/v1/account/'], methods: ['GET'], rule: { limit: 300, windowSeconds: 60, failPolicy: 'open' } },
  { name: 'apiKeyWrite', prefixes: ['/api/v1/account/'], methods: ['POST', 'PATCH', 'PUT', 'DELETE'], rule: { limit: 60, windowSeconds: 60, failPolicy: 'closed' } },
  { name: 'admin', prefixes: ['/api/v1/admin/'], rule: { limit: 120, windowSeconds: 60, failPolicy: 'closed' } },
  { name: 'userinfo', prefixes: ['/oauth/userinfo'], methods: ['GET', 'POST'], rule: { limit: 600, windowSeconds: 60, failPolicy: 'open' } },
]

/** 永远豁免的路径（健康检查与公开发现文档；DoS 由 CDN 层承担） */
const EXEMPT_PREFIXES = ['/healthz', '/readyz', '/.well-known/']

export interface RateLimiterOptions {
  sql: SqlExecutor
  /** 环境变量（缺省 process.env） */
  env?: EnvLike
  /** 注入分组规则（测试用小 limit）；缺省 DEFAULT_RATE_LIMIT_GROUPS */
  groups?: readonly RateLimitGroup[]
  /** 显式启用/禁用；缺省按环境推断（production/preview 启用） */
  enabled?: boolean
  /** 过期桶清理概率（0..1）；测试可注入 0 关闭 */
  cleanupProbability?: number
  /** 桶保留时长（秒），超过即视为可清理 */
  bucketTtlSeconds?: number
}

/** 按环境推断是否默认启用：production/preview 必须启用 */
export function rateLimitEnabledByEnv(env: EnvLike): boolean {
  const environment = (env.IDENTITY_ENVIRONMENT ?? 'development').trim().toLowerCase()
  return environment === 'production' || environment === 'preview'
}

/** 命中分组的路径判断（前缀 + 方法） */
function matchGroup(groups: readonly RateLimitGroup[], method: string, path: string): RateLimitGroup | undefined {
  for (const group of groups) {
    const methodOk = !group.methods || group.methods.length === 0 || group.methods.includes(method)
    if (!methodOk) {
      continue
    }
    if (group.prefixes.some((prefix) => path.startsWith(prefix))) {
      return group
    }
  }
  return undefined
}

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/** IP → 限流 key 片段（哈希，不落原始 IP） */
export function hashIpForRateLimit(ip: string): string {
  return sha256Hex(ip).slice(0, 16)
}

export interface RateLimitDecision {
  allowed: boolean
  /** 命中限流时的剩余等待秒数（Retry-After） */
  retryAfterSeconds: number
}

/** 原子计数并判定（供单测直接调用；middleware 包装成 Koa 中间件） */
export async function checkRateLimit(
  sql: SqlExecutor,
  group: RateLimitGroup,
  ip: string,
  nowMs = Date.now(),
): Promise<RateLimitDecision> {
  const windowMs = group.rule.windowSeconds * 1000
  const windowStart = Math.floor(nowMs / windowMs) * windowMs
  const key = `${group.name}:${hashIpForRateLimit(ip)}`
  const result = await sql.query<{ count: number; window_start: number }>(
    `INSERT INTO rate_limit_buckets (bucket_key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (bucket_key) DO UPDATE SET
       count = CASE WHEN rate_limit_buckets.window_start = $2 THEN rate_limit_buckets.count + 1 ELSE 1 END,
       window_start = CASE WHEN rate_limit_buckets.window_start = $2 THEN rate_limit_buckets.window_start ELSE $2 END,
       updated_at = NOW()
     RETURNING count, window_start`,
    [key, windowStart],
  )
  const row = result.rows[0]
  if (!row) {
    // 极端情况下无返回行：保守按放行处理（窗口语义由下一次计数恢复）
    return { allowed: true, retryAfterSeconds: 0 }
  }
  const count = Number(row.count)
  if (count > group.rule.limit) {
    const windowEndMs = windowStart + windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000))
    return { allowed: false, retryAfterSeconds }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

/** 概率清理过期桶（写入路径上低频执行，防止表无限膨胀） */
export async function cleanupExpiredBuckets(
  sql: SqlExecutor,
  ttlSeconds: number,
  nowMs = Date.now(),
): Promise<void> {
  const threshold = new Date(nowMs - ttlSeconds * 1000)
  await sql.query('DELETE FROM rate_limit_buckets WHERE updated_at < $1', [threshold])
}

/** 构造 Koa 限流中间件（#626：注册在 router 之前，覆盖 OIDC 协议端点与 API） */
export function rateLimitMiddleware(options: RateLimiterOptions): Middleware {
  const env = options.env ?? process.env
  const groups = options.groups ?? DEFAULT_RATE_LIMIT_GROUPS
  const enabled = options.enabled ?? rateLimitEnabledByEnv(env)
  const cleanupProbability = options.cleanupProbability ?? 0.01
  const bucketTtlSeconds = options.bucketTtlSeconds ?? 24 * 3600

  return async (ctx, next) => {
    if (!enabled) {
      await next()
      return
    }
    const path = ctx.path
    if (isExempt(path)) {
      await next()
      return
    }
    const group = matchGroup(groups, ctx.method, path)
    if (!group) {
      await next()
      return
    }
    try {
      const decision = await checkRateLimit(options.sql, group, ctx.ip)
      if (!decision.allowed) {
        ctx.status = 429
        ctx.set('Retry-After', String(decision.retryAfterSeconds))
        ctx.set('Cache-Control', 'no-store')
        ctx.body = { error: 'rate_limited', retry_after: decision.retryAfterSeconds }
        return
      }
    } catch {
      // limiter 后端失败：按 endpoint 风险区分 fail-open / fail-closed
      if (group.rule.failPolicy === 'closed') {
        ctx.status = 503
        ctx.set('Cache-Control', 'no-store')
        ctx.body = { error: 'rate_limiter_unavailable' }
        return
      }
      // fail open：放行，由业务层自身 DB 查询兜底
    }
    // 低频清理（同一次请求内，先计数后清理，避免每次都扫表）
    if (cleanupProbability > 0 && Math.random() < cleanupProbability) {
      await cleanupExpiredBuckets(options.sql, bucketTtlSeconds).catch(() => undefined)
    }
    await next()
  }
}
