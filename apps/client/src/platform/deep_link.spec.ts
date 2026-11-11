// src/platform/deep_link.spec.ts
//
// #621 Parser contract（11 项）+ widget 生成迁移 + 监听器平台分支。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildMiniHbutDeepLink,
  IDENTITY_HANDOFF_PATTERN,
  IDENTITY_REQUEST_ID_PATTERN,
  MINI_HBUT_DEEPLINK_MAX_LENGTH,
  parseMiniHbutDeepLink
} from './deep_link'

// ─── 测试辅助 ────────────────────────────────────────────────────────────────

const validHandoff = 'Ab3_xYz9Ab3_xYz9Ab3_xYz9Ab3_xYz9' // 32 字符，URL-safe 字符集
const validRequestId = 'ar_0123456789abcdef'
const identityUrl = (query: string) => `minihbut://identity?${query}`

const expectGenericError = (result: ReturnType<typeof parseMiniHbutDeepLink>, code: string) => {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.code).toBe(code)
  // 通用安全消息：不得包含任何输入内容（URL / request_id / handoff 不回显）
  expect(result.error.message.length).toBeGreaterThan(0)
}

// ─── 1. 小组件现有链接行为不变 ────────────────────────────────────────────────

describe('parseMiniHbutDeepLink: widget 深链无回归', () => {
  it('schedule 链接保持迁移前行为（含 date/source/period）', () => {
    const result = parseMiniHbutDeepLink(
      'minihbut://schedule?date=2026-08-13&source=widget&period=3'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({
      kind: 'widget-schedule',
      date: '2026-08-13',
      period: 3,
      source: 'widget'
    })
  })

  it('schedule 无参数时字段为空/0（与迁移前一致，格式校验在消费端）', () => {
    const result = parseMiniHbutDeepLink('minihbut://schedule')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'widget-schedule', date: '', period: 0, source: 'widget' })
  })

  it('schedule 非法 period 回退 0', () => {
    const result = parseMiniHbutDeepLink('minihbut://schedule?date=2026-08-13&period=abc')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({
      kind: 'widget-schedule',
      date: '2026-08-13',
      period: 0,
      source: 'widget'
    })
  })

  it('electricity 链接保持迁移前行为', () => {
    const result = parseMiniHbutDeepLink('minihbut://electricity?source=widget')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'navigate', view: 'electricity', source: 'widget' })
  })

  it('exam 链接映射 exams 视图（历史兼容）', () => {
    const result = parseMiniHbutDeepLink('minihbut://exam')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'navigate', view: 'exams', source: 'widget' })
  })
})

// ─── 3/4/5. identity 有效 / 错误 scheme / 错误 host ──────────────────────────

describe('parseMiniHbutDeepLink: identity 与非法输入', () => {
  it('valid identity 深链解析成功', () => {
    const result = parseMiniHbutDeepLink(
      identityUrl(`request_id=${validRequestId}&handoff=${validHandoff}`)
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({
      kind: 'identity',
      requestId: validRequestId,
      handoff: validHandoff
    })
  })

  it('identity 忽略无关参数（白名单语义）', () => {
    const result = parseMiniHbutDeepLink(
      identityUrl(
        `request_id=${validRequestId}&handoff=${validHandoff}&student_id=2026000001&scope=openid&client=evil`
      )
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 任何 student_id/name/scope/client 都不得由 URL 决定
    expect(result.link.kind).toBe('identity')
    if (result.link.kind !== 'identity') return
    expect(Object.keys(result.link)).toEqual(['kind', 'requestId', 'handoff'])
  })

  it('wrong scheme 拒绝（http/https/另建 scheme 均不进入）', () => {
    expectGenericError(
      parseMiniHbutDeepLink(
        `https://identity?request_id=${validRequestId}&handoff=${validHandoff}`
      ),
      'wrong-scheme'
    )
    // 禁止另建 mini-hbut-auth:// 等冲突 scheme
    expectGenericError(
      parseMiniHbutDeepLink(
        `mini-hbut-auth://identity?request_id=${validRequestId}&handoff=${validHandoff}`
      ),
      'wrong-scheme'
    )
    expectGenericError(parseMiniHbutDeepLink(''), 'invalid-url')
  })

  it('wrong host 拒绝（identity 必须是 hostname，其他 host 不支持）', () => {
    expectGenericError(
      parseMiniHbutDeepLink(
        `minihbut://auth?request_id=${validRequestId}&handoff=${validHandoff}`
      ),
      'unsupported-host'
    )
    expectGenericError(
      parseMiniHbutDeepLink(
        `minihbut://identity.example?request_id=${validRequestId}&handoff=${validHandoff}`
      ),
      'unsupported-host'
    )
  })

  // ─── 6/7. missing request_id / missing handoff ──────────────────────────────

  it('missing request_id 拒绝', () => {
    expectGenericError(parseMiniHbutDeepLink(identityUrl(`handoff=${validHandoff}`)), 'invalid-identity')
  })

  it('missing handoff 拒绝', () => {
    expectGenericError(
      parseMiniHbutDeepLink(identityUrl(`request_id=${validRequestId}`)),
      'invalid-identity'
    )
  })

  it('request_id 格式非法拒绝（前缀/长度/字符集）', () => {
    expectGenericError(parseMiniHbutDeepLink(identityUrl(`request_id=ar_ab&handoff=${validHandoff}`)), 'invalid-identity')
    expectGenericError(parseMiniHbutDeepLink(identityUrl(`request_id=noar_12345678&handoff=${validHandoff}`)), 'invalid-identity')
    expectGenericError(parseMiniHbutDeepLink(identityUrl(`request_id=ar_abc!@#&handoff=${validHandoff}`)), 'invalid-identity')
    expectGenericError(
      parseMiniHbutDeepLink(identityUrl(`request_id=${'ar_' + 'a'.repeat(65)}&handoff=${validHandoff}`)),
      'invalid-identity'
    )
  })

  it('handoff 长度/字符集非法拒绝（最小熵与最大长度）', () => {
    // 过短（<32）无最小熵
    expectGenericError(
      parseMiniHbutDeepLink(identityUrl(`request_id=${validRequestId}&handoff=${'a'.repeat(31)}`)),
      'invalid-identity'
    )
    // 超长（>128）
    expectGenericError(
      parseMiniHbutDeepLink(
        identityUrl(`request_id=${validRequestId}&handoff=${'a'.repeat(129)}`)
      ),
      'invalid-identity'
    )
    // 非法字符（含 + / = / 空白）
    expectGenericError(
      parseMiniHbutDeepLink(
        identityUrl(`request_id=${validRequestId}&handoff=${'a+'.repeat(16)}`)
      ),
      'invalid-identity'
    )
  })

  // ─── 8. oversized ───────────────────────────────────────────────────────────

  it('oversized URL 拒绝', () => {
    const longHandoff = 'a'.repeat(MINI_HBUT_DEEPLINK_MAX_LENGTH)
    const url = `minihbut://identity?request_id=${validRequestId}&handoff=${longHandoff}`
    expect(url.length).toBeGreaterThan(MINI_HBUT_DEEPLINK_MAX_LENGTH)
    expectGenericError(parseMiniHbutDeepLink(url), 'oversized')
  })

  it('oversized 参数值（超长但不超总长）按各自校验拒绝', () => {
    const bigHandoff = 'b'.repeat(200) // 超过 handoff 128 上限，但总长仍 < 2048
    expectGenericError(
      parseMiniHbutDeepLink(identityUrl(`request_id=${validRequestId}&handoff=${bigHandoff}`)),
      'invalid-identity'
    )
  })

  // ─── 9. URL userinfo 混淆 ──────────────────────────────────────────────────

  it('userinfo 混淆拒绝（username/password 均不允许）', () => {
    expectGenericError(
      parseMiniHbutDeepLink(
        `minihbut://attacker:secret@identity?request_id=${validRequestId}&handoff=${validHandoff}`
      ),
      'userinfo-rejected'
    )
    expectGenericError(
      parseMiniHbutDeepLink(
        `minihbut://attacker@identity?request_id=${validRequestId}&handoff=${validHandoff}`
      ),
      'userinfo-rejected'
    )
  })

  // ─── 10. percent encoding 边界 ──────────────────────────────────────────────

  it('percent-encoding 合法解码后通过（等价 URL）', () => {
    const encodedRequestId = 'ar_0123456789abcdef'.replace(/[a-f]/g, (ch) =>
      `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
    )
    const result = parseMiniHbutDeepLink(
      `minihbut://identity?request_id=${encodedRequestId}&handoff=${validHandoff}`
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (result.link.kind !== 'identity') return
    expect(result.link.requestId).toBe(validRequestId)
  })

  it('percent-encoding 注入非 URL-safe 字节拒绝（%FF 等）', () => {
    expectGenericError(
      parseMiniHbutDeepLink(
        identityUrl(`request_id=${validRequestId}&handoff=%FF${validHandoff.slice(1)}`)
      ),
      'invalid-identity'
    )
  })

  it('重复参数取第一个值（searchParams 语义，不会双值拼接）', () => {
    const result = parseMiniHbutDeepLink(
      `minihbut://identity?request_id=${validRequestId}&handoff=first${'a'.repeat(40)}&handoff=${validHandoff}`
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (result.link.kind !== 'identity') return
    expect(result.link.handoff).not.toContain(validHandoff)
  })

  // ─── 11. 错误不回显 secret ─────────────────────────────────────────────────

  it('错误消息为通用文案，绝不包含 URL / request_id / handoff', () => {
    const cases = [
      identityUrl(`request_id=${validRequestId}&handoff=${validHandoff}`), // 正常（不应报错）
      identityUrl(`request_id=ar_bad&handoff=${validHandoff}`),
      identityUrl(`request_id=${validRequestId}&handoff=short`),
      `minihbut://attacker:pw@identity?request_id=${validRequestId}&handoff=${validHandoff}`,
      `mini-hbut-auth://identity?request_id=${validRequestId}&handoff=${validHandoff}`,
      `https://identity?request_id=${validRequestId}&handoff=${validHandoff}`
    ]
    for (const url of cases) {
      const result = parseMiniHbutDeepLink(url)
      if (result.ok) continue
      expect(result.error.message).not.toContain(validHandoff)
      expect(result.error.message).not.toContain(validRequestId)
      expect(result.error.message).not.toContain('minihbut')
      expect(result.error.message).not.toContain('handoff')
      expect(result.error.message).not.toContain('ar_')
    }
  })
})

// ─── P2-4（#1208）：identity-callback 新类型 + 既有 identity 不回归 ─────────────

// 与 §4.2 形状约束对齐的合法值
const validCode = 'C' + 'a'.repeat(42) // 43 字符（16..512）
const validState = '0123456789abcdef0123456789abcdef' // 32 字符（16..128）
const callbackUrl = (query: string) => `minihbut://identity/callback?${query}`

describe('parseMiniHbutDeepLink: identity-callback（P2-4 OIDC 回调）', () => {
  it('正常：code/state 形状合法 → {kind:"identity-callback", code, state}', () => {
    const result = parseMiniHbutDeepLink(callbackUrl(`code=${validCode}&state=${validState}`))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'identity-callback', code: validCode, state: validState })
    // 白名单语义：对象只含冻结的 3 个字段，不携带其它查询参数
    expect(Object.keys(result.link).sort()).toEqual(['code', 'kind', 'state'])
  })

  it('缺 code → invalid-identity（通用错误，不回显）', () => {
    expectGenericError(parseMiniHbutDeepLink(callbackUrl(`state=${validState}`)), 'invalid-identity')
  })

  it('缺 state → invalid-identity', () => {
    expectGenericError(parseMiniHbutDeepLink(callbackUrl(`code=${validCode}`)), 'invalid-identity')
  })

  it('code 过短（<16）→ invalid-identity', () => {
    expectGenericError(parseMiniHbutDeepLink(callbackUrl(`code=${'a'.repeat(15)}&state=${validState}`)), 'invalid-identity')
    // 边界：15 字符拒绝 / 16 字符接受
    expectGenericError(parseMiniHbutDeepLink(callbackUrl(`code=${'a'.repeat(16)}`)), 'invalid-identity') // 缺 state
    const ok = parseMiniHbutDeepLink(callbackUrl(`code=${'a'.repeat(16)}&state=${validState}`))
    expect(ok.ok).toBe(true)
  })

  it('state 非法字符（+ / %FF 解码出的非 URL-safe 字节）→ invalid-identity', () => {
    expectGenericError(
      parseMiniHbutDeepLink(callbackUrl(`code=${validCode}&state=${'a+'.repeat(16)}`)),
      'invalid-identity'
    )
    expectGenericError(
      parseMiniHbutDeepLink(callbackUrl(`code=${validCode}&state=%FF${validState.slice(1)}`)),
      'invalid-identity'
    )
  })

  it('错 host（identity2 / oauth）→ unsupported-host', () => {
    expectGenericError(
      parseMiniHbutDeepLink(`minihbut://identity2/callback?code=${validCode}&state=${validState}`),
      'unsupported-host'
    )
    expectGenericError(
      parseMiniHbutDeepLink(`minihbut://oauth/callback?code=${validCode}&state=${validState}`),
      'unsupported-host'
    )
  })

  it('补充边界：code 超长(>512)/state 超长(>128)/错 path 一律 invalid-identity', () => {
    expectGenericError(
      parseMiniHbutDeepLink(callbackUrl(`code=${'a'.repeat(513)}&state=${validState}`)),
      'invalid-identity'
    )
    expectGenericError(
      parseMiniHbutDeepLink(callbackUrl(`code=${validCode}&state=${'a'.repeat(129)}`)),
      'invalid-identity'
    )
    // path 必须恰为 /callback：/callbackx、//callback 都落入旧 parser → invalid-identity
    expectGenericError(
      parseMiniHbutDeepLink(`minihbut://identity/callbackx?code=${validCode}&state=${validState}`),
      'invalid-identity'
    )
    expectGenericError(
      parseMiniHbutDeepLink(`minihbut://identity//callback?code=${validCode}&state=${validState}`),
      'invalid-identity'
    )
  })

  it('长度上限照旧：超长的 identity-callback URL → oversized', () => {
    const hugeCode = 'a'.repeat(MINI_HBUT_DEEPLINK_MAX_LENGTH)
    const url = callbackUrl(`code=${hugeCode}&state=${validState}`)
    expect(url.length).toBeGreaterThan(MINI_HBUT_DEEPLINK_MAX_LENGTH)
    expectGenericError(parseMiniHbutDeepLink(url), 'oversized')
  })

  it('错误消息为通用文案，绝不包含 code / state 原值', () => {
    const cases = [
      callbackUrl(`state=${validState}`),
      callbackUrl(`code=${validCode}`),
      callbackUrl(`code=short&state=${validState}`),
      callbackUrl(`code=${validCode}&state=${'a!'.repeat(10)}`),
      `minihbut://oauth/callback?code=${validCode}&state=${validState}`
    ]
    for (const url of cases) {
      const result = parseMiniHbutDeepLink(url)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.message).not.toContain(validCode)
      expect(result.error.message).not.toContain(validState)
      expect(result.error.message).not.toContain('minihbut')
    }
  })

  it('既有 identity 深链回归 ①：minihbut://identity?request_id=..&handoff=.. 行为不变', () => {
    const result = parseMiniHbutDeepLink(identityUrl(`request_id=${validRequestId}&handoff=${validHandoff}`))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'identity', requestId: validRequestId, handoff: validHandoff })
  })

  it('既有 identity 深链回归 ②：带其它 path 的 #619 形态（path≠/callback）仍按旧 parser 解析', () => {
    const result = parseMiniHbutDeepLink(
      `minihbut://identity/legacy?request_id=${validRequestId}&handoff=${validHandoff}`
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.link).toEqual({ kind: 'identity', requestId: validRequestId, handoff: validHandoff })
    // /callback path 上若给的是 #619 参数（无 code/state）→ 按新类型严格拒绝
    expectGenericError(
      parseMiniHbutDeepLink(callbackUrl(`request_id=${validRequestId}&handoff=${validHandoff}`)),
      'invalid-identity'
    )
  })
})

// ─── 生成逻辑迁移（widget_snapshot.buildDeepLink 委托） ───────────────────────

describe('buildMiniHbutDeepLink（自 widget_snapshot.ts 迁移）', () => {
  it('基础 schedule 链接', () => {
    expect(buildMiniHbutDeepLink({ date: '2026-08-13' })).toBe(
      'minihbut://schedule?date=2026-08-13&source=widget'
    )
  })

  it('携带 period 时追加 &period=N', () => {
    expect(buildMiniHbutDeepLink({ date: '2026-08-13', period: 3 })).toBe(
      'minihbut://schedule?date=2026-08-13&source=widget&period=3'
    )
  })

  it('period 非法（0/undefined）不追加', () => {
    expect(buildMiniHbutDeepLink({ date: '2026-08-13', period: 0 })).toBe(
      'minihbut://schedule?date=2026-08-13&source=widget'
    )
    expect(buildMiniHbutDeepLink({ date: '2026-08-13' })).toBe(
      'minihbut://schedule?date=2026-08-13&source=widget'
    )
  })

  it('widget_snapshot.buildDeepLink 委托行为等价', async () => {
    const { buildDeepLink } = await import('../utils/widget_snapshot')
    const snapshot = { date: '2026-08-13' } as never
    expect(buildDeepLink(snapshot, undefined)).toBe(
      'minihbut://schedule?date=2026-08-13&source=widget'
    )
    expect(buildDeepLink(snapshot, { period_start: 5 } as never)).toBe(
      'minihbut://schedule?date=2026-08-13&source=widget&period=5'
    )
  })
})

// ─── 常量合同 ─────────────────────────────────────────────────────────────────

describe('identity 校验常量', () => {
  it('request_id / handoff 正则与长度常量自洽', () => {
    expect(IDENTITY_REQUEST_ID_PATTERN.test(validRequestId)).toBe(true)
    expect(IDENTITY_HANDOFF_PATTERN.test(validHandoff)).toBe(true)
    expect(IDENTITY_HANDOFF_PATTERN.test(validHandoff.slice(0, 31))).toBe(false)
    expect(MINI_HBUT_DEEPLINK_MAX_LENGTH).toBe(2048)
  })
})

// ─── 监听器平台分支 ───────────────────────────────────────────────────────────

// 文件级 mock：各测试通过 hoisted 控制量切换平台分支（避免多个 it 重复 vi.mock 同路径的覆盖歧义）
const nativeControl = vi.hoisted(() => ({ runtime: 'web' as 'web' | 'tauri' | 'capacitor' }))
const deepLinkControl = vi.hoisted(() => ({
  getCurrent: vi.fn(),
  onOpenUrl: vi.fn(),
  unlisten: vi.fn()
}))
const capacitorAppControl = vi.hoisted(() => ({ addListener: vi.fn() }))

vi.mock('./native', () => ({
  isTauriRuntime: () => nativeControl.runtime === 'tauri',
  isCapacitorRuntime: () => nativeControl.runtime === 'capacitor'
}))
vi.mock('@tauri-apps/plugin-deep-link', () => deepLinkControl)
vi.mock('@capacitor/app', () => ({ App: capacitorAppControl }))

describe('installMiniHbutDeepLinkListeners', () => {
  beforeEach(() => {
    vi.resetModules()
    nativeControl.runtime = 'web'
    deepLinkControl.getCurrent.mockReset()
    deepLinkControl.onOpenUrl.mockReset()
    deepLinkControl.unlisten.mockReset()
    capacitorAppControl.addListener.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('web 环境：不安装任何原生监听，返回可调用清理函数', async () => {
    nativeControl.runtime = 'web'
    const { installMiniHbutDeepLinkListeners: install } = await import('./deep_link')
    const handler = vi.fn()
    const cleanup = await install(handler)
    expect(handler).not.toHaveBeenCalled()
    expect(deepLinkControl.getCurrent).not.toHaveBeenCalled()
    expect(capacitorAppControl.addListener).not.toHaveBeenCalled()
    expect(() => cleanup()).not.toThrow()
  })

  it('tauri 环境：getCurrent 冷启动 URL 送达 handler；onOpenUrl 注册与退订', async () => {
    nativeControl.runtime = 'tauri'
    deepLinkControl.getCurrent.mockResolvedValue([
      `minihbut://identity?request_id=${validRequestId}&handoff=${validHandoff}`
    ])
    deepLinkControl.onOpenUrl.mockResolvedValue(deepLinkControl.unlisten)
    const { installMiniHbutDeepLinkListeners: install } = await import('./deep_link')
    const handler = vi.fn()
    const cleanup = await install(handler)
    // 冷启动 URL 已派发，投递时机标记为 cold-start（#739）
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toEqual({
      kind: 'identity',
      requestId: validRequestId,
      handoff: validHandoff
    })
    expect(handler.mock.calls[0][1]).toBe('cold-start')
    // 热启动 URL 派发（warm start / single-instance 转发）
    expect(deepLinkControl.onOpenUrl).toHaveBeenCalledTimes(1)
    const onOpenUrlHandler = deepLinkControl.onOpenUrl.mock.calls[0][0] as (urls: string[]) => void
    onOpenUrlHandler([`minihbut://electricity`])
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls[1][0]).toEqual({ kind: 'navigate', view: 'electricity', source: 'widget' })
    expect(handler.mock.calls[1][1]).toBe('warm')
    // 无效 URL 静默忽略
    onOpenUrlHandler(['https://evil.example/identity'])
    expect(handler).toHaveBeenCalledTimes(2)
    // 清理
    cleanup()
    expect(deepLinkControl.unlisten).toHaveBeenCalled()
  })

  it('tauri 环境：getCurrent 不可用时静默降级，不影响 onOpenUrl', async () => {
    nativeControl.runtime = 'tauri'
    deepLinkControl.getCurrent.mockRejectedValue(new Error('plugin not ready'))
    deepLinkControl.onOpenUrl.mockResolvedValue(deepLinkControl.unlisten)
    const { installMiniHbutDeepLinkListeners: install } = await import('./deep_link')
    const handler = vi.fn()
    await expect(install(handler)).resolves.toBeTypeOf('function')
    expect(handler).not.toHaveBeenCalled()
    expect(deepLinkControl.onOpenUrl).toHaveBeenCalledTimes(1)
  })

  it('capacitor 环境：appUrlOpen 走同一 parser/dispatcher（不维护两套解析）', async () => {
    nativeControl.runtime = 'capacitor'
    capacitorAppControl.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) })
    const { installMiniHbutDeepLinkListeners: install } = await import('./deep_link')
    const handler = vi.fn()
    const cleanup = await install(handler)
    expect(handler).not.toHaveBeenCalled()
    expect(capacitorAppControl.addListener).toHaveBeenCalledTimes(1)
    const appUrlOpenHandler = capacitorAppControl.addListener.mock.calls[0][1] as (event: { url?: string }) => void
    appUrlOpenHandler({ url: `minihbut://schedule?date=2026-08-13&source=widget` })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toEqual({
      kind: 'widget-schedule',
      date: '2026-08-13',
      period: 0,
      source: 'widget'
    })
    // Capacitor appUrlOpen 属运行中投递（#739）
    expect(handler.mock.calls[0][1]).toBe('warm')
    appUrlOpenHandler({})
    expect(handler).toHaveBeenCalledTimes(1)
    expect(() => cleanup()).not.toThrow()
  })
})
