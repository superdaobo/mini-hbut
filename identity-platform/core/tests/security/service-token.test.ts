/**
 * #626 BFF→Core 服务令牌认证测试：
 * - 缺失/错误令牌 401（拒绝 header 伪造）；
 * - 正确令牌放行；仅保护 BFF 前缀（/api/v1/requests|admin|developer）；
 * - production/preview 未配置令牌 → 503 fail closed；
 * - development/test 未配置 → 放行（本地联调）；
 * - 常量时间比较（长度不同立即拒绝，不抛异常）。
 */
import { describe, expect, it } from 'vitest'
import Koa from 'koa'
import http from 'node:http'
import {
  safeTokenEqual,
  serviceTokenMiddleware,
  SERVICE_TOKEN_HEADER,
} from '../../src/security/service-token.js'

const TEST_TOKEN = 'service-token-0123456789abcdef-0123456789abcdef'

function buildApp(env: Record<string, string | undefined>, token?: string): Koa {
  const app = new Koa()
  app.use(serviceTokenMiddleware({ env, token }))
  app.use((ctx) => {
    ctx.body = { ok: true }
  })
  return app
}

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

describe('safeTokenEqual（常量时间比较）', () => {
  it('相同返回 true；缺失/长度不同/内容不同返回 false', () => {
    expect(safeTokenEqual(TEST_TOKEN, TEST_TOKEN)).toBe(true)
    expect(safeTokenEqual(TEST_TOKEN, undefined)).toBe(false)
    expect(safeTokenEqual(undefined, TEST_TOKEN)).toBe(false)
    expect(safeTokenEqual(TEST_TOKEN, TEST_TOKEN.slice(0, -1))).toBe(false)
    expect(safeTokenEqual(TEST_TOKEN, `${TEST_TOKEN.slice(0, -1)}X`)).toBe(false)
    expect(safeTokenEqual('', '')).toBe(false)
  })
})

describe('serviceTokenMiddleware', () => {
  it('正确令牌放行 BFF 端点', async () => {
    const app = buildApp({ IDENTITY_ENVIRONMENT: 'production' }, TEST_TOKEN)
    const { baseUrl, close } = await withServer(app)
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/me`, {
        headers: { [SERVICE_TOKEN_HEADER]: TEST_TOKEN },
      })
      expect(res.status).toBe(200)
    } finally {
      await close()
    }
  })

  it('缺失令牌 → 401（拒绝伪造：无令牌不许进 BFF 端点）', async () => {
    const app = buildApp({ IDENTITY_ENVIRONMENT: 'production' }, TEST_TOKEN)
    const { baseUrl, close } = await withServer(app)
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/me`)
      expect(res.status).toBe(401)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('unauthorized')
    } finally {
      await close()
    }
  })

  it('错误令牌 → 401（header 伪造被拒绝）', async () => {
    const app = buildApp({ IDENTITY_ENVIRONMENT: 'production' }, TEST_TOKEN)
    const { baseUrl, close } = await withServer(app)
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/me`, {
        headers: { [SERVICE_TOKEN_HEADER]: 'forged-token-forged-token-forged-token' },
      })
      expect(res.status).toBe(401)
    } finally {
      await close()
    }
  })

  it('requests / developer 前缀同样受保护', async () => {
    const app = buildApp({ IDENTITY_ENVIRONMENT: 'production' }, TEST_TOKEN)
    const { baseUrl, close } = await withServer(app)
    try {
      const r1 = await fetch(`${baseUrl}/api/v1/requests/req_abc`)
      expect(r1.status).toBe(401)
      const r2 = await fetch(`${baseUrl}/api/v1/developer/apps`)
      expect(r2.status).toBe(401)
    } finally {
      await close()
    }
  })

  it('非 BFF 路径不受影响（OIDC 协议端点 / App 端点）', async () => {
    const app = buildApp({ IDENTITY_ENVIRONMENT: 'production' }, TEST_TOKEN)
    const { baseUrl, close } = await withServer(app)
    try {
      const r1 = await fetch(`${baseUrl}/oauth/token`, { method: 'POST' })
      expect(r1.status).toBe(200)
      const r2 = await fetch(`${baseUrl}/api/v1/app/devices/enroll`, { method: 'POST' })
      expect(r2.status).toBe(200)
      const r3 = await fetch(`${baseUrl}/.well-known/openid-configuration`)
      expect(r3.status).toBe(200)
    } finally {
      await close()
    }
  })

  it('production/preview 未配置令牌 → 503 fail closed', async () => {
    const app = buildApp({ IDENTITY_ENVIRONMENT: 'production' })
    const { baseUrl, close } = await withServer(app)
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/me`)
      expect(res.status).toBe(503)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.error).toBe('service_token_not_configured')
    } finally {
      await close()
    }
  })

  it('development/test 未配置令牌 → 放行（本地联调）', async () => {
    const app = buildApp({ IDENTITY_ENVIRONMENT: 'development' })
    const { baseUrl, close } = await withServer(app)
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/me`)
      expect(res.status).toBe(200)
    } finally {
      await close()
    }
  })
})
