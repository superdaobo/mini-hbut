import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  GAME_TRUST_REASONS,
  createGatedTicketRequest,
  normalizeVerifiedOrigins,
  resolveGameTrustPolicy
} from './game_center/origin_policy'
import { HOST_MESSAGE_TYPES, HOST_PROTOCOL_VERSION, createModuleHostBridge } from './game_center/host_bridge'

/**
 * 契约 C（standalone 边界锁死）—— 宿主侧前置判定与取票门。
 *
 * 1. `resolveGameTrustPolicy` 是「是否允许进入 verified」的**唯一**判定：
 *    ① 可信 Host 握手 ② origin 在显式白名单 ③ 会话已确认（+ 开关 / 取票渠道）；
 * 2. 判定不通过 → 对游戏声明的 verified/economy/drift 能力保守 false、**零请求**不下发 ticket；
 * 3. 非白名单 origin 冒充宿主 → 桥不回应、不取票；判定不通过时 `fetchGameLaunchTicket` 不被调用。
 *
 * 说明：宿主视图（.vue）在 CI 的 node 环境无法直接挂载，因此「判定是否真的接进视图」由
 * 末尾的接线契约（源码锚点）测试守护 —— 修复前它必然为红（见 PR 说明）。
 */

const GAME_ORIGIN = 'https://hbut.6661111.xyz'
const EVIL_ORIGIN = 'https://evil.example'
const TICKET = 'gpt_abcdefghijklmnop'

const READY_FEATURES = {
  game_center_enabled: true,
  game_verified_session_enabled: true,
  game_economy_enabled: true,
  drift_bottle_enabled: true
}

const eligibleInput = (overrides: Record<string, unknown> = {}) => ({
  handshakeTrusted: true,
  origin: GAME_ORIGIN,
  allowedOrigins: [GAME_ORIGIN],
  sessionVerified: true,
  verifiedFeatureEnabled: true,
  ticketSourceAvailable: true,
  baseFeatures: READY_FEATURES,
  ...overrides
})

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

describe('契约 C 单一前置判定（origin_policy）', () => {
  it('三条前提全部满足 → 允许 verified（唯一出口 true），能力声明保持授权值', () => {
    const policy = resolveGameTrustPolicy(eligibleInput())
    expect(policy.verifiedEligible).toBe(true)
    expect(policy.reasons).toEqual([])
    expect(policy.launchTicketAllowed).toBe(true)
    expect(policy.origin).toBe(GAME_ORIGIN)
    expect(policy.features).toEqual(READY_FEATURES)
  })

  it('前提①缺失（无可信 Host 握手）→ 不通过并给出原因', () => {
    const policy = resolveGameTrustPolicy(eligibleInput({ handshakeTrusted: false }))
    expect(policy.verifiedEligible).toBe(false)
    expect(policy.reasons).toContain(GAME_TRUST_REASONS.handshakeUntrusted)
    expect(policy.launchTicketAllowed).toBe(false)
  })

  it('前提②缺失（白名单为空 / origin 不在白名单 / origin 不可比较）→ 不通过', () => {
    const empty = resolveGameTrustPolicy(eligibleInput({ allowedOrigins: [] }))
    expect(empty.verifiedEligible).toBe(false)
    expect(empty.reasons).toContain(GAME_TRUST_REASONS.allowlistEmpty)

    const notListed = resolveGameTrustPolicy(eligibleInput({ allowedOrigins: ['https://other.example'] }))
    expect(notListed.verifiedEligible).toBe(false)
    expect(notListed.reasons).toContain(GAME_TRUST_REASONS.originNotWhitelisted)

    for (const bad of ['null', '*', '', undefined, 'about:blank']) {
      const policy = resolveGameTrustPolicy(eligibleInput({ origin: bad }))
      expect(policy.verifiedEligible, String(bad)).toBe(false)
      expect(policy.reasons, String(bad)).toContain(GAME_TRUST_REASONS.originMissing)
    }
  })

  it('前提③缺失（会话未确认）→ 不通过；游客态绝不放行 verified', () => {
    const policy = resolveGameTrustPolicy(eligibleInput({ sessionVerified: false }))
    expect(policy.verifiedEligible).toBe(false)
    expect(policy.reasons).toContain(GAME_TRUST_REASONS.sessionUnverified)
    expect(policy.features.game_verified_session_enabled).toBe(false)
  })

  it('既有前提（开关 / 取票渠道）缺失 → 不通过', () => {
    const disabled = resolveGameTrustPolicy(eligibleInput({ verifiedFeatureEnabled: false }))
    expect(disabled.reasons).toContain(GAME_TRUST_REASONS.verifiedDisabled)
    const noSource = resolveGameTrustPolicy(eligibleInput({ ticketSourceAvailable: false }))
    expect(noSource.reasons).toContain(GAME_TRUST_REASONS.ticketSourceMissing)
  })

  it('保守能力：判定不通过时 verified/economy/drift 一律 false，游玩入口保持', () => {
    const policy = resolveGameTrustPolicy(eligibleInput({ sessionVerified: false }))
    expect(policy.features).toEqual({
      game_center_enabled: true,
      game_verified_session_enabled: false,
      game_economy_enabled: false,
      drift_bottle_enabled: false
    })
  })

  it('白名单归一：去重 / 丢弃 `*` 与 `null` / 按 origin 归一（fail closed，绝不含通配）', () => {
    expect(normalizeVerifiedOrigins(['https://a.example/x', 'https://a.example/y', '*', 'null', '', 42])).toEqual([
      'https://a.example'
    ])
    // origin 归一（大小写 / 路径不影响比较）
    const policy = resolveGameTrustPolicy(
      eligibleInput({ origin: 'https://HBUT.6661111.xyz/index.html', allowedOrigins: ['https://hbut.6661111.xyz'] })
    )
    expect(policy.verifiedEligible).toBe(true)
  })

  it('取票门：判定不通过 → 零请求直接 null；判定通过 → 透传真实取票', async () => {
    const requestTicket = vi.fn().mockResolvedValue({ ticket: TICKET, expiresAt: '2026-09-28T00:02:00Z' })
    const denied = vi.fn()
    const ineligible = createGatedTicketRequest({
      resolvePolicy: () => resolveGameTrustPolicy(eligibleInput({ sessionVerified: false })),
      requestTicket,
      onDenied: denied
    })
    await expect(ineligible({ reason: 'session_expired', requestId: 'hs_1' })).resolves.toBeNull()
    expect(requestTicket).not.toHaveBeenCalled()
    expect(denied).toHaveBeenCalledWith(GAME_TRUST_REASONS.sessionUnverified)

    const eligible = createGatedTicketRequest({
      resolvePolicy: () => resolveGameTrustPolicy(eligibleInput()),
      requestTicket
    })
    await expect(eligible({ reason: 'session_expired', requestId: 'hs_2' })).resolves.toMatchObject({ ticket: TICKET })
    expect(requestTicket).toHaveBeenCalledTimes(1)
  })

  it('取票门：判定函数抛错 → fail closed（零请求）', async () => {
    const requestTicket = vi.fn()
    const gated = createGatedTicketRequest({
      resolvePolicy: () => {
        throw new Error('boom')
      },
      requestTicket
    })
    await expect(gated({ reason: '', requestId: 'hs_3' })).resolves.toBeNull()
    expect(requestTicket).not.toHaveBeenCalled()
  })
})

describe('契约 C 宿主桥 × 判定（行为级）', () => {
  it('场景2 Host + 白名单 origin + 合法 Session → welcome 声明可领票，且只向该 origin 下发 ticket', async () => {
    const policy = resolveGameTrustPolicy(eligibleInput())
    expect(policy.verifiedEligible).toBe(true)
    const { frameWindow, calls } = createFrameWindow()
    const requestTicket = vi.fn().mockResolvedValue({ ticket: TICKET, expiresAt: '2026-09-28T00:02:00Z' })
    const bridge = createModuleHostBridge({
      moduleId: 'hbut_stack',
      frameWindow,
      allowedOrigins: [GAME_ORIGIN],
      features: policy.features,
      requestTicket: createGatedTicketRequest({ resolvePolicy: () => policy, requestTicket })
    })
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow }
      )
    )
    expect(calls).toHaveLength(1)
    const welcome = calls[0].payload as Record<string, unknown>
    expect(welcome.type).toBe(HOST_MESSAGE_TYPES.welcome)
    expect((welcome.features as Record<string, unknown>).game_verified_session_enabled).toBe(true)
    expect((welcome.capabilities as Record<string, unknown>).launch_ticket).toBe(true)

    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.ticketRequest, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_2', reason: 'session_expired' },
        { frameWindow }
      )
    )
    await vi.waitFor(() => expect(calls.length).toBe(2))
    const ticketReply = calls[1].payload as Record<string, unknown>
    expect(ticketReply.type).toBe(HOST_MESSAGE_TYPES.ticketResponse)
    expect(ticketReply.ticket).toBe(TICKET)
    expect(calls[1].targetOrigin).toBe(GAME_ORIGIN)
    expect(requestTicket).toHaveBeenCalledTimes(1)
  })

  it('场景3 Host 但 origin 不在白名单 → 可玩但声明保守能力，且取票零请求', async () => {
    // 入站白名单仍允许该 origin（可玩、可上报高度），但 verified 的**显式白名单**为空
    const policy = resolveGameTrustPolicy(eligibleInput({ allowedOrigins: [] }))
    expect(policy.verifiedEligible).toBe(false)
    const { frameWindow, calls } = createFrameWindow()
    const requestTicket = vi.fn().mockResolvedValue({ ticket: TICKET })
    const bridge = createModuleHostBridge({
      moduleId: 'hbut_stack',
      frameWindow,
      allowedOrigins: [GAME_ORIGIN],
      features: policy.features,
      requestTicket: createGatedTicketRequest({ resolvePolicy: () => policy, requestTicket })
    })
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow }
      )
    )
    expect(calls).toHaveLength(1)
    const welcome = calls[0].payload as Record<string, unknown>
    expect((welcome.features as Record<string, unknown>).game_verified_session_enabled).toBe(false)
    expect((welcome.capabilities as Record<string, unknown>).launch_ticket).toBe(false)

    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.ticketRequest, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_2' },
        { frameWindow }
      )
    )
    await vi.waitFor(() => expect(calls.length).toBe(2))
    expect((calls[1].payload as Record<string, unknown>).ticket).toBe('')
    expect(requestTicket).not.toHaveBeenCalled()
  })

  it('场景3b 非白名单 origin 冒充游戏/Host → 不回应、不取票（零请求）', async () => {
    const policy = resolveGameTrustPolicy(eligibleInput())
    const { frameWindow, calls } = createFrameWindow()
    const requestTicket = vi.fn().mockResolvedValue({ ticket: TICKET })
    const bridge = createModuleHostBridge({
      moduleId: 'hbut_stack',
      frameWindow,
      allowedOrigins: [GAME_ORIGIN],
      features: policy.features,
      requestTicket: createGatedTicketRequest({ resolvePolicy: () => policy, requestTicket })
    })
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow, origin: EVIL_ORIGIN }
      )
    )
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.ticketRequest, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_2' },
        { frameWindow, origin: EVIL_ORIGIN }
      )
    )
    expect(calls).toEqual([])
    expect(requestTicket).not.toHaveBeenCalled()
    expect(bridge.rejections().map((item) => item.reason)).toContain('origin_rejected')
  })

  it('场景4 Host + 白名单 origin 但会话未确认 → 声明保守能力 + 取票零请求', async () => {
    const policy = resolveGameTrustPolicy(eligibleInput({ sessionVerified: false }))
    expect(policy.verifiedEligible).toBe(false)
    const { frameWindow, calls } = createFrameWindow()
    const requestTicket = vi.fn().mockResolvedValue({ ticket: TICKET })
    const bridge = createModuleHostBridge({
      moduleId: 'hbut_stack',
      frameWindow,
      allowedOrigins: [GAME_ORIGIN],
      features: policy.features,
      requestTicket: createGatedTicketRequest({ resolvePolicy: () => policy, requestTicket })
    })
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.hello, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_1' },
        { frameWindow }
      )
    )
    expect((calls[0].payload as Record<string, unknown>).capabilities).toMatchObject({ launch_ticket: false })
    bridge.handleMessage(
      buildEvent(
        { type: HOST_MESSAGE_TYPES.ticketRequest, protocol_version: HOST_PROTOCOL_VERSION, game_id: 'hbut_stack', request_id: 'hs_2' },
        { frameWindow }
      )
    )
    await vi.waitFor(() => expect(calls.length).toBe(2))
    expect((calls[1].payload as Record<string, unknown>).ticket).toBe('')
    expect(requestTicket).not.toHaveBeenCalled()
  })
})

describe('契约 C 接线（MoreModuleHostView.vue 源码锚点）', () => {
  const hostSource = () => fs.readFileSync(path.join(process.cwd(), 'src/components/MoreModuleHostView.vue'), 'utf8')

  it('宿主视图把 verified 判定与取票统一收敛到 origin_policy（不得各自判定）', () => {
    const source = hostSource()
    expect(source).toContain('resolveGameTrustPolicy')
    expect(source).toContain('createGatedTicketRequest')
    expect(source).toContain('evaluateGameTrustPolicy')
    // 唯一取票入口：requestTicket 必须是「判定门」包装后的实现
    expect(source).toContain('requestTicket: createGatedTicketRequest({')
    expect(source).toContain('resolvePolicy: evaluateGameTrustPolicy')
    // 拒绝旧实现：只按 flag 放行（不判 origin 白名单 / 会话）
    expect(source).not.toContain('hostFlags.value.game_verified_session_enabled !== true')
    expect(source).toContain('allowed_game_origins')
  })

  it('会话已确认的事实源来自认证状态层（游客态 / 仅缓存身份不得算确认）', () => {
    const source = hostSource()
    expect(source).toContain('useAuthStore')
    expect(source).toContain('onlineSessionState')
    expect(source).toContain('sessionVerified')
  })

  it('会话恢复换票同样先过判定（不通过 → 零请求）', () => {
    const source = hostSource()
    expect(source).toContain('refreshLaunchTicketForResume')
    expect(source).toMatch(/const policy = evaluateGameTrustPolicy\(\)[\s\S]{0,120}if \(!policy\.verifiedEligible \|\| !policy\.launchTicketAllowed\) return/)
  })
})
