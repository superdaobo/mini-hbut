/**
 * /readyz：轻量 DB 连通性检查。
 * 安全断言：任何失败原因码都不泄露连接串、schema、账号。
 */
import { describe, expect, it, afterEach } from 'vitest'
import { createApp } from '../src/app.js'
import type { App } from '../src/app.js'
import { withServer, getJson } from './helpers.js'

const apps: App[] = []

afterEach(async () => {
  for (const app of apps) {
    const db = app.context.db
    if (db) await db.end()
  }
  apps.length = 0
})

describe('GET /readyz', () => {
  it('未配置 IDENTITY_DATABASE_URL 时返回 503 DATABASE_URL_NOT_SET', async () => {
    const app = createApp({ databaseUrl: undefined })
    apps.push(app)
    await withServer(app, async (baseUrl) => {
      const { status, body } = await getJson(baseUrl, '/readyz')
      expect(status).toBe(503)
      expect(body).toMatchObject({ status: 'not_ready', reason: 'DATABASE_URL_NOT_SET' })
    })
  })

  it('DB 不可达时返回 503 DB_UNREACHABLE，且响应不泄露连接串', async () => {
    // 端口 1 通常不可达：制造必失败的连通性探测
    const app = createApp({
      databaseUrl: 'postgresql://leak_user:leak_pass@127.0.0.1:1/leak_db', // secretguard: allow-test-fixture
    })
    apps.push(app)
    await withServer(app, async (baseUrl) => {
      const { status, body } = await getJson(baseUrl, '/readyz')
      expect(status).toBe(503)
      expect(body).toMatchObject({ status: 'not_ready', reason: 'DB_UNREACHABLE' })
      const raw = JSON.stringify(body)
      expect(raw).not.toContain('leak_user')
      expect(raw).not.toContain('leak_pass')
      expect(raw).not.toContain('leak_db')
      expect(raw).not.toContain('postgresql')
      expect(raw).not.toContain('127.0.0.1')
    })
  }, 15_000)
})
