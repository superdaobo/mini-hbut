/**
 * #905 宿主侧 Game SDK 握手桥契约测试。
 *
 * 这些断言直接对应 issue 的硬要求与协议 §6：
 * - **必须校验 event.origin**（白名单，禁止 '*'）；
 * - request_id / game_id / protocol_version 关联校验；
 * - 回复目标 origin 精确等于事件来源 origin（禁止广播）；
 * - ticket 单飞 + 冷却 + 次数上限，凭据不进入日志/其它通道。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  HOST_MESSAGE_TYPES,
  HOST_PROTOCOL_VERSION,
  TICKET_REQUEST_COOLDOWN_MS,
  TICKET_REQUEST_MAX_PER_SESSION,
  createModuleHostBridge
} from './game_center/host_bridge'

const GAME_ORIGIN = 'https://hbut.6661111.xyz'

const createFrameWindow = () => {
  const calls: Array<{ payload: unknown; targetOrigin: string }> = []
  const frameWindow = {
    postMessage: (payload: unknown, targetOrigin: string) => {
      calls.push({ payload, targetOrigin })
    }
  }
  return { frameWindow: frameWindow as unknown as Window, calls }
}

const buildEvent = (
  payload: Record<string, unknown>,
  options: { origin?: string; frameWindow: Window }
): MessageEvent =>
  ({
    data: payload,
    origin: options.origin ?? GAME_ORIGIN,
    source: options.frameWindow
  }) as unknown as MessageEvent

const createBridge = (
  overrides: Partial<Parameters<typeof createModuleHostBridge>[0]> = {},
  now = () => 1_000_000
) => {
  const { frameWindow, calls } = createFrameWindow()
  const bridge = createModuleHostBridge({
    moduleId: 'hbut_stack',
    frameWindow,
    allowedOrigins: [GAME_ORIGIN],
    now,
    ...overrides
  })
  return { bridge, frameWindow, calls }
}

describe('module host bridge（#905）', () => {
  it('消息类型与 SDK 侧 HOST_MESSAGE_TYPES 逐字一致的常量形状', () => {
    expect(HOST_MESSAGE_TYPES).toEqual({
      hello: 'mini-hbut:game-sdk:hello',
      welcome: 'mini-hbut:game-sdk:welcome',
      ticketRequest: 'mini-hbut:game-sdk:request-ticket',
      ticketResponse: 'mini-hbut:game-sdk:ticket',
      mode: 'mini-hbut:game-sdk:mode'
    })
    expect(HOST_PROTOCOL_VERSION).toBe(1)
  })

  it('hello → welcome：回填 request_id / game_id / 能力与开关，且只发给来源 origin', () => {
    const { bridge, frameWindow, calls } = createBridge({
      features: { game_economy_enabled: true, game_verified_session_enabled: true }
    })
    bridge.handleMessage(
      buildEvent(
        {
          type: HOST_MESSAGE_TYPES.hello,
          protocol_version: 1,
          game_id: 'hbut_stack',
          request_id: 'hs_1'
        },
        { frameWindow }
      )
    )
    expect(calls.length).toBe(1)
    expect(calls[0].targetOrigin).toBe(GAME_ORIGIN)
    const payload = calls[0].payload as Record<string, unknown>
    expect(payload.type).toBe(HOST_MESSAGE_TYPES.welcome)
    expect(payload.request_id).toBe('hs_1')
    expect(payload.game_id).toBe('hbut_stack')
    expect(payload.protocol_version).toBe(1)
    expect((payload.features as Record<string, unknown>).game_economy_enabled).toBe(true)
    expect(bridge.isActive()).toBe(true)
  })

  it('拒绝错误 origin（同窗口冒充）且不产生任何回复', () => {
    const { bridge, frameWindow, calls } = createBridge()
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: 1, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow, origin: 'https://evil.example.com' }
      )
    )
    expect(calls).toEqual([])
    expect(bridge.rejections().map((item) => item.reason)).toContain('origin_rejected')
  })

  it('拒绝空白名单 / 非本 iframe 来源 / opaque origin', () => {
    const emptyAllowList = createBridge({ allowedOrigins: [] })
    emptyAllowList.bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: 1, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow: emptyAllowList.frameWindow }
      )
    )
    expect(emptyAllowList.calls).toEqual([])
    expect(emptyAllowList.bridge.rejections().map((item) => item.reason)).toContain(
      'origin_allowlist_empty'
    )
    expect(emptyAllowList.bridge.isActive()).toBe(false)

    const { bridge, frameWindow, calls } = createBridge()
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow: {} as Window, origin: GAME_ORIGIN }
      )
    )
    expect(calls).toEqual([])

    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: 1, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow, origin: 'null' }
      )
    )
    expect(calls).toEqual([])
  })

  it('game_id / protocol_version 不匹配一律拒绝', () => {
    const { bridge, frameWindow, calls } = createBridge()
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: 1, game_id: 'hbut_parking', request_id: 'hs_1' },
        { frameWindow }
      )
    )
    expect(calls).toEqual([])
    expect(bridge.rejections().map((item) => item.reason)).toContain('game_id_mismatch')

    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: 2, game_id: 'hbut_stack', request_id: 'hs_2' },
        { frameWindow }
      )
    )
    expect(calls).toEqual([])
    expect(bridge.rejections().map((item) => item.reason)).toContain('protocol_version_unsupported')
  })

  it('request-ticket → 回填同 request_id 的 ticket；取票失败返回空 ticket（不报错）', async () => {
    const requestTicket = vi.fn().mockResolvedValue({ ticket: 'gpt_abcdefghijklmnop', expiresAt: '2026-09-27T00:02:00Z' })
    const { bridge, frameWindow, calls } = createBridge({ requestTicket })
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.ticketRequest, protocol_version: 1, game_id: 'hbut_stack', request_id: 'hs_9', reason: 'session_expired' },
        { frameWindow }
      )
    )
    await vi.waitFor(() => expect(calls.length).toBe(1))
    const payload = calls[0].payload as Record<string, unknown>
    expect(payload.type).toBe(HOST_MESSAGE_TYPES.ticketResponse)
    expect(payload.request_id).toBe('hs_9')
    expect(payload.ticket).toBe('gpt_abcdefghijklmnop')
    expect(calls[0].targetOrigin).toBe(GAME_ORIGIN)
    expect(requestTicket).toHaveBeenCalledWith({ reason: 'session_expired', requestId: 'hs_9' })

    const failing = createBridge({ requestTicket: vi.fn().mockResolvedValue(null) })
    failing.bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.ticketRequest, protocol_version: 1, game_id: 'hbut_stack', request_id: 'hs_10' },
        { frameWindow: failing.frameWindow }
      )
    )
    await vi.waitFor(() => expect(failing.calls.length).toBe(1))
    expect((failing.calls[0].payload as Record<string, unknown>).ticket).toBe('')
  })

  it('取票遵循冷却与次数上限（防套取/防循环）', async () => {
    let now = 1_000_000
    const requestTicket = vi.fn().mockResolvedValue({ ticket: 'gpt_abcdefghijklmnop' })
    const { bridge, frameWindow, calls } = createBridge({ requestTicket }, () => now)

    for (let index = 0; index < TICKET_REQUEST_MAX_PER_SESSION + 2; index += 1) {
      now += TICKET_REQUEST_COOLDOWN_MS + 1
      bridge.handleMessage(
        buildEvent(
          {
            type: HOST_MESSAGE_TYPES.ticketRequest,
            protocol_version: 1,
            game_id: 'hbut_stack',
            request_id: `hs_${index}`
          },
          { frameWindow }
        )
      )
      await vi.waitFor(() => expect(calls.length).toBe(index + 1))
    }
    expect(requestTicket).toHaveBeenCalledTimes(TICKET_REQUEST_MAX_PER_SESSION)
    expect(bridge.rejections().map((item) => item.reason)).toContain('ticket_quota_exhausted')
  })

  it('mode 消息只记录不上报，dispose 后不再处理任何消息', () => {
    const onMode = vi.fn()
    const { bridge, frameWindow, calls } = createBridge({ onMode })
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.mode, game_id: 'hbut_stack', mode: 'compatibility', trust_level: 'legacy' },
        { frameWindow }
      )
    )
    expect(onMode).toHaveBeenCalledWith('compatibility', 'legacy')
    expect(bridge.lastMode()).toEqual({ mode: 'compatibility', trustLevel: 'legacy' })
    expect(calls).toEqual([])

    bridge.dispose()
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: 1, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow }
      )
    )
    expect(calls).toEqual([])
    expect(bridge.isActive()).toBe(false)
  })
})
