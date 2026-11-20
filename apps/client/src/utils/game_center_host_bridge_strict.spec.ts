/**
 * Epic #1243（G2-03 / mini-hbut#1252）：宿主桥**严格模式**契约测试。
 *
 * 背景：#905 的桥已经校验 `event.source` / `event.origin` 白名单 / `game_id` /
 * `request_id` / 协议版本 / 取票配额。Epic 追加两项：
 * 1. **实例 nonce**——同一 origin 下的另一个页面/实例不能冒用本桥（origin 相同 ≠ 实例相同）；
 * 2. **能力白名单**——`request-ticket` 不得申请未授权的能力。
 *
 * 两项都是**可配置加严**（默认关闭）：现有 11 个游戏与 SDK 都不发送 nonce/能力，
 * 强制开启会让所有握手被拒。未配置时必须与 #905 行为**逐字一致**（有测试锁）。
 */
import { describe, expect, it, vi } from 'vitest'

import {
  HOST_MESSAGE_TYPES,
  HOST_PROTOCOL_VERSION,
  createModuleHostBridge
} from './game_center/host_bridge'

const GAME_ORIGIN = 'https://hbut.6661111.xyz'
const NONCE = 'nonce-abc-123'

const createFrameWindow = () => {
  const calls: Array<{ payload: Record<string, unknown>; targetOrigin: string }> = []
  const frameWindow = {
    postMessage: (payload: Record<string, unknown>, targetOrigin: string) => {
      calls.push({ payload, targetOrigin })
    }
  }
  return { frameWindow: frameWindow as unknown as Window, calls }
}

const buildEvent = (
  payload: Record<string, unknown>,
  frameWindow: Window,
  origin = GAME_ORIGIN
): MessageEvent =>
  ({ data: payload, origin, source: frameWindow }) as unknown as MessageEvent

const createBridge = (overrides: Record<string, unknown> = {}) => {
  const { frameWindow, calls } = createFrameWindow()
  const bridge = createModuleHostBridge({
    moduleId: 'hbut_2048',
    frameWindow,
    allowedOrigins: [GAME_ORIGIN],
    now: () => 1_000_000,
    ...overrides
  })
  return { bridge, frameWindow, calls }
}

const hello = (extra: Record<string, unknown> = {}) => ({
  type: HOST_MESSAGE_TYPES.hello,
  protocol_version: HOST_PROTOCOL_VERSION,
  game_id: 'hbut_2048',
  request_id: 'r-1',
  ...extra
})

const reasons = (bridge: ReturnType<typeof createModuleHostBridge>): string[] =>
  bridge.rejections().map((item) => item.reason)

describe('host bridge 严格模式（#1252）', () => {
  it('未配置严格模式时，旧消息（无 nonce）照常握手（零回归）', () => {
    const { bridge, frameWindow, calls } = createBridge()
    bridge.handleMessage(buildEvent(hello(), frameWindow))
    expect(calls).toHaveLength(1)
    expect(calls[0].payload.type).toBe(HOST_MESSAGE_TYPES.welcome)
    expect(calls[0].payload.instance_nonce).toBeUndefined()
    expect(reasons(bridge)).toEqual([])
  })

  it('要求 nonce 时，缺 nonce 的消息被拒且不回 welcome', () => {
    const { bridge, frameWindow, calls } = createBridge({ requireInstanceNonce: NONCE })
    bridge.handleMessage(buildEvent(hello(), frameWindow))
    expect(calls).toHaveLength(0)
    expect(reasons(bridge)).toContain('instance_nonce_mismatch')
  })

  it('要求 nonce 且回显正确 → 握手成功，welcome 里带回 nonce', () => {
    const { bridge, frameWindow, calls } = createBridge({ requireInstanceNonce: NONCE })
    bridge.handleMessage(buildEvent(hello({ instance_nonce: NONCE }), frameWindow))
    expect(calls).toHaveLength(1)
    expect(calls[0].payload.type).toBe(HOST_MESSAGE_TYPES.welcome)
    expect(calls[0].payload.instance_nonce).toBe(NONCE)
  })

  it('要求 nonce 但回显错误 → 拒绝', () => {
    const { bridge, frameWindow, calls } = createBridge({ requireInstanceNonce: NONCE })
    bridge.handleMessage(buildEvent(hello({ instance_nonce: 'wrong' }), frameWindow))
    expect(calls).toHaveLength(0)
    expect(reasons(bridge)).toContain('instance_nonce_mismatch')
  })

  it('origin 校验优先于 nonce（错 origin 仍报 origin_rejected）', () => {
    const { bridge, frameWindow } = createBridge({ requireInstanceNonce: NONCE })
    bridge.handleMessage(buildEvent(hello({ instance_nonce: NONCE }), frameWindow, 'https://evil.example.com'))
    expect(reasons(bridge)).toContain('origin_rejected')
    expect(reasons(bridge)).not.toContain('instance_nonce_mismatch')
  })

  it('能力白名单：申请未授权能力 → capability_not_allowed 且不取票', async () => {
    const requestTicket = vi.fn(async () => ({ ticket: 't-1' }))
    const { bridge, frameWindow, calls } = createBridge({
      allowedCapabilities: ['launch_ticket'],
      requestTicket
    })
    bridge.handleMessage(
      buildEvent(
        {
          type: HOST_MESSAGE_TYPES.ticketRequest,
          protocol_version: HOST_PROTOCOL_VERSION,
          game_id: 'hbut_2048',
          request_id: 'r-2',
          capability: 'admin_economy'
        },
        frameWindow
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestTicket).not.toHaveBeenCalled()
    expect(reasons(bridge)).toContain('capability_not_allowed')
    expect(calls).toHaveLength(0)
  })

  it('能力白名单：申请已授权能力 → 正常取票', async () => {
    const requestTicket = vi.fn(async () => ({ ticket: 't-1' }))
    const { bridge, frameWindow, calls } = createBridge({
      allowedCapabilities: ['launch_ticket'],
      requestTicket
    })
    bridge.handleMessage(
      buildEvent(
        {
          type: HOST_MESSAGE_TYPES.ticketRequest,
          protocol_version: HOST_PROTOCOL_VERSION,
          game_id: 'hbut_2048',
          request_id: 'r-3',
          capability: 'launch_ticket'
        },
        frameWindow
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestTicket).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].payload.type).toBe(HOST_MESSAGE_TYPES.ticketResponse)
  })

  it('能力白名单：消息未声明能力时仍放行（向后兼容现有 SDK）', async () => {
    const requestTicket = vi.fn(async () => ({ ticket: 't-1' }))
    const { bridge, frameWindow, calls } = createBridge({
      allowedCapabilities: ['launch_ticket'],
      requestTicket
    })
    bridge.handleMessage(
      buildEvent(
        {
          type: HOST_MESSAGE_TYPES.ticketRequest,
          protocol_version: HOST_PROTOCOL_VERSION,
          game_id: 'hbut_2048',
          request_id: 'r-4'
        },
        frameWindow
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestTicket).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
  })

  it('未配置能力白名单时，任意能力都放行（零回归）', async () => {
    const requestTicket = vi.fn(async () => ({ ticket: 't-1' }))
    const { bridge, frameWindow } = createBridge({ requestTicket })
    bridge.handleMessage(
      buildEvent(
        {
          type: HOST_MESSAGE_TYPES.ticketRequest,
          protocol_version: HOST_PROTOCOL_VERSION,
          game_id: 'hbut_2048',
          request_id: 'r-5',
          capability: 'anything'
        },
        frameWindow
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestTicket).toHaveBeenCalledTimes(1)
    expect(reasons(bridge)).not.toContain('capability_not_allowed')
  })

  it('拒绝记录只含 reason/at，不含消息载荷（防凭据/内容进日志）', () => {
    const { bridge, frameWindow } = createBridge({ requireInstanceNonce: NONCE })
    bridge.handleMessage(
      buildEvent(hello({ ticket: 'SECRET-TICKET', instance_nonce: 'wrong' }), frameWindow)
    )
    const dumped = JSON.stringify(bridge.rejections())
    expect(dumped).not.toContain('SECRET-TICKET')
    for (const item of bridge.rejections()) {
      expect(Object.keys(item).sort()).toEqual(['at', 'reason'])
    }
  })
})
