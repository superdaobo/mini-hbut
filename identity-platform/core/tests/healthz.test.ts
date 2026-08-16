/**
 * /healthz：不依赖 DB，用于确认函数可启动。
 */
import { describe, expect, it, afterEach } from 'vitest'
import { createApp } from '../src/app.js'
import type { App } from '../src/app.js'
import { withServer, getJson } from './helpers.js'

const apps: App[] = []

afterEach(async () => {
  // 关闭测试中创建的连接池，避免句柄泄漏
  for (const app of apps) {
    const db = app.context.db
    if (db) await db.end()
  }
  apps.length = 0
})

describe('GET /healthz', () => {
  it('不配置 DB 时仍返回 200 ok', async () => {
    const app = createApp({ databaseUrl: undefined })
    apps.push(app)
    await withServer(app, async (baseUrl) => {
      const { status, body, requestId } = await getJson(baseUrl, '/healthz')
      expect(status).toBe(200)
      expect(body).toMatchObject({ status: 'ok' })
      expect(requestId).toBeTruthy()
    })
  })

  it('未知路径返回 404 且不泄露内部信息', async () => {
    const app = createApp({ databaseUrl: undefined })
    apps.push(app)
    await withServer(app, async (baseUrl) => {
      const { status, body } = await getJson(baseUrl, '/does-not-exist')
      expect(status).toBe(404)
      expect(body).toMatchObject({ error: 'not_found' })
    })
  })
})
