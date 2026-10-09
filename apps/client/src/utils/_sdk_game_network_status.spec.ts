import { describe, expect, it, vi } from 'vitest'
import { isGamePlatformError } from '../../../../website/modules-src/_sdk/src/index.js'
import { createTransport } from '../../../../website/modules-src/_sdk/src/transport.js'

const BASE = 'https://games.example/api/game-platform/v1'

describe('#1016 SDK transport：无响应与真实 HTTP 500 严格区分', () => {
  it('网络失败没有 HTTP 响应，不得显示虚假的 500', async () => {
    const transport = createTransport({
      fetchImpl: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    })
    const error = await transport.requestJson({ url: `${BASE}/meta` }).catch((cause: unknown) => cause)
    expect(isGamePlatformError(error)).toBe(true)
    expect((error as { status?: number }).status).toBe(0)
    expect((error as { message?: string }).message).toContain('网络不可用')
  })

  it('实际收到 500 响应必须如实保留 HTTP 500', async () => {
    const transport = createTransport({
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', retryable: true, message: '服务器错误' }
        }), { status: 500 })
      )
    })
    const error = await transport.requestJson({ url: `${BASE}/meta` }).catch((cause: unknown) => cause)
    expect((error as { status?: number }).status).toBe(500)
  })
})
