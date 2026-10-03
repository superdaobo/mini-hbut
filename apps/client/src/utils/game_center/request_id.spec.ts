/**
 * #964：宿主 V2 请求的 X-Request-Id 全链路。
 *
 * 服务端 `request_id_of` 约定：优先复用客户端 `X-Request-Id`（限长 ≤64、字符集安全），
 * 否则服务端生成 `req_<hex>`。本组测试锁定：
 * 1. 每个 V2 请求都携带请求 ID，形状与服务端 `req_<hex>` 兼容；
 * 2. 调用方显式传入时复用同值（不覆盖）；
 * 3. 错误对象（`GamePlatformError.requestId`）透出同一 id —— 服务端响应值优先
 *   （复用模式下与发送值相同），无响应时透出客户端生成值，用户侧日志可与服务端对齐。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GamePlatformError, createRequestId, requestGamePlatformJson } from './api'

const API_BASE = 'https://games.example/api/game-platform/v1'

/** 服务端形状约束（req_ 前缀 + hex；总长 ≤64） */
const REQUEST_ID_RE = /^req_[0-9a-f]{8,61}$/

interface CapturedCall {
  url: string
  headers: Record<string, string>
}

/** 捕获 fetch 收到的请求（headers 键名统一小写，便于大小写不敏感断言） */
const captureFetch = (respond: () => Response | Promise<Response>) => {
  const captured: CapturedCall[] = []
  const fetchMock = vi.fn(async (url: string | URL, init?: { headers?: unknown }) => {
    const rawHeaders = (init?.headers || {}) as Record<string, string>
    captured.push({
      url: String(url),
      headers: Object.fromEntries(
        Object.entries(rawHeaders).map(([key, value]) => [key.toLowerCase(), String(value)])
      )
    })
    return respond()
  })
  vi.stubGlobal('fetch', fetchMock)
  return captured
}

const okEnvelope = (body: Record<string, unknown> = {}): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, ...body })
  }) as unknown as Response

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('#964 createRequestId：与服务端 req_<hex> 形状兼容', () => {
  it('形状合法：req_ 前缀 + 小写 hex，总长 ≤64', () => {
    for (let i = 0; i < 20; i += 1) {
      const id = createRequestId()
      expect(id).toMatch(REQUEST_ID_RE)
      expect(id.length).toBeLessThanOrEqual(64)
    }
  })

  it('每次生成都不同（可区分并发请求）', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i += 1) seen.add(createRequestId())
    expect(seen.size).toBe(50)
  })
})

describe('#964 requestGamePlatformJson：请求头注入与错误对象透出', () => {
  it('每个 V2 请求携带 X-Request-Id（形状合法）', async () => {
    const captured = captureFetch(() => okEnvelope())
    await requestGamePlatformJson(`${API_BASE}/meta`)

    expect(captured).toHaveLength(1)
    expect(captured[0].headers['x-request-id']).toMatch(REQUEST_ID_RE)
  })

  it('调用方显式传入 X-Request-Id 时复用同值（不覆盖）', async () => {
    const captured = captureFetch(() => okEnvelope())
    await requestGamePlatformJson(`${API_BASE}/leaderboards?game_id=hbut_gomoku`, {
      headers: { 'X-Request-Id': 'req_custom_abc123' }
    })

    expect(captured[0].headers['x-request-id']).toBe('req_custom_abc123')
  })

  it('envelope 错误：错误对象透出服务端 request_id（复用模式下与发送值可对齐）', async () => {
    const captured = captureFetch(() =>
      ({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: {
            code: 'FORBIDDEN_ACTOR',
            message: '席位身份凭证所有权不足',
            retryable: false,
            request_id: 'req_srv_response_1'
          }
        })
      }) as unknown as Response
    )
    const error = await requestGamePlatformJson(`${API_BASE}/matches/gm_1/seat`, {
      method: 'POST',
      body: {}
    }).catch((e: GamePlatformError) => e)

    expect(error).toBeInstanceOf(GamePlatformError)
    expect(error.requestId).toBe('req_srv_response_1')
    // 服务端复用模式下：响应 request_id === 客户端发送的 X-Request-Id
    expect(captured[0].headers['x-request-id']).toBeTruthy()
  })

  it('网络失败（无响应）：错误对象透出客户端生成的请求 ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network down'))))
    const error = await requestGamePlatformJson(`${API_BASE}/meta`).catch(
      (e: GamePlatformError) => e
    )

    expect(error).toBeInstanceOf(GamePlatformError)
    expect(error.code).toBe('LOCAL_TRANSPORT_FAILED')
    expect(error.requestId).toMatch(REQUEST_ID_RE)
  })

  it('非 envelope 的 HTTP 错误（如网关 502）：错误对象透出与请求头同值的 id', async () => {
    const captured = captureFetch(
      () =>
        ({
          ok: false,
          status: 502,
          json: async () => {
            throw new Error('not json')
          }
        }) as unknown as Response
    )
    const error = await requestGamePlatformJson(`${API_BASE}/meta`).catch(
      (e: GamePlatformError) => e
    )

    expect(error.code).toBe('HTTP_502')
    expect(error.requestId).toMatch(REQUEST_ID_RE)
    expect(error.requestId).toBe(captured[0].headers['x-request-id'])
  })
})
