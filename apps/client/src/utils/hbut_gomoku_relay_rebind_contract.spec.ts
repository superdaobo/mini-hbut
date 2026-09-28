import { describe, expect, it, vi } from 'vitest'

/**
 * W1 收口修复的行为级契约（对抗性复核 F1/F2/F3/F5 + 冻结字段 peer_secret）。
 *
 * 只测真实源码（相对路径 import `website/modules-src/hbut_gomoku/project/src/**`）。
 *
 * 写法说明：新 API（forgetRelayBinding / relayBindingForMatch / setPeerSecret / onError /
 * onPeerSecret / 有界重绑）在修复前不存在，因此这里**不静态 import 新导出**、对新方法用
 * 可选调用——修复前测试文件仍能加载并逐条断言失败（而不是整文件因缺导出而报错）。
 * 导出契约单独用动态 import 断言。
 */

import {
  RELAY_BINDING_REQUIRED_CODE,
  createHfRelayGomokuRoom,
  normalizeRoomCode
} from '../../../../website/modules-src/hbut_gomoku/project/src/game/online.js'
import {
  buildSeatClaimBody,
  createGomokuMatchTrust,
  createPlatformMatchTransport
} from '../../../../website/modules-src/hbut_gomoku/project/src/game/match_trust.js'
import { createFetchRouter, jsonResponse, okJson } from './_sdk_test_harness'

const MATCH_ID = 'gm_0123456789abcdef01234567'
const OTHER_MATCH_ID = 'gm_ffffffffffffffffffffffff'
const TOKEN = 'gs_' + 'a'.repeat(32)
const PEER_SECRET = 'gps1.' + 'a1b2c3d4'.repeat(8)
const RELAY_BASE = 'https://relay.example/api/gomoku-relay'
// 与 online.js 导出常量逐字一致（修复后由导出契约测试校验）。
const SEAT_PEER_OWNERSHIP_REQUIRED = 'SEAT_PEER_OWNERSHIP_REQUIRED'
const BINDING_SUSPENDED_CODE = 'RELAY_BINDING_SUSPENDED'
const MAX_REFRESH_ATTEMPTS = 5
const POLL_FAILURE_THRESHOLD = 3

const bodyOf = (call: { body: unknown }) => (call.body || {}) as Record<string, unknown>

const buildRelayRouter = () =>
  createFetchRouter([
    {
      match: '/join',
      method: 'POST',
      respond: () =>
        jsonResponse({ success: true, cursor: 1, peers: [], match_id: MATCH_ID })
    },
    {
      match: '/send',
      method: 'POST',
      respond: () => jsonResponse({ success: true, event_id: 2, cursor: 2, match_id: MATCH_ID })
    },
    {
      match: '/poll',
      method: 'GET',
      respond: () =>
        jsonResponse({ success: true, cursor: 2, peers: [], events: [], match_id: MATCH_ID })
    },
    { match: '/leave', method: 'POST', respond: () => jsonResponse({ success: true }) }
  ])

/** 模拟一局已完成的席位绑定（拿到旧凭证）。 */
const trustWithBinding = async (token = 'grb1.old.token') => {
  const transport = {
    hasSession: () => true,
    claimSeat: vi.fn(async () => ({
      seat: 'black',
      match: { match_id: MATCH_ID },
      relay_binding: { token, expires_at: 1 }
    })),
    reportResult: vi.fn(async () => ({})),
    fetchStats: vi.fn(async () => ({}))
  }
  const trust = createGomokuMatchTrust({ transport })
  trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
  await trust.claimSeat({ peerId: 'peer-a' })
  return { trust, transport }
}

const parseBody = (init: Record<string, unknown>) =>
  JSON.parse(String(init.body || '{}')) as Record<string, unknown>

/**
 * 模拟服务端（ocr-service-w1-auth 71b685e）的 peer_secret 语义：
 * - 无 `(room_code, peer_id)` 记录 → 签发新值；
 * - 有记录且请求出示的 peer_secret === 当前值 → 重签换新值；
 * - 有记录但未出示/不匹配 → 不重签、响应不带该字段（记录存活期间旧值仍有效）。
 */
const createPeerSecretServer = ({ initial = '' } = {}) => {
  const key = 'ROOM1:peer-a'
  const store = new Map<string, string>()
  if (initial) store.set(key, initial)
  const joins: Array<Record<string, unknown>> = []
  const issued: string[] = []
  let counter = 0
  let silent = false
  const issue = () => {
    counter += 1
    const secret = `gps1.${String(counter).padStart(2, '0')}${'ab'.repeat(20)}`
    store.set(key, secret)
    issued.push(secret)
    return secret
  }
  const handleJoin = (body: Record<string, unknown>) => {
    joins.push(body)
    if (silent) return { success: true, cursor: 0, peers: [] }
    const provided = typeof body.peer_secret === 'string' ? body.peer_secret : ''
    const current = store.get(key)
    if (!current) return { success: true, cursor: 0, peers: [], peer_secret: issue() }
    if (provided && provided === current) {
      return { success: true, cursor: 0, peers: [], peer_secret: issue() }
    }
    return { success: true, cursor: 0, peers: [] }
  }
  return {
    store,
    joins,
    issued,
    handleJoin,
    current: () => store.get(key) || '',
    setSilent: (value: boolean) => {
      silent = value
    }
  }
}

const relayFetchFrom = (
  server: ReturnType<typeof createPeerSecretServer>,
  seatBodies: Array<Record<string, unknown>> = []
) =>
  async (url: string, init: Record<string, unknown> = {}) => {
    const target = String(url)
    if (target.includes('/join')) return jsonResponse(server.handleJoin(parseBody(init)))
    if (target.includes('/seat')) {
      seatBodies.push(parseBody(init))
      return okJson({ seat: 'black', match: {} })
    }
    if (target.includes('/send')) return jsonResponse({ success: true })
    if (target.includes('/poll')) {
      return jsonResponse({ success: true, cursor: 1, peers: [], events: [] })
    }
    return jsonResponse({ success: true })
  }

describe('W1 收口：同房号重连凭证（F1）', () => {
  it('F1：reset 后同房号重连，首个 join 不带上一局任何 relay_binding', async () => {
    const { trust } = await trustWithBinding()
    expect(trust.relayBinding()).toBe('grb1.old.token')
    expect(trust.relayBindingMatchId?.()).toBe(MATCH_ID)

    // main.js resetOnlineClient 的等价调用：离开/重置房间时显式作废凭证。
    // （修复前没有 forgetRelayBinding，这里什么都不做 → 旧凭证被带进新连接。）
    trust.forgetRelayBinding?.()
    expect(trust.relayBinding()).toBe('')
    expect(trust.snapshot().relayBindingExpiresAt).toBe(0)

    // 重连：新连接的 match_id 尚未下发（join 之后才有）→ 不得携带任何凭证。
    // 修复前 main.js 的等价决策是"同房号就带" → 这里回退到 relayBinding()。
    const relayBinding =
      typeof trust.relayBindingForMatch === 'function'
        ? trust.relayBindingForMatch('')
        : trust.relayBinding()
    expect(relayBinding).toBe('')

    const router = buildRelayRouter()
    const client = await createHfRelayGomokuRoom({
      roomCode: 'HBUT1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: router.fetch,
      pollIntervalMs: 0,
      relayBinding,
      onEvent: () => {}
    })
    expect('relay_binding' in bodyOf(router.callsFor('/join')[0])).toBe(false)
    await client.close()
  })

  it('F1：凭证只在"所属 match_id === 当前房间已下发 match_id"时允许携带', async () => {
    const { trust } = await trustWithBinding()
    expect(trust.relayBindingForMatch?.(MATCH_ID)).toBe('grb1.old.token')
    // 换场（新 match_id）不得复用旧凭证；matchId 未下发同样不携带。
    expect(trust.relayBindingForMatch?.(OTHER_MATCH_ID)).toBe('')
    expect(trust.relayBindingForMatch?.('')).toBe('')
  })

  it('F1：换场（match_id 变化）时凭证与其归属一起清空', async () => {
    const { trust } = await trustWithBinding()
    trust.rememberMatch({ matchId: OTHER_MATCH_ID })
    expect(trust.relayBinding()).toBe('')
    expect(trust.relayBindingMatchId?.()).toBe('')
    expect(trust.relayBindingForMatch?.(MATCH_ID)).toBe('')
  })
})

describe('W1 收口：重绑时序（F2）', () => {
  it('F2：等宿主重绑 Promise 拿到新凭证后才重试，不在 800ms 时重发旧凭证', async () => {
    vi.useFakeTimers()
    try {
      let sendAttempts = 0
      const sendBodies: Array<Record<string, unknown>> = []
      const fetchImpl = async (url: string, init: Record<string, unknown> = {}) => {
        const target = String(url)
        if (target.includes('/join')) return jsonResponse({ success: true, cursor: 0, peers: [] })
        if (target.includes('/send')) {
          sendAttempts += 1
          sendBodies.push(JSON.parse(String(init.body || '{}')) as Record<string, unknown>)
          if (sendAttempts === 1) {
            return jsonResponse(
              { success: false, error_code: RELAY_BINDING_REQUIRED_CODE },
              403
            )
          }
          return jsonResponse({ success: true })
        }
        return jsonResponse({ success: true })
      }
      let client: any = null
      // 宿主席位绑定：服务端最短退避 1200ms 后才签发新凭证（旧实现只会等 800ms）。
      const rebindAfterServerBackoff = () =>
        new Promise((resolve) => {
          setTimeout(() => {
            client?.setRelayBinding('grb1.fresh.token')
            resolve({ ok: true })
          }, 1200)
        })
      client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: RELAY_BASE,
        fetchImpl,
        pollIntervalMs: 0,
        onBindingRequired: rebindAfterServerBackoff,
        onEvent: () => {}
      })

      const pending = client
        .send({ type: 'move', row: 0, col: 0 }, 'peer-b')
        .then(
          () => null,
          (error: unknown) => error
        )
      await vi.advanceTimersByTimeAsync(1100)
      // 修复前 800ms 就重试了：此时 sendAttempts === 2（且带的是空凭证）。
      expect(sendAttempts).toBe(1)

      await vi.advanceTimersByTimeAsync(200)
      expect(await pending).toBeNull()
      expect(sendAttempts).toBe(2)
      expect(sendBodies[1].relay_binding).toBe('grb1.fresh.token')
    } finally {
      vi.useRealTimers()
    }
  })

  it('F2：宿主回调抛错只在有界策略内计数，不把异常泄漏给下棋流程', async () => {
    let sendAttempts = 0
    const fetchImpl = async (url: string) => {
      const target = String(url)
      if (target.includes('/join')) return jsonResponse({ success: true, cursor: 0, peers: [] })
      if (target.includes('/send')) {
        sendAttempts += 1
        return jsonResponse({ success: false, error_code: RELAY_BINDING_REQUIRED_CODE }, 403)
      }
      return jsonResponse({ success: true })
    }
    const client = await createHfRelayGomokuRoom({
      roomCode: 'room-1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl,
      pollIntervalMs: 0,
      onBindingRequired: () => {
        throw new Error('宿主重绑异常')
      },
      onEvent: () => {}
    })
    await expect(client.send({ type: 'move' })).rejects.toMatchObject({ status: 403 })
    // 宿主异常后凭证仍为空 → 不重发失效凭证（只有首个请求）。
    expect(sendAttempts).toBe(1)
    await client.close()
  })
})

describe('W1 收口：失败可见性（F3）', () => {
  it('F3：poll 持续 403 时上报可读中文，且不重发同一个失效凭证', async () => {
    vi.useFakeTimers()
    try {
      let pollCalls = 0
      const fetchImpl = async (url: string) => {
        const target = String(url)
        if (target.includes('/join')) return jsonResponse({ success: true, cursor: 0, peers: [] })
        if (target.includes('/poll')) {
          pollCalls += 1
          return jsonResponse({ success: false, error_code: RELAY_BINDING_REQUIRED_CODE }, 403)
        }
        return jsonResponse({ success: true })
      }
      const errors: Array<Record<string, unknown>> = []
      const client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: RELAY_BASE,
        fetchImpl,
        pollIntervalMs: 0,
        // 宿主重绑失败：凭证没有更新。
        onBindingRequired: () => ({ ok: false, code: RELAY_BINDING_REQUIRED_CODE }),
        onError: (event) => errors.push(event),
        onEvent: () => {}
      })
      const runPoll = async () => {
        const pending = client.pollOnce().then(
          () => null,
          (error: unknown) => error
        )
        await vi.advanceTimersByTimeAsync(2000)
        return await pending
      }
      for (let index = 0; index < POLL_FAILURE_THRESHOLD; index += 1) {
        expect(await runPoll()).toBeTruthy()
      }
      // 每轮只允许一个请求：凭证未更新时不得重发刚被拒绝的凭证（修复前每轮 2 个）。
      expect(pollCalls).toBe(POLL_FAILURE_THRESHOLD)
      const reported = errors.find((event) => event.type === 'poll_failed')
      expect(reported).toBeTruthy()
      expect(String(reported?.message)).toContain('联机中断')
      expect(String(reported?.message)).toContain('身份校验')
    } finally {
      vi.useRealTimers()
    }
  })

  it('F3：轮询恢复后上报 poll_recovered（宿主可清除中断提示）', async () => {
    let pollCount = 0
    const fetchImpl = async (url: string) => {
      const target = String(url)
      if (target.includes('/join')) return jsonResponse({ success: true, cursor: 0, peers: [] })
      if (target.includes('/poll')) {
        pollCount += 1
        // 首次 pollOnce 内在重试（3 次）全部失败，随后的轮询成功。
        if (pollCount <= 3) {
          return jsonResponse({ success: false, error_code: 'RELAY_UNAVAILABLE' }, 503)
        }
        return jsonResponse({ success: true, cursor: 1, peers: [], events: [] })
      }
      return jsonResponse({ success: true })
    }
    const errors: Array<Record<string, unknown>> = []
    const client = await createHfRelayGomokuRoom({
      roomCode: 'room-1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl,
      pollIntervalMs: 0,
      onError: (event) => errors.push(event),
      onEvent: () => {}
    })
    let firstError: unknown = null
    try {
      await client.pollOnce()
    } catch (error) {
      firstError = error
    }
    expect(firstError).toBeTruthy()
    await client.pollOnce()
    expect(errors.some((event) => event.type === 'poll_recovered')).toBe(true)
    await client.close()
  })
})

describe('W1 收口：重绑有界（F5）', () => {
  it('F5：宿主重绑持续失败时次数有上限并最终停止（不无限 hammer）', async () => {
    vi.useFakeTimers()
    try {
      let hostCalls = 0
      let pollCalls = 0
      const fetchImpl = async (url: string) => {
        const target = String(url)
        if (target.includes('/join')) return jsonResponse({ success: true, cursor: 0, peers: [] })
        if (target.includes('/poll')) {
          pollCalls += 1
          return jsonResponse({ success: false, error_code: RELAY_BINDING_REQUIRED_CODE }, 403)
        }
        return jsonResponse({ success: true })
      }
      const errors: Array<Record<string, unknown>> = []
      const client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: RELAY_BASE,
        fetchImpl,
        pollIntervalMs: 1200,
        onBindingRequired: async () => {
          hostCalls += 1
          return { ok: false, code: SEAT_PEER_OWNERSHIP_REQUIRED }
        },
        onError: (event) => errors.push(event),
        onEvent: () => {}
      })
      // 跑足够多轮轮询（远超重绑上限）：退避窗口 + 上限必须收敛。
      for (let index = 0; index < 400; index += 1) {
        await vi.advanceTimersByTimeAsync(1200)
      }
      expect(hostCalls).toBeLessThanOrEqual(MAX_REFRESH_ATTEMPTS)
      expect(hostCalls).toBeGreaterThanOrEqual(1)
      expect(pollCalls).toBeGreaterThan(MAX_REFRESH_ATTEMPTS)
      const suspended = errors.find((event) => event.code === BINDING_SUSPENDED_CODE)
      expect(suspended).toBeTruthy()
      expect(String(suspended?.message)).toContain('已停止自动重绑')

      // 停机后不再调用宿主重绑（不再 hammer 席位声明接口）。
      const callsAtSuspend = hostCalls
      for (let index = 0; index < 100; index += 1) {
        await vi.advanceTimersByTimeAsync(1200)
      }
      expect(hostCalls).toBe(callsAtSuspend)
      await client.close()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('冻结字段 peer_secret（join → seat，只存内存）', () => {
  it('未提供 peer_secret 时 seat 请求体与旧版逐字一致', () => {
    const legacy = buildSeatClaimBody({ roomCode: 'hbut-1', peerId: 'peer-a' })
    expect(legacy).toEqual({
      protocol_version: 1,
      room_code: 'hbut-1',
      peer_id: 'peer-a'
    })
    expect('peer_secret' in legacy).toBe(false)
  })

  it('join 响应里的 peer_secret 被捕获并只在 seat 请求体携带（不进 snapshot）', async () => {
    const router = createFetchRouter([
      {
        match: '/join',
        method: 'POST',
        respond: () =>
          jsonResponse({
            success: true,
            cursor: 0,
            peers: [],
            match_id: MATCH_ID,
            peer_secret: PEER_SECRET
          })
      },
      { match: '/seat', method: 'POST', respond: () => okJson({ seat: 'black', match: {} }) }
    ])
    const captured: string[] = []
    const client = await createHfRelayGomokuRoom({
      roomCode: 'HBUT1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: router.fetch,
      pollIntervalMs: 0,
      onPeerSecret: (secret) => captured.push(secret),
      onEvent: () => {}
    })
    expect(captured).toEqual([PEER_SECRET])

    const trust = createGomokuMatchTrust({
      transport: createPlatformMatchTransport({
        sessionToken: TOKEN,
        baseUrl: 'https://x.example/api/game-platform/v1',
        fetchImpl: router.fetch
      })
    })
    trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
    trust.setPeerSecret?.(captured[0])
    await trust.claimSeat({ peerId: 'peer-a' })

    expect(bodyOf(router.callsFor('/seat')[0]).peer_secret).toBe(PEER_SECRET)
    // 只存内存：绝不进 snapshot（onUpdate 广播面）/ 不落盘 / 不进日志。
    const snapshot = trust.snapshot()
    expect('peerSecret' in snapshot).toBe(false)
    expect(JSON.stringify(snapshot)).not.toContain(PEER_SECRET)
    await client.close()
  })

  // 行为修正（服务端安全收窄 71b685e）：旧断言"响应缺 peer_secret 时清空"改为"保留旧值"——
  // 响应缺字段只表示本次 join 未出示当前值，记录存活期间旧值仍有效；清空会让下一次席位绑定 403。
  it('不清空：join 响应无 peer_secret 时保留旧值，后续 join 继续携带', async () => {
    // 记录存在但客户端出示的值不匹配（如上一次重签响应丢失）→ 服务端不重签、不带字段。
    const server = createPeerSecretServer({ initial: 'gps1.' + 'cd'.repeat(20) })
    const captured: string[] = []
    const client = await createHfRelayGomokuRoom({
      roomCode: 'ROOM1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: relayFetchFrom(server),
      pollIntervalMs: 0,
      peerSecret: PEER_SECRET,
      onPeerSecret: (secret) => captured.push(secret),
      onEvent: () => {}
    })
    // 没有新值就不回调、不清空。
    expect(captured).toEqual([])
    expect(client.getPeerSecret?.()).toBe(PEER_SECRET)
    await client.rejoin?.()
    expect(server.joins).toHaveLength(2)
    // 下一次 join 仍出示持有的旧值（而不是丢掉它）。
    expect(server.joins[1].peer_secret).toBe(PEER_SECRET)
    await client.close()
  })

  it('轮换：持有 peer_secret 时 join 请求体携带，响应新值覆盖并上报宿主', async () => {
    const server = createPeerSecretServer({ initial: PEER_SECRET })
    const captured: string[] = []
    const client = await createHfRelayGomokuRoom({
      roomCode: 'ROOM1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: relayFetchFrom(server),
      pollIntervalMs: 0,
      peerSecret: PEER_SECRET,
      onPeerSecret: (secret) => captured.push(secret),
      onEvent: () => {}
    })
    // 首个 join 出示当前值 → 服务端匹配 → 重签换新值。
    expect(server.joins[0].peer_secret).toBe(PEER_SECRET)
    const rotated = server.current()
    expect(rotated).not.toBe(PEER_SECRET)
    expect(captured).toEqual([rotated])
    expect(client.getPeerSecret?.()).toBe(rotated)
    await client.close()
  })

  it('首连兼容：无 peer_secret 时 join 请求体不含该字段（与旧版逐字一致）', async () => {
    const server = createPeerSecretServer()
    const client = await createHfRelayGomokuRoom({
      roomCode: 'ROOM1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: relayFetchFrom(server),
      pollIntervalMs: 0,
      onEvent: () => {}
    })
    expect('peer_secret' in server.joins[0]).toBe(false)
    // 无记录 → 服务端签发，客户端持有新值。
    const issued = server.current()
    expect(issued.startsWith('gps1.')).toBe(true)
    expect(client.getPeerSecret?.()).toBe(issued)
    await client.close()
  })

  it('房间层自行持有副本：宿主 setPeerSecret 后 re-join 带回该值（不依赖可信层）', async () => {
    const server = createPeerSecretServer({ initial: PEER_SECRET })
    const client = await createHfRelayGomokuRoom({
      roomCode: 'ROOM1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: relayFetchFrom(server),
      pollIntervalMs: 0,
      onEvent: () => {}
    })
    // 首次 join 时房间层尚未持有（未出示 → 服务端不重签）。
    expect('peer_secret' in server.joins[0]).toBe(false)
    // 可信层就绪后由宿主同步给房间层 → 下一次 re-join 带回当前值。
    client.setPeerSecret?.(PEER_SECRET)
    await client.rejoin?.()
    expect(server.joins[1].peer_secret).toBe(PEER_SECRET)
    await client.close()
  })

  it('重连不自杀：re-join 无新值 → 再次席位绑定仍带原 secret，且不进入 suspended', async () => {
    const server = createPeerSecretServer({ initial: PEER_SECRET })
    const seatBodies: Array<Record<string, unknown>> = []
    const errors: Array<Record<string, unknown>> = []
    const client = await createHfRelayGomokuRoom({
      roomCode: 'ROOM1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: relayFetchFrom(server, seatBodies),
      pollIntervalMs: 0,
      peerSecret: PEER_SECRET,
      onError: (event) => errors.push(event),
      onEvent: () => {}
    })
    // 首次 join 出示了当前值 → 服务端轮换；客户端持有新值。
    const rotated = server.current()
    expect(rotated).not.toBe(PEER_SECRET)
    // 网络重连：本次 join 响应不带 peer_secret（旧服务端 / 未上线字段）。
    server.setSilent(true)
    await client.rejoin?.()
    expect(client.getPeerSecret?.()).toBe(rotated)

    // 再次席位绑定：请求体仍带原持有值（join 响应没有把它清空）。
    const trust = createGomokuMatchTrust({
      transport: createPlatformMatchTransport({
        sessionToken: TOKEN,
        baseUrl: 'https://x.example/api/game-platform/v1',
        fetchImpl: relayFetchFrom(server, seatBodies)
      })
    })
    trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'ROOM1' })
    trust.setPeerSecret?.(client.getPeerSecret?.() || rotated)
    await trust.claimSeat({ peerId: 'peer-a' })
    expect(seatBodies[0].peer_secret).toBe(rotated)
    expect(errors.some((event) => event.code === BINDING_SUSPENDED_CODE)).toBe(false)
    await client.close()
  })

  it('SEAT_PEER_OWNERSHIP_REQUIRED 与 RELAY_BINDING_REQUIRED 同属"需要重绑"类错误', async () => {
    let sendAttempts = 0
    const fetchImpl = async (url: string) => {
      const target = String(url)
      if (target.includes('/join')) return jsonResponse({ success: true, cursor: 0, peers: [] })
      if (target.includes('/send')) {
        sendAttempts += 1
        if (sendAttempts === 1) {
          return jsonResponse(
            { success: false, error_code: SEAT_PEER_OWNERSHIP_REQUIRED },
            403
          )
        }
        return jsonResponse({ success: true })
      }
      return jsonResponse({ success: true })
    }
    let client: any = null
    client = await createHfRelayGomokuRoom({
      roomCode: 'room-1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl,
      pollIntervalMs: 0,
      onBindingRequired: () => {
        client?.setRelayBinding('grb1.rejoined.token')
      },
      onEvent: () => {}
    })
    await client.send({ type: 'move' })
    expect(sendAttempts).toBe(2)
    await client.close()
  })
})

describe('W1 收口：导出契约（修复后必须存在）', () => {
  it('online.js / match_trust.js 导出有界重绑与凭证归属 API', async () => {
    const online: Record<string, any> = await import(
      '../../../../website/modules-src/hbut_gomoku/project/src/game/online.js'
    )
    expect(online.RELAY_BINDING_REQUIRED_CODE).toBe('RELAY_BINDING_REQUIRED')
    expect(online.SEAT_PEER_OWNERSHIP_REQUIRED_CODE).toBe(SEAT_PEER_OWNERSHIP_REQUIRED)
    expect(online.RELAY_BINDING_SUSPENDED_CODE).toBe(BINDING_SUSPENDED_CODE)
    expect(online.RELAY_BINDING_MAX_REFRESH_ATTEMPTS).toBe(MAX_REFRESH_ATTEMPTS)
    expect(online.RELAY_POLL_FAILURE_REPORT_THRESHOLD).toBe(POLL_FAILURE_THRESHOLD)
    expect(typeof online.describeRelayError).toBe('function')
    expect(online.describeRelayError({ code: RELAY_BINDING_REQUIRED_CODE })).toContain('身份校验')

    const trust = createGomokuMatchTrust({ transport: null })
    expect(typeof trust.forgetRelayBinding).toBe('function')
    expect(typeof trust.relayBindingForMatch).toBe('function')
    expect(typeof trust.setPeerSecret).toBe('function')
    expect(typeof trust.peerSecret).toBe('function')
    expect(buildSeatClaimBody({ roomCode: 'R', peerId: 'p', peerSecret: PEER_SECRET })).toMatchObject({
      peer_secret: PEER_SECRET
    })

    // 房间层：持有副本 + 本地可读（宿主在可信层就绪后同步；re-join 带回当前值）。
    const room = await createHfRelayGomokuRoom({
      roomCode: 'ROOM1',
      peerId: 'peer-a',
      baseUrl: RELAY_BASE,
      fetchImpl: relayFetchFrom(createPeerSecretServer()),
      pollIntervalMs: 0,
      onEvent: () => {}
    })
    expect(typeof room.setPeerSecret).toBe('function')
    expect(typeof room.getPeerSecret).toBe('function')
    await room.close()
  })
})

describe('W1 收口：既有归一化路径（回归护栏）', () => {
  it('房间码归一化仍生效（携带门槛改动未影响规范化）', () => {
    expect(normalizeRoomCode('hbut-1')).toBe('HBUT1')
  })
})

describe('S2 收口：席位 403 的机器码在 error.details.error_code（真实 envelope 形状）', () => {
  /**
   * 服务端真实响应形状（复核者探针原样）：顶层 `error.code` 只是大类 `FORBIDDEN_ACTOR`，
   * 细粒度机器码 `SEAT_PEER_OWNERSHIP_REQUIRED` 在 `error.details.error_code`。
   * 旧解析只读顶层码 → 自愈 `rejoin`、"待确认·身份校验" UI 文案全部失效。
   */
  const SEAT_FORBIDDEN_ENVELOPE = {
    success: false,
    error: {
      code: 'FORBIDDEN_ACTOR',
      message: '席位身份凭证所有权不足，需要重新绑定',
      retryable: false,
      request_id: 'req_seat_403',
      details: { error_code: SEAT_PEER_OWNERSHIP_REQUIRED }
    }
  }

  const seatTransportWithEnvelope = () =>
    createPlatformMatchTransport({
      sessionToken: TOKEN,
      baseUrl: 'https://x.example/api/game-platform/v1',
      fetchImpl: createFetchRouter([
        { match: '/seat', method: 'POST', respond: () => jsonResponse(SEAT_FORBIDDEN_ENVELOPE, 403) }
      ]).fetch
    })

  it('传输层：优先采用 details.error_code，顶层 FORBIDDEN_ACTOR 保留为 envelopeCode', async () => {
    const transport = seatTransportWithEnvelope()
    let error: Record<string, any> | null = null
    try {
      await transport.claimSeat({ matchId: MATCH_ID, roomCode: 'HBUT1', peerId: 'peer-a' })
    } catch (caught) {
      error = caught as Record<string, any>
    }
    expect(error).toBeTruthy()
    expect(error!.code).toBe(SEAT_PEER_OWNERSHIP_REQUIRED)
    expect(error!.envelopeCode).toBe('FORBIDDEN_ACTOR')
    expect(error!.status).toBe(403)
    expect(error!.message).toBe('席位身份凭证所有权不足，需要重新绑定')
    expect(error!.payload.error.details.error_code).toBe(SEAT_PEER_OWNERSHIP_REQUIRED)
  })

  it('可信层：lastErrorCode 取到机器码 → 自愈 rejoin 与「待确认·身份校验」的判定条件成立', async () => {
    const trust = createGomokuMatchTrust({ transport: seatTransportWithEnvelope() })
    trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
    const payload = await trust.claimSeat({ peerId: 'peer-a' })
    expect(payload).toBeNull()

    const snapshot = trust.snapshot()
    expect(snapshot.seatClaimed).toBe(false)
    // main.js 的两处判定都读这个值：syncMatchSeat 的 result.code 与 matchOutcomeText 的
    // lastErrorCode === 'SEAT_PEER_OWNERSHIP_REQUIRED'。修复前它是 FORBIDDEN_ACTOR → 分支永不触发。
    expect(snapshot.lastErrorCode).toBe(SEAT_PEER_OWNERSHIP_REQUIRED)
    expect(snapshot.lastError).toContain('席位身份凭证所有权不足')
  })

  it.each([
    ['数字', 42],
    ['对象', { a: 1 }],
    ['布尔', true]
  ])('details.error_code 非字符串（%s）→ 不采纳，回落顶层码（F3）', async (_label, rawDetailCode) => {
    const transport = createPlatformMatchTransport({
      sessionToken: TOKEN,
      baseUrl: 'https://x.example/api/game-platform/v1',
      fetchImpl: createFetchRouter([
        {
          match: '/seat',
          method: 'POST',
          respond: () =>
            jsonResponse(
              {
                success: false,
                error: {
                  code: 'FORBIDDEN_ACTOR',
                  message: '席位身份凭证所有权不足，需要重新绑定',
                  retryable: false,
                  details: { error_code: rawDetailCode }
                }
              },
              403
            )
        }
      ]).fetch
    })

    let error: Record<string, any> | null = null
    try {
      await transport.claimSeat({ matchId: MATCH_ID, roomCode: 'HBUT1', peerId: 'peer-a' })
    } catch (caught) {
      error = caught as Record<string, any>
    }
    expect(error).toBeTruthy()
    expect(error!.code).toBe('FORBIDDEN_ACTOR')
    expect(error!.envelopeCode).toBe('FORBIDDEN_ACTOR')
    // 不把 `42` / `[object Object]` / `true` 强转成机器码（等效修复前行为：不匹配自愈分支）
    expect(error!.code).not.toBe(String(rawDetailCode))
  })
})
