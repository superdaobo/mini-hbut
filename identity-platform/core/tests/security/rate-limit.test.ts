/**
 * #626 限流模块测试：Postgres 原子计数、中间件 429、fail-open/closed、
 * 窗口轮换、清理、环境推断（pg-mem 双后端同套 SQL）。
 */
import { describe, expect, it } from 'vitest'
import Koa from 'koa'
import http from 'node:http'
import {
  checkRateLimit,
  cleanupExpiredBuckets,
  hashIpForRateLimit,
  rateLimitEnabledByEnv,
  rateLimitMiddleware,
  DEFAULT_RATE_LIMIT_GROUPS,
  type RateLimitGroup,
} from '../../src/security/rate-limit.js'
import type { SqlExecutor } from '../../src/db/types.js'
import { createTestDatabase } from '../helpers/pg.js'

const smallRule: RateLimitGroup = {
  name: 'testGroup',
  prefixes: ['/api/v1/test'],
  methods: ['POST'],
  rule: { limit: 3, windowSeconds: 60, failPolicy: 'closed' },
}

/** 用中间件 + 简单回包路由起临时 http server */
async function withServer(app: Koa): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server = http.createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('无法获取测试端口')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}

describe('hashIpForRateLimit', () => {
  it('同一 IP 哈希稳定，且不含原始 IP（防日志泄漏）', async () => {
    const db = await createTestDatabase()
    try {
      const h1 = hashIpForRateLimit('10.0.0.7')
      const h2 = hashIpForRateLimit('10.0.0.7')
      expect(h1).toBe(h2)
      expect(h1.length).toBe(16)
      expect(h1).not.toContain('10.0.0.7')
      expect(hashIpForRateLimit('10.0.0.8')).not.toBe(h1)
    } finally {
      await db.cleanup()
    }
  })
})

describe('checkRateLimit（Postgres 原子计数）', () => {
  it('并发同一 key 计数精确递增（无竞态丢失）', async () => {
    const db = await createTestDatabase()
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          checkRateLimit(db.sql, smallRule, '203.0.113.9', Date.now()),
        ),
      )
      // limit=3：前 3 次放行，其余拒绝
      const allowed = results.filter((r) => r.allowed).length
      const denied = results.filter((r) => !r.allowed).length
      expect(allowed).toBe(3)
      expect(denied).toBe(17)
      const deniedOne = results.find((r) => !r.allowed)
      expect(deniedOne?.retryAfterSeconds).toBeGreaterThan(0)
    } finally {
      await db.cleanup()
    }
  })

  it('不同 IP 独立计数（不因一人攻击封全 NAT）', async () => {
    const db = await createTestDatabase()
    try {
      for (let i = 0; i < 3; i += 1) {
        const r = await checkRateLimit(db.sql, smallRule, '203.0.113.1', Date.now())
        expect(r.allowed).toBe(true)
      }
      // 第一个 IP 已到 limit=3；第二个 IP 从头计数
      const other = await checkRateLimit(db.sql, smallRule, '203.0.113.2', Date.now())
      expect(other.allowed).toBe(true)
      const again = await checkRateLimit(db.sql, smallRule, '203.0.113.2', Date.now())
      expect(again.allowed).toBe(true)
    } finally {
      await db.cleanup()
    }
  })

  it('窗口过期后重置计数（固定窗口轮换）', async () => {
    const db = await createTestDatabase()
    try {
      const now = Date.now()
      for (let i = 0; i < 3; i += 1) {
        await checkRateLimit(db.sql, smallRule, '198.51.100.4', now)
      }
      const denied = await checkRateLimit(db.sql, smallRule, '198.51.100.4', now)
      expect(denied.allowed).toBe(false)
      // 下一窗口（now + windowSeconds*1000）
      const nextWindow = now + 60_000
      const allowed = await checkRateLimit(db.sql, smallRule, '198.51.100.4', nextWindow)
      expect(allowed.allowed).toBe(true)
    } finally {
      await db.cleanup()
    }
  })
})

describe('rateLimitMiddleware（Koa 层）', () => {
  it('超限返回 429 + Retry-After + no-store', async () => {
    const db = await createTestDatabase()
    try {
      const app = new Koa()
      app.use(
        rateLimitMiddleware({
          sql: db.sql,
          enabled: true,
          cleanupProbability: 0,
          groups: [smallRule],
        }),
      )
      app.use((ctx) => {
        ctx.body = { ok: true }
      })
      const { baseUrl, close } = await withServer(app)
      try {
        const results = []
        for (let i = 0; i < 4; i += 1) {
          const res = await fetch(`${baseUrl}/api/v1/test/abc`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          results.push({ status: res.status, retryAfter: res.headers.get('retry-after') })
        }
        expect(results.slice(0, 3).every((r) => r.status === 200)).toBe(true)
        const last = results[3]!
        expect(last.status).toBe(429)
        expect(Number(last.retryAfter)).toBeGreaterThan(0)
        const body = await (await fetch(`${baseUrl}/api/v1/test/abc`, {
          method: 'POST',
          body: '{}',
        })).json()
        expect(body).toEqual({ error: 'rate_limited', retry_after: expect.any(Number) })
      } finally {
        await close()
      }
    } finally {
      await db.cleanup()
    }
  })

  it('豁免路径（/healthz）不受限流影响', async () => {
    const db = await createTestDatabase()
    try {
      const app = new Koa()
      app.use(
        rateLimitMiddleware({
          sql: db.sql,
          enabled: true,
          cleanupProbability: 0,
          groups: [smallRule],
        }),
      )
      app.use((ctx) => {
        ctx.body = 'alive'
      })
      const { baseUrl, close } = await withServer(app)
      try {
        for (let i = 0; i < 10; i += 1) {
          const res = await fetch(`${baseUrl}/healthz`)
          expect(res.status).toBe(200)
        }
      } finally {
        await close()
      }
    } finally {
      await db.cleanup()
    }
  })

  it('未匹配分组的路径放行', async () => {
    const db = await createTestDatabase()
    try {
      const app = new Koa()
      app.use(
        rateLimitMiddleware({
          sql: db.sql,
          enabled: true,
          cleanupProbability: 0,
          groups: [smallRule],
        }),
      )
      app.use((ctx) => {
        ctx.body = 'other'
      })
      const { baseUrl, close } = await withServer(app)
      try {
        for (let i = 0; i < 100; i += 1) {
          const res = await fetch(`${baseUrl}/api/v1/whatever`)
          expect(res.status).toBe(200)
        }
      } finally {
        await close()
      }
    } finally {
      await db.cleanup()
    }
  })

  it('fail-closed：limiter 后端失败 → 503（高风险端点）', async () => {
    const db = await createTestDatabase()
    try {
      const brokenSql: SqlExecutor = {
        query: async () => {
          throw new Error('db down')
        },
        withTransaction: async () => {
          throw new Error('db down')
        },
      }
      const app = new Koa()
      app.use(
        rateLimitMiddleware({
          sql: brokenSql,
          enabled: true,
          cleanupProbability: 0,
          groups: [smallRule],
        }),
      )
      app.use((ctx) => {
        ctx.body = { ok: true }
      })
      const { baseUrl, close } = await withServer(app)
      try {
        const res = await fetch(`${baseUrl}/api/v1/test/abc`, { method: 'POST', body: '{}' })
        expect(res.status).toBe(503)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.error).toBe('rate_limiter_unavailable')
      } finally {
        await close()
      }
    } finally {
      await db.cleanup()
    }
  })

  it('fail-open：limiter 后端失败 → 放行（低风险端点）', async () => {
    const db = await createTestDatabase()
    try {
      const openGroup: RateLimitGroup = {
        name: 'openGroup',
        prefixes: ['/api/v1/open'],
        rule: { limit: 3, windowSeconds: 60, failPolicy: 'open' },
      }
      const brokenSql: SqlExecutor = {
        query: async () => {
          throw new Error('db down')
        },
        withTransaction: async () => {
          throw new Error('db down')
        },
      }
      const app = new Koa()
      app.use(
        rateLimitMiddleware({
          sql: brokenSql,
          enabled: true,
          cleanupProbability: 0,
          groups: [openGroup],
        }),
      )
      app.use((ctx) => {
        ctx.body = { ok: true }
      })
      const { baseUrl, close } = await withServer(app)
      try {
        const res = await fetch(`${baseUrl}/api/v1/open/x`)
        expect(res.status).toBe(200)
      } finally {
        await close()
      }
    } finally {
      await db.cleanup()
    }
  })

  it('enabled=false 时全部放行（development 默认行为）', async () => {
    const db = await createTestDatabase()
    try {
      const app = new Koa()
      app.use(rateLimitMiddleware({ sql: db.sql, enabled: false }))
      app.use((ctx) => {
        ctx.body = { ok: true }
      })
      const { baseUrl, close } = await withServer(app)
      try {
        for (let i = 0; i < 50; i += 1) {
          const res = await fetch(`${baseUrl}/oauth/token`, { method: 'POST' })
          expect(res.status).toBe(200)
        }
      } finally {
        await close()
      }
    } finally {
      await db.cleanup()
    }
  })
})

describe('rateLimitEnabledByEnv', () => {
  it('production/preview 默认启用；development/test 默认禁用', () => {
    expect(rateLimitEnabledByEnv({ IDENTITY_ENVIRONMENT: 'production' })).toBe(true)
    expect(rateLimitEnabledByEnv({ IDENTITY_ENVIRONMENT: 'preview' })).toBe(true)
    expect(rateLimitEnabledByEnv({ IDENTITY_ENVIRONMENT: 'development' })).toBe(false)
    expect(rateLimitEnabledByEnv({})).toBe(false)
  })
})

describe('cleanupExpiredBuckets', () => {
  it('删除过期桶、保留新鲜桶', async () => {
    const db = await createTestDatabase()
    try {
      const now = Date.now()
      await checkRateLimit(db.sql, smallRule, '192.0.2.1', now)
      await checkRateLimit(db.sql, smallRule, '192.0.2.2', now - 3600_000)
      // 模拟第二个桶已陈旧（updated_at 是数据库当前时间，需显式改旧）
      await db.sql.query(
        "UPDATE rate_limit_buckets SET updated_at = $1 WHERE bucket_key LIKE $2",
        [new Date(now - 3600_000), `%${hashIpForRateLimit('192.0.2.2')}`],
      )
      const rows = await db.sql.query<{ bucket_key: string }>('SELECT bucket_key FROM rate_limit_buckets')
      expect(rows.rows.length).toBe(2)
      await cleanupExpiredBuckets(db.sql, 60, now)
      const after = await db.sql.query<{ bucket_key: string }>('SELECT bucket_key FROM rate_limit_buckets')
      expect(after.rows.length).toBe(1)
      expect(after.rows[0]!.bucket_key).toContain(hashIpForRateLimit('192.0.2.1'))
    } finally {
      await db.cleanup()
    }
  })
})

describe('DEFAULT_RATE_LIMIT_GROUPS（#626 要求覆盖面）', () => {
  it('覆盖 issue 要求的全部保护点', () => {
    const names = DEFAULT_RATE_LIMIT_GROUPS.map((g) => g.name)
    for (const required of [
      'token', // /token brute/replay
      'authorize', // /authorize abuse
      'requestStatus', // AuthRequest status read
      'enrollChallenge', // Device enrollment challenge
      'enroll', // Device enroll
      'approve', // approve
      'developerWrite', // Developer create/submit/rotate
      'admin', // Admin login/action
    ]) {
      expect(names).toContain(required)
    }
    // token 组必须 fail closed（暴力/重放主战场）
    const token = DEFAULT_RATE_LIMIT_GROUPS.find((g) => g.name === 'token')!
    expect(token.rule.failPolicy).toBe('closed')
  })
})
