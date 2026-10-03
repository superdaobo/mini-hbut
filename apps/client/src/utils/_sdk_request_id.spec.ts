/**
 * #964：SDK transport 层的 X-Request-Id 全链路。
 *
 * 锁定：每个请求注入 `X-Request-Id`（形状与服务端 `req_<hex>` 兼容）；重试共享同一 id；
 * 调用方显式传入时复用同值；响应 `requestId` 与错误对象 `GamePlatformError.requestId`
 * 透出同一 id（服务端返回值优先）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isGamePlatformError } from '../../../../website/modules-src/_sdk/src/index.js'
import { createTransport } from '../../../../website/modules-src/_sdk/src/transport.js'

const BASE = 'https://games.example/api/game-platform/v1'

const REQUEST_ID_RE = /^req_[0-9a-f]{8,61}$/

interface CapturedCall {
  url: string
  headers: Record<string, string>
}

/** 捕获 transport 发出的请求（headers 键名统一小写） */
const captureFetch = (responses: Array<Record<string, unknown>>) => {
  const captured: CapturedCall[] = []
  let index = 0
  const fetchImpl = vi.fn(async (url: unknown, init?: { headers?: unknown }) => {
    const rawHeaders = (init?.headers || {}) as Record<string, string>
    captured.push({
      url: String(url),
      headers: Object.fromEntries(
        Object.entries(rawHeaders).map(([key, value]) => [key.toLowerCase(), String(value)])
      )
    })
    const body = responses[Math.min(index, responses.length - 1)]
    index += 1
    const status = Number(body?.__status || 200)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  return { captured, fetchImpl }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('#964 SDK transport：请求 ID 注入', () => {
  it('requestJson 注入 X-Request-Id（形状合法），响应 requestId 服务端值优先', async () => {
    const { captured, fetchImpl } = captureFetch([
      { success: true, request_id: 'req_srv_1' }
    ])
    const transport = createTransport({ fetchImpl })

    const result = await transport.requestJson({ url: `${BASE}/meta` })

    expect(captured[0].headers['x-request-id']).toMatch(REQUEST_ID_RE)
    expect(result.requestId).toBe('req_srv_1')
  })

  it('服务端未返回 request_id → requestId 回落客户端生成值，且与发送头同值', async () => {
    const { captured, fetchImpl } = captureFetch([{ success: true }])
    const transport = createTransport({ fetchImpl })

    const result = await transport.requestJson({ url: `${BASE}/meta` })

    expect(captured[0].headers['x-request-id']).toMatch(REQUEST_ID_RE)
    expect(result.requestId).toBe(captured[0].headers['x-request-id'])
  })

  it('调用方传入小写 x-request-id → 保留原值（大小写不敏感识别）', async () => {
    const { captured, fetchImpl } = captureFetch([{ success: true }])
    const transport = createTransport({ fetchImpl })

    const result = await transport.requestJson({
      url: `${BASE}/meta`,
      headers: { 'x-request-id': 'req_caller_1' }
    })

    expect(captured[0].headers['x-request-id']).toBe('req_caller_1')
    expect(result.requestId).toBe('req_caller_1')
  })

  it('envelope_missing（200 但非 envelope）错误对象携带发送头同值的 id', async () => {
    const { captured, fetchImpl } = captureFetch([{ hello: 'not an envelope' }])
    const transport = createTransport({ fetchImpl })

    const error = await transport.requestJson({ url: `${BASE}/meta` }).catch((e: unknown) => e)

    expect(isGamePlatformError(error)).toBe(true)
    expect((error as { requestId?: string }).requestId).toBe(captured[0].headers['x-request-id'])
    // 错误上报通道（§10 L5）只带 code + request_id —— id 必须能从错误对象取出
    expect((error as { toReport?: () => { request_id?: string } }).toReport?.().request_id).toBe(
      captured[0].headers['x-request-id']
    )
  })

  it('requestJsonWithRetry：同一逻辑请求的各次重试共享同一请求 ID', async () => {
    const { captured, fetchImpl } = captureFetch([
      // 500 + retryable envelope：errorFromEnvelope 判定可重试 → 触发一次退避重试
      { __status: 500, success: false, error: { code: 'INTERNAL_ERROR', retryable: true, message: 'boom' } },
      { success: true, request_id: 'req_srv_retry_ok' }
    ])
    const transport = createTransport({ fetchImpl, retryDelaysMs: [1] })

    const result = await transport.requestJsonWithRetry({ url: `${BASE}/meta` })

    expect(captured).toHaveLength(2)
    expect(captured[0].headers['x-request-id']).toMatch(REQUEST_ID_RE)
    expect(captured[1].headers['x-request-id']).toBe(captured[0].headers['x-request-id'])
    expect(result.requestId).toBe('req_srv_retry_ok')
    expect(result.attempts).toBe(2)
  })
})
