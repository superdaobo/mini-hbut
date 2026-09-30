/**
 * 漂流瓶客户端 API 层测试（#910）。
 *
 * 覆盖四类不可回退的约束：
 * 1. **前端校验口径**：文本 1..500（Unicode code point，与后端 Python len 对齐）、
 *    红包金额 0（文本瓶）/ 1..10000 整数；非法输入在**发请求前**被拦下（零请求）；
 * 2. **契约形状**：URL / method / body 字段名（`coin_amount` / `client_request_id`）严格冻结，
 *    响应归一化只读契约字段；
 * 3. **错误语义**：空池 404 `DRIFT_POOL_EMPTY` 原样抛出（不被吞并/改写），
 *    409 细分码透传，网络失败归一化到 `LOCAL_TRANSPORT_FAILED`，未登录 → `LOCAL_AUTH_MISSING`；
 * 4. **安全**：身份只经 Authorization 头，body 绝无用户 ID / wallet delta 字段；
 *    非法 base（明文）绝不发请求；本层无任何 console 输出。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GamePlatformError, LOCAL_ERROR_CODES } from './api'
import {
  DRIFT_COIN_AMOUNT_MAX,
  DRIFT_ERROR_CODES,
  DRIFT_LOCAL_ERROR_CODES,
  DRIFT_REPORT_REASONS,
  DRIFT_TEXT_MAX_LENGTH,
  claimDriftBottle,
  drawRandomDriftBottle,
  hideDriftBottle,
  normalizeDriftBottle,
  publishDriftBottle,
  reportDriftBottle,
  validateDriftCoinAmount,
  validateDriftText
} from './drift'

vi.mock('../identity_access_token', () => ({
  getIdentityAccessToken: vi.fn()
}))

import { getIdentityAccessToken } from '../identity_access_token'

const API_BASE = 'https://games.example/api/game-platform/v1'
const ACCESS_TOKEN = 'at-test-token'

const mockedToken = vi.mocked(getIdentityAccessToken)

const jsonResponse = (payload: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  }) as unknown as Response

const envelopeError = (status: number, code: string, message = '服务端错误'): Response =>
  jsonResponse({ ok: false, error: { code, message, retryable: false, request_id: 'req-1' } }, status)

let fetchMock: ReturnType<typeof vi.fn>

const capturedInit = (index = 0): Record<string, unknown> =>
  (fetchMock.mock.calls[index]?.[1] || {}) as Record<string, unknown>

const capturedUrl = (index = 0): string => String(fetchMock.mock.calls[index]?.[0] || '')

const capturedBody = (index = 0): Record<string, unknown> => {
  const raw = capturedInit(index).body
  return raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : {}
}

beforeEach(() => {
  mockedToken.mockReset()
  mockedToken.mockResolvedValue(ACCESS_TOKEN)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('前端校验（体验层，服务端仍是唯一约束）', () => {
  it('文本 1..500：空 / 空白拒绝，1 与 500 通过，501 拒绝（reason 稳定可映射）', () => {
    expect(validateDriftText('')).toMatchObject({ ok: false, reason: 'empty', length: 0 })
    expect(validateDriftText('   ')).toMatchObject({ ok: false, reason: 'empty' })
    expect(validateDriftText('嗨')).toMatchObject({ ok: true, reason: '', length: 1 })
    expect(validateDriftText('x'.repeat(DRIFT_TEXT_MAX_LENGTH))).toMatchObject({
      ok: true,
      length: 500
    })
    expect(validateDriftText('x'.repeat(DRIFT_TEXT_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      reason: 'tooLong',
      length: 501
    })
  })

  it('文本计数按 code point：500 个 emoji 合法（JS UTF-16 length 会是 1000）', () => {
    const emoji = '🎉'
    expect(emoji.length).toBe(2)
    expect(validateDriftText(emoji.repeat(DRIFT_TEXT_MAX_LENGTH))).toMatchObject({
      ok: true,
      length: 500
    })
    expect(validateDriftText(emoji.repeat(DRIFT_TEXT_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      reason: 'tooLong',
      length: 501
    })
  })

  it('红包金额：空 = 文本瓶（0），0 拒绝（红包模式必须 >0），1..10000 通过，越界/非整数拒绝', () => {
    expect(validateDriftCoinAmount('')).toMatchObject({ ok: true, value: 0 })
    expect(validateDriftCoinAmount(undefined)).toMatchObject({ ok: true, value: 0 })
    expect(validateDriftCoinAmount('0')).toMatchObject({ ok: false, reason: 'notPositive' })
    expect(validateDriftCoinAmount('1')).toMatchObject({ ok: true, value: 1 })
    expect(validateDriftCoinAmount(42)).toMatchObject({ ok: true, value: 42 })
    expect(validateDriftCoinAmount(' 42 ')).toMatchObject({ ok: true, value: 42 })
    expect(validateDriftCoinAmount(String(DRIFT_COIN_AMOUNT_MAX))).toMatchObject({
      ok: true,
      value: DRIFT_COIN_AMOUNT_MAX
    })
    expect(validateDriftCoinAmount(String(DRIFT_COIN_AMOUNT_MAX + 1))).toMatchObject({
      ok: false,
      reason: 'tooLarge'
    })
    for (const bad of ['1.5', '-1', '1e3', 'abc', '１２３', '0x10']) {
      expect(validateDriftCoinAmount(bad), bad).toMatchObject({ ok: false, reason: 'notInteger' })
    }
  })
})

describe('投瓶 publishDriftBottle', () => {
  const PUBLISH_OK = {
    ok: true,
    bottle_id: 'bottle-1',
    status: 'AVAILABLE',
    text: '你好，陌生人',
    coin_amount: 0,
    created_at: '2026-09-30T10:00:00+08:00',
    expires_at: '2026-10-07T10:00:00+08:00'
  }

  it('文本瓶（coinAmount 0）请求形状正确：POST /drift-bottles + AT 头 + 契约字段', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PUBLISH_OK, 201))
    const result = await publishDriftBottle({
      text: '  你好，陌生人  ',
      clientRequestId: 'idem-test-0001',
      apiBase: API_BASE
    })
    expect(capturedUrl()).toBe(`${API_BASE}/drift-bottles`)
    expect(capturedInit().method).toBe('POST')
    const headers = capturedInit().headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    const body = capturedBody()
    expect(body).toEqual({
      text: '你好，陌生人',
      coin_amount: 0,
      client_request_id: 'idem-test-0001'
    })
    expect(result).toMatchObject({
      bottleId: 'bottle-1',
      status: 'AVAILABLE',
      coinAmount: 0,
      expiresAt: '2026-10-07T10:00:00+08:00'
    })
  })

  it('红包瓶金额原样进入 body.coin_amount', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PUBLISH_OK, coin_amount: 100 }, 201))
    const result = await publishDriftBottle({ text: '红包来啦', coinAmount: 100, apiBase: API_BASE })
    expect(capturedBody().coin_amount).toBe(100)
    expect(result.coinAmount).toBe(100)
  })

  it('文本非法 / 金额越界在发请求前拦下（零请求，本地码）', async () => {
    await expect(publishDriftBottle({ text: '', apiBase: API_BASE })).rejects.toMatchObject({
      code: DRIFT_LOCAL_ERROR_CODES.invalidText
    })
    await expect(
      publishDriftBottle({ text: 'x'.repeat(501), apiBase: API_BASE })
    ).rejects.toMatchObject({ code: DRIFT_LOCAL_ERROR_CODES.invalidText })
    await expect(
      publishDriftBottle({ text: 'ok', coinAmount: DRIFT_COIN_AMOUNT_MAX + 1, apiBase: API_BASE })
    ).rejects.toMatchObject({ code: DRIFT_LOCAL_ERROR_CODES.invalidAmount })
    await expect(
      publishDriftBottle({ text: 'ok', coinAmount: 1.5, apiBase: API_BASE })
    ).rejects.toMatchObject({ code: DRIFT_LOCAL_ERROR_CODES.invalidAmount })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('未登录（无 Identity AT）→ LOCAL_AUTH_MISSING，且不发出任何请求', async () => {
    mockedToken.mockResolvedValue(null)
    await expect(publishDriftBottle({ text: 'ok', apiBase: API_BASE })).rejects.toMatchObject({
      code: LOCAL_ERROR_CODES.authMissing
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('幂等：同一 clientRequestId 重试 → body 中键保持一致；缺省时自动生成（8..64，两次不同）', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PUBLISH_OK, 201))
    await publishDriftBottle({ text: 'a', clientRequestId: 'idem-retry-1', apiBase: API_BASE })
    await publishDriftBottle({ text: 'a', clientRequestId: 'idem-retry-1', apiBase: API_BASE })
    expect(capturedBody(0).client_request_id).toBe('idem-retry-1')
    expect(capturedBody(1).client_request_id).toBe('idem-retry-1')
    await publishDriftBottle({ text: 'b', apiBase: API_BASE })
    await publishDriftBottle({ text: 'b', apiBase: API_BASE })
    const first = String(capturedBody(2).client_request_id)
    const second = String(capturedBody(3).client_request_id)
    expect(first.length).toBeGreaterThanOrEqual(8)
    expect(first.length).toBeLessThanOrEqual(64)
    expect(second).not.toBe(first)
  })
})

describe('捞瓶 drawRandomDriftBottle', () => {
  it('成功时归一化契约字段，默认带 exclude_recent=true', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        bottle: {
          bottle_id: 'b-9',
          text: '瓶中留言',
          coin_amount: 5,
          status: 'AVAILABLE',
          expires_at: '2026-10-01T00:00:00+08:00',
          sender_label: '匿名同学',
          is_mine: false
        }
      })
    )
    const bottle = await drawRandomDriftBottle({ apiBase: API_BASE })
    expect(capturedUrl()).toBe(`${API_BASE}/drift-bottles/random?exclude_recent=true`)
    expect(bottle).toEqual({
      bottleId: 'b-9',
      text: '瓶中留言',
      coinAmount: 5,
      status: 'AVAILABLE',
      expiresAt: '2026-10-01T00:00:00+08:00',
      senderLabel: '匿名同学',
      isMine: false
    })
  })

  it('exclude_recent=false 显式透传', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, bottle: { bottle_id: 'b-1' } }))
    await drawRandomDriftBottle({ apiBase: API_BASE, excludeRecent: false })
    expect(capturedUrl()).toContain('exclude_recent=false')
  })

  it('空池 404 DRIFT_POOL_EMPTY 原样抛出（不被吞并，UI 才能按正常状态渲染）', async () => {
    fetchMock.mockResolvedValue(envelopeError(404, DRIFT_ERROR_CODES.poolEmpty, '海里还没有瓶子'))
    const error = await drawRandomDriftBottle({ apiBase: API_BASE }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GamePlatformError)
    expect((error as GamePlatformError).code).toBe(DRIFT_ERROR_CODES.poolEmpty)
    expect((error as GamePlatformError).httpStatus).toBe(404)
  })

  it('网络失败归一化为可重试的 LOCAL_TRANSPORT_FAILED', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))
    const error = await drawRandomDriftBottle({ apiBase: API_BASE }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GamePlatformError)
    expect((error as GamePlatformError).code).toBe(LOCAL_ERROR_CODES.transportFailed)
    expect((error as GamePlatformError).retryable).toBe(true)
  })

  it('响应缺少 bottle_id → LOCAL_RESPONSE_INVALID（不把残缺数据交给 UI）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, bottle: { text: 'no id' } }))
    await expect(drawRandomDriftBottle({ apiBase: API_BASE })).rejects.toMatchObject({
      code: LOCAL_ERROR_CODES.responseInvalid
    })
  })
})

describe('领取 / 举报 / 隐藏', () => {
  it('领取成功：POST claim + 归一化 credited', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        bottle_id: 'b-1',
        status: 'CLAIMED',
        coin_amount: 8,
        claimed_at: '2026-09-30T10:00:00+08:00',
        credited: true
      })
    )
    const result = await claimDriftBottle('b-1', { apiBase: API_BASE })
    expect(capturedUrl()).toBe(`${API_BASE}/drift-bottles/b-1/claim`)
    expect(capturedInit().method).toBe('POST')
    // 契约未定义 claim body：显式空 JSON（兼容服务端统一 body 解析路径）
    expect(capturedBody()).toEqual({})
    expect(result).toMatchObject({ bottleId: 'b-1', status: 'CLAIMED', coinAmount: 8, credited: true })
  })

  it('自领 / 重复领取 / 过期等 409 细分码透传（UI 按码给中文文案）', async () => {
    for (const code of [
      DRIFT_ERROR_CODES.selfClaim,
      DRIFT_ERROR_CODES.alreadyClaimed,
      DRIFT_ERROR_CODES.expired
    ]) {
      fetchMock.mockResolvedValue(envelopeError(409, code))
      const error = await claimDriftBottle('b-2', { apiBase: API_BASE }).catch((e: unknown) => e)
      expect((error as GamePlatformError).code).toBe(code)
      expect((error as GamePlatformError).httpStatus).toBe(409)
    }
  })

  it('空 bottle_id 本地拦下（零请求）', async () => {
    await expect(claimDriftBottle('  ', { apiBase: API_BASE })).rejects.toMatchObject({
      code: LOCAL_ERROR_CODES.responseInvalid
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bottle_id 特殊字符做 URL 编码', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, bottle_id: 'b/1', hidden_for_me: true }))
    await hideDriftBottle('b/1', { apiBase: API_BASE })
    expect(capturedUrl()).toBe(`${API_BASE}/drift-bottles/b%2F1/hide`)
  })

  it('举报：reason 白名单 + detail 超长截断到 200', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, report_id: 'r-1', status: 'PENDING', bottle_status_after: 'AVAILABLE' })
    )
    const result = await reportDriftBottle('b-3', {
      reason: 'spam',
      detail: 'x'.repeat(260),
      apiBase: API_BASE
    })
    const body = capturedBody()
    expect(body.reason).toBe('spam')
    expect(String(body.detail)).toHaveLength(200)
    expect(result).toMatchObject({ reportId: 'r-1', status: 'PENDING' })
    expect([...DRIFT_REPORT_REASONS]).toContain(body.reason)
  })

  it('举报原因不在白名单 → 本地拦下（零请求）', async () => {
    await expect(
      reportDriftBottle('b-3', {
        reason: 'hack' as unknown as (typeof DRIFT_REPORT_REASONS)[number],
        apiBase: API_BASE
      })
    ).rejects.toMatchObject({ code: DRIFT_LOCAL_ERROR_CODES.invalidReason })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('隐藏：POST hide + hidden_for_me 归一化', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, bottle_id: 'b-4', hidden_for_me: true }))
    const result = await hideDriftBottle('b-4', { apiBase: API_BASE })
    expect(capturedUrl()).toBe(`${API_BASE}/drift-bottles/b-4/hide`)
    expect(result).toEqual({ bottleId: 'b-4', hiddenForMe: true })
  })
})

describe('安全与隐私护栏', () => {
  it('明文 / 非法 base 覆盖绝不发请求：要么配置缺失报错，要么回落到 https 环境默认源', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, bottle: { bottle_id: 'b-1' } }))
    const error = await drawRandomDriftBottle({ apiBase: 'http://evil.example/api' }).catch(
      (e: unknown) => e
    )
    if (fetchMock.mock.calls.length > 0) {
      const url = capturedUrl()
      expect(url).not.toContain('evil.example')
      expect(url.startsWith('https://')).toBe(true)
    } else {
      expect(error).toMatchObject({ code: LOCAL_ERROR_CODES.configMissing })
    }
  })

  it('请求体绝不含用户身份 / 钱包 delta 字段（身份只经 Authorization 头）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, bottle_id: 'b-1' }))
    await publishDriftBottle({
      text: 'hi',
      coinAmount: 5,
      clientRequestId: 'idem-body-shape-1',
      apiBase: API_BASE
    })
    await claimDriftBottle('b-1', { apiBase: API_BASE })
    const serialized = fetchMock.mock.calls
      .map((call) => String((call[1] as Record<string, unknown> | undefined)?.body || ''))
      .join('\n')
    for (const forbidden of [
      'sender_user_id',
      'sender_player_id',
      'claimer_user_id',
      'claimer_player_id',
      'user_id',
      'student_id',
      'xp_delta',
      'coin_delta',
      'balance'
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
    const headers = capturedInit(0).headers as Record<string, string>
    expect(Object.keys(headers)).toContain('Authorization')
  })

  it('本层不做任何 console / debug 输出', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    fetchMock.mockResolvedValue(envelopeError(429, DRIFT_ERROR_CODES.rateLimited, '操作太频繁'))
    await expect(drawRandomDriftBottle({ apiBase: API_BASE })).rejects.toBeInstanceOf(
      GamePlatformError
    )
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('normalizeDriftBottle 兼容 data 包裹（容错不改变契约字段名）', () => {
    const bottle = normalizeDriftBottle({
      ok: true,
      data: { bottle: { bottle_id: 'b-x', text: 't', coin_amount: '7', is_mine: true } }
    })
    expect(bottle.bottleId).toBe('b-x')
    expect(bottle.coinAmount).toBe(7)
    expect(bottle.isMine).toBe(true)
  })
})
