/**
 * oidcFlow.spec.ts —— P2-4（#1208）§4.3 四个命令封装：
 * 成功/失败/未知 kind 折叠、`authorizeUrl` scheme 白名单、invoke 入参形状
 * （单 `input` + snake_case；无参命令不传第二参）、零 console / 零存储。
 *
 * mock 面：`../../../platform/native` 的 `invokeNative`（唯一 invoke 入口）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  oidcAwaitCallback,
  oidcBegin,
  oidcBeginLoopback,
  oidcComplete,
  oidcLogout,
  oidcSessionStatus
} from './oidcFlow'
import { OIDC_MESSAGES } from './oidcErrors'

vi.mock('../../../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: () => false
}))

import { invokeNative } from '../../../platform/native'

const mockInvoke = vi.mocked(invokeNative)

// 与 §4.1 逐字冻结的期望值（独立副本）
const MSG = {
  beginOk: '已打开浏览器，请在浏览器中完成登录',
  loginOk: '登录成功',
  noPending: '登录请求已失效，请重新发起',
  stateMismatch: '登录状态校验失败，请重新发起',
  unknown: '操作失败，请稍后重试'
}

const AUTH_BASE = 'https://auth.example.com'
const STATE_32HEX = '0123456789abcdef0123456789abcdef'
const CALLBACK_URL = `minihbut://identity/callback?code=${'a'.repeat(43)}&state=${STATE_32HEX}`
const FUTURE_TS = (): number => Math.floor(Date.now() / 1000) + 3600

// 含 5 类敏感子串的内部故障错误串（折叠后必须全部消失）
const sensitiveInternalError = (kind: string): string =>
  `internal: ${kind} code=${'a'.repeat(43)} verifier=${'b'.repeat(43)} access_token=at_eyJsecret id_token=eyJx.eyJy.eyJz refresh_token=rt_secret url=${AUTH_BASE}/token?code=${'a'.repeat(43)}`

beforeEach(() => {
  mockInvoke.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── ① oidcBegin ──────────────────────────────────────────────────────────────

describe('oidcBegin（无入参 + authorizeUrl scheme 白名单）', () => {
  it('成功 → {ok:true, kind:"oidc_begin_ok", authorizeUrl, state, expiresAt}；invoke 只传命令名（无第二参/空对象）', async () => {
    const expiresAt = FUTURE_TS()
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      kind: 'oidc_begin_ok',
      message: MSG.beginOk,
      authorize_url: `${AUTH_BASE}/authorize?client_id=app&state=${STATE_32HEX}`,
      state: STATE_32HEX,
      expires_at: expiresAt
    })
    const result = await oidcBegin()
    expect(result).toEqual({
      ok: true,
      kind: 'oidc_begin_ok',
      message: MSG.beginOk,
      authorizeUrl: `${AUTH_BASE}/authorize?client_id=app&state=${STATE_32HEX}`,
      state: STATE_32HEX,
      expiresAt
    })
    // 入参形状：恰好一个参数（命令名）；**不得**是 (cmd, {}) 或 (cmd, undefined)
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke).toHaveBeenCalledWith('identity_oidc_begin')
    expect(mockInvoke.mock.calls[0]).toHaveLength(1)
  })

  it('authorizeUrl scheme 白名单：http/https 通过；javascript:/file:/相对 URL/ftp: 一律拒绝（kind=unknown，不回传原 URL）', async () => {
    const badUrls = [
      `javascript:alert(1)`,
      `file:///C:/Program/evil.exe`,
      `/relative/path?x=1`,
      `//evil.example/authorize`,
      `ftp://${AUTH_BASE}/authorize`,
      'not a url'
    ]
    for (const authorizeUrl of badUrls) {
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        kind: 'oidc_begin_ok',
        message: MSG.beginOk,
        authorize_url: authorizeUrl,
        state: STATE_32HEX,
        expires_at: FUTURE_TS()
      })
      const result = await oidcBegin()
      expect(result, `authorize_url=${authorizeUrl} 必须折叠为失败`).toEqual({
        ok: false,
        kind: 'unknown',
        message: MSG.unknown
      })
      // 原 URL 绝不回传
      expect((result as { message: string }).message).not.toContain(authorizeUrl)
      expect((result as { message: string }).message).not.toContain('javascript')
    }
  })

  it('成功但缺 state / 缺 expires_at → 折叠为 unknown（畸形不当成功透出）', async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      kind: 'oidc_begin_ok',
      authorize_url: `${AUTH_BASE}/authorize`,
      expires_at: FUTURE_TS()
    })
    expect(await oidcBegin()).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      kind: 'oidc_begin_ok',
      authorize_url: `${AUTH_BASE}/authorize`,
      state: STATE_32HEX
    })
    expect(await oidcBegin()).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
  })

  it('稳定失败（ok:false + kind）→ 对应固定文案，不透传原文', async () => {
    for (const kind of ['oidc_disabled', 'oidc_misconfigured'] as const) {
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce({
        ok: false,
        kind,
        message: '内部原始文案 secret-detail'
      })
      const result = await oidcBegin()
      expect(result).toEqual({
        ok: false,
        kind,
        message: OIDC_MESSAGES[kind]
      })
    }
  })

  it('未知 kind（ok:false）→ unknown 文案', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: false, kind: 'zzz_totally_unknown', message: 'x' })
    expect(await oidcBegin()).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
  })

  it('invoke 抛内部故障（含敏感原文）→ unknown 文案，敏感串全部消失', async () => {
    const raw = sensitiveInternalError('oidc_token_exchange_failed')
    mockInvoke.mockRejectedValueOnce(new Error(raw))
    const result = await oidcBegin()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // 固定 token 受控匹配可还原出 token_exchange_failed（与 v2 同款纪律）
      expect(result.kind).toBe('oidc_token_exchange_failed')
      expect(result.message).toBe(OIDC_MESSAGES.oidc_token_exchange_failed)
    }
    for (const fragment of [
      'access_token=at_eyJsecret',
      'verifier=',
      'rt_secret',
      'eyJx',
      'internal:',
      'a'.repeat(43)
    ]) {
      expect(result.message.includes(fragment)).toBe(false)
    }
  })
})

// ── ② oidcComplete（入参形状：单 input + snake_case）──────────────────────────

describe('oidcComplete（{ input: { callback_url } }）', () => {
  it('成功 → {ok:true, kind:"oidc_login_ok", studentIdMasked}；invoke 入参形状逐字段断言', async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      kind: 'oidc_login_ok',
      message: MSG.loginOk,
      student_id_masked: '2023***'
    })
    const result = await oidcComplete(CALLBACK_URL)
    expect(result).toEqual({
      ok: true,
      kind: 'oidc_login_ok',
      message: MSG.loginOk,
      studentIdMasked: '2023***'
    })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    // 单 input 对象 + snake_case（Tauri v2 不做 camelCase 转换）
    expect(mockInvoke).toHaveBeenCalledWith('identity_oidc_complete', {
      input: { callback_url: CALLBACK_URL }
    })
    // 顶层不得出现 camelCase 键
    const args = mockInvoke.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(args)).toEqual(['input'])
  })

  it('state 不匹配（ok:false, kind=oidc_state_mismatch）→ 固定文案「登录状态校验失败，请重新发起」', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: false, kind: 'oidc_state_mismatch', message: 'x' })
    expect(await oidcComplete(CALLBACK_URL)).toEqual({
      ok: false,
      kind: 'oidc_state_mismatch',
      message: MSG.stateMismatch
    })
  })

  it('服务端回显明文学号 → 本地兜底再掩码（不透出明文）', async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      kind: 'oidc_login_ok',
      student_id_masked: '2510231106'
    })
    const result = await oidcComplete(CALLBACK_URL)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.studentIdMasked).toBe('2510***')
    expect(result.studentIdMasked).not.toContain('2510231106')
  })

  it('成功但缺 student_id_masked → 折叠为 unknown（畸形不当成功透出）', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_login_ok' })
    expect(await oidcComplete(CALLBACK_URL)).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
  })
})

// ── ③ oidcSessionStatus / ④ oidcLogout（无入参）───────────────────────────────

describe('oidcSessionStatus / oidcLogout', () => {
  it('session_status active → 学号掩码 + 过期时间；invoke 只传命令名', async () => {
    const expiresAt = FUTURE_TS()
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      kind: 'oidc_session_active',
      student_id_masked: '2023***',
      expires_at: expiresAt
    })
    const result = await oidcSessionStatus()
    expect(result).toEqual({
      ok: true,
      kind: 'oidc_session_active',
      message: '已登录',
      studentIdMasked: '2023***',
      expiresAt
    })
    expect(mockInvoke).toHaveBeenCalledWith('identity_oidc_session_status')
    expect(mockInvoke.mock.calls[0]).toHaveLength(1)
  })

  it('session_status absent → {ok:true, kind:"oidc_session_absent", message:"未登录"}（无附加字段）', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_session_absent' })
    expect(await oidcSessionStatus()).toEqual({
      ok: true,
      kind: 'oidc_session_absent',
      message: '未登录'
    })
  })

  it('session_status active 但缺 expires_at → 折叠为 unknown', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_session_active', student_id_masked: '2023***' })
    expect(await oidcSessionStatus()).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
  })

  it('logout → {ok:true, kind:"oidc_logout_ok", message:"已退出登录"}；invoke 只传命令名', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_logout_ok' })
    expect(await oidcLogout()).toEqual({
      ok: true,
      kind: 'oidc_logout_ok',
      message: '已退出登录'
    })
    expect(mockInvoke).toHaveBeenCalledWith('identity_oidc_logout')
    expect(mockInvoke.mock.calls[0]).toHaveLength(1)
  })
})

// ── 失败路径：非对象 payload / 未知 kind / 敏感错误串 ─────────────────────────

describe('归一化兜底（非对象 / 未知 kind / 敏感串）', () => {
  it('payload 非对象（数字/null/数组/字符串）→ unknown', async () => {
    for (const bad of [42, null, [1], 'oidc_login_ok', {}]) {
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValueOnce(bad)
      expect(await oidcComplete(CALLBACK_URL)).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
    }
  })

  it('ok:true 但 kind 不在成功集合（如 oidc_disabled）→ unknown（畸形不当成功透出）', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_disabled' })
    expect(await oidcComplete(CALLBACK_URL)).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
  })

  it('invoke 抛错（无 kind 特征的原始串）→ unknown，原文绝不透传', async () => {
    const raw = `boom internal detail with ${'a'.repeat(43)} and ${AUTH_BASE}/token`
    mockInvoke.mockRejectedValueOnce(raw)
    const result = await oidcComplete(CALLBACK_URL)
    expect(result).toEqual({ ok: false, kind: 'unknown', message: MSG.unknown })
    expect(result.message).not.toContain('boom')
    expect(result.message).not.toContain('a'.repeat(43))
  })

  it('invoke 抛结构化 {kind} 对象 → 精确还原 kind（固定文案）', async () => {
    mockInvoke.mockRejectedValueOnce({ kind: 'oidc_network' })
    expect(await oidcSessionStatus()).toEqual({
      ok: false,
      kind: 'oidc_network',
      message: '网络不可用，请检查网络后重试'
    })
  })
})

// ── 零 console / 零存储（spy 钉死）────────────────────────────────────────────

class MemStorage {
  private map = new Map<string, string>()
  getItem = (key: string): string | null => (this.map.has(key) ? this.map.get(key)! : null)
  setItem = (key: string, value: string): void => {
    this.map.set(key, String(value))
  }
  removeItem = (key: string): void => {
    this.map.delete(key)
  }
  clear = (): void => {
    this.map.clear()
  }
}

describe('零 console / 零存储（spy 钉死）', () => {
  it('全部流程（成功/失败/畸形/抛错）不写 console、不写 localStorage', async () => {
    // 注入内存版 localStorage（与仓库其它 spec 同款 stub 姿势；node 环境无全局 localStorage）
    const storage = new MemStorage()
    vi.stubGlobal('localStorage', storage)
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')
    const clearSpy = vi.spyOn(storage, 'clear')

    // 成功路径 ×4
    mockInvoke.mockResolvedValue({
      ok: true,
      kind: 'oidc_begin_ok',
      authorize_url: `${AUTH_BASE}/authorize`,
      state: STATE_32HEX,
      expires_at: FUTURE_TS()
    })
    await oidcBegin()
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_login_ok', student_id_masked: '2023***' })
    await oidcComplete(CALLBACK_URL)
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_session_active', student_id_masked: '2023***', expires_at: FUTURE_TS() })
    await oidcSessionStatus()
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_logout_ok' })
    await oidcLogout()
    // 失败/畸形路径
    mockInvoke.mockResolvedValueOnce({ ok: false, kind: 'zzz', message: 'raw' })
    await oidcBegin()
    mockInvoke.mockRejectedValueOnce(sensitiveInternalError('oidc_network'))
    await oidcComplete(CALLBACK_URL)

    expect(consoleLog).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleInfo).not.toHaveBeenCalled()
    expect(consoleDebug).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(clearSpy).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// P2-4 回退路径（loopback）：命令封装与形状
// ═══════════════════════════════════════════════════════════════════════════

describe('oidcBeginLoopback / oidcAwaitCallback', () => {
  afterEach(() => {
    mockInvoke.mockReset()
  })

  it('beginLoopback 无入参调用，成功时带 loopbackPort', async () => {
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      kind: 'oidc_begin_ok',
      message: '已打开浏览器，请在浏览器中完成登录',
      authorize_url: 'https://auth.example.com/authorize?x=1',
      state: 'a'.repeat(32),
      expires_at: 1794260000,
      loopback_port: 43210
    })
    const result = await oidcBeginLoopback()
    expect(mockInvoke).toHaveBeenCalledWith('identity_oidc_begin_loopback')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.loopbackPort).toBe(43210)
  })

  it('beginLoopback 未配置 loopback → oidc_misconfigured 固定文案', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: false, kind: 'oidc_misconfigured', message: 'x' })
    const result = await oidcBeginLoopback()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('oidc_misconfigured')
    expect(result.message).toBe('登录配置不完整，请联系管理员')
  })

  it('awaitCallback 传 { input: { timeout_ms } }（snake_case 单 input）', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true, kind: 'oidc_login_ok', student_id_masked: '2510***' })
    const result = await oidcAwaitCallback(60000)
    expect(mockInvoke).toHaveBeenCalledWith('identity_oidc_await_callback', {
      input: { timeout_ms: 60000 }
    })
    expect(result.ok).toBe(true)
  })

  it('awaitCallback 超时 → oidc_timeout；无 pending → oidc_no_pending', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: false, kind: 'oidc_timeout' })
    const t = await oidcAwaitCallback(50)
    expect(t.ok).toBe(false)
    if (!t.ok) expect(t.message).toBe('登录超时，请重试')

    mockInvoke.mockResolvedValueOnce({ ok: false, kind: 'oidc_no_pending' })
    const n = await oidcAwaitCallback(1000)
    expect(n.ok).toBe(false)
    if (!n.ok) expect(n.message).toBe('登录请求已失效，请重新发起')
  })

  it('awaitCallback 非法 timeout（NaN/字符串）→ 不调用 invoke，直接 unknown', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 'x' as unknown as number]) {
      const r = await oidcAwaitCallback(bad)
      expect(r.ok).toBe(false)
    }
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
