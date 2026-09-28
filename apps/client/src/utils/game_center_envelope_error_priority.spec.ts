/**
 * S2 收口：服务端把**细粒度机器码**放在 `error.details.error_code`，顶层 `error.code` 只是大类
 * （席位所有权不足时顶层是 `FORBIDDEN_ACTOR`）。宿主解析必须优先采用细粒度码，否则调用方的
 * 自愈 / 文案分支永远只能拿到大类、永不触发。
 *
 * 形状取自复核者对本机服务端的真实响应探针（原样）：
 *   error.code = FORBIDDEN_ACTOR
 *   error.payload.error.details.error_code = SEAT_PEER_OWNERSHIP_REQUIRED
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GamePlatformError, requestGamePlatformJson } from './game_center/api'

const API_BASE = 'https://games.example/api/game-platform/v1'

/** 真实席位 403 envelope（错误码位置逐字对齐服务端探针） */
const SEAT_FORBIDDEN_ENVELOPE = {
  success: false,
  error: {
    code: 'FORBIDDEN_ACTOR',
    message: '席位身份凭证所有权不足，需要重新绑定',
    retryable: false,
    request_id: 'req_seat_403',
    details: { error_code: 'SEAT_PEER_OWNERSHIP_REQUIRED' }
  }
}

const jsonResponse = (payload: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  }) as unknown as Response

const requestError = async (payload: unknown, status: number): Promise<GamePlatformError> => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload, status)))
  try {
    await requestGamePlatformJson(`${API_BASE}/matches/gm_1/seat`, { method: 'POST', body: {} })
  } catch (error) {
    return error as GamePlatformError
  }
  throw new Error('请求本应失败但成功了')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('S2：宿主 parseEnvelopeError 优先 details.error_code', () => {
  it('真实席位 403 → code = SEAT_PEER_OWNERSHIP_REQUIRED，顶层类码保留在 envelopeCode', async () => {
    const error = await requestError(SEAT_FORBIDDEN_ENVELOPE, 403)

    expect(error).toBeInstanceOf(GamePlatformError)
    expect(error.code).toBe('SEAT_PEER_OWNERSHIP_REQUIRED')
    expect(error.envelopeCode).toBe('FORBIDDEN_ACTOR')
    expect(error.message).toBe('席位身份凭证所有权不足，需要重新绑定')
    expect(error.retryable).toBe(false)
    expect(error.httpStatus).toBe(403)
    expect(error.requestId).toBe('req_seat_403')
  })

  it('没有 details.error_code 时保持既有语义（顶层 code 优先，envelopeCode 与之相同）', async () => {
    const error = await requestError(
      { success: false, error: { code: 'UPSTREAM_DOWN', message: '服务不可用', retryable: true } },
      503
    )
    expect(error.code).toBe('UPSTREAM_DOWN')
    expect(error.envelopeCode).toBe('UPSTREAM_DOWN')
    expect(error.retryable).toBe(true)
  })

  it('Legacy 文本 error 形状解析不变（HTTP 状态码 + 原文案）', async () => {
    const error = await requestError({ success: false, error: '排行榜暂不可用' }, 502)
    expect(error.code).toBe('HTTP_502')
    expect(error.message).toBe('排行榜暂不可用')
    expect(error.retryable).toBe(true)
  })
})
