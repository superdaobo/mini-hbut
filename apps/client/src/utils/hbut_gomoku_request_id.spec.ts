/**
 * #964：五子棋链路的 X-Request-Id / request_id 全链路。
 *
 * 锁定：
 * 1. HF relay 请求（join/poll/send/leave）携带 `X-Request-Id`（形状与服务端 `req_<hex>` 兼容）；
 * 2. relay 错误对象携带请求 ID（服务端响应 `request_id` 优先），「联机中断」上报
 *   （onError poll_failed）同样透出该 id，便于与服务端日志对齐；
 * 3. 平台可信层（match_trust）：transport 请求头携带请求 ID、错误对象 `requestId` 透出
 *   服务端响应值；可信层状态机 `lastErrorRequestId` 记录失败请求 ID、成功后清空。
 */
import { describe, expect, it } from 'vitest'
import { createHfRelayGomokuRoom } from '../../../../website/modules-src/hbut_gomoku/project/src/game/online.js'
import {
  createGomokuMatchTrust,
  createPlatformMatchTransport
} from '../../../../website/modules-src/hbut_gomoku/project/src/game/match_trust.js'
import { createFetchRouter, jsonResponse, okJson, errJson } from './_sdk_test_harness'

const MATCH_ID = 'gm_0123456789abcdef01234567'
const ROOM = 'ABCDEFGH'
const TOKEN = 'gs_' + 'a'.repeat(32)
const RELAY_BASE = 'https://relay.example/api/gomoku-relay'
const MATCH_BASE = 'https://games.example/api/game-platform/v1'

/** 服务端形状约束（req_ 前缀 + hex；总长 ≤64） */
const REQUEST_ID_RE = /^req_[0-9a-f]{8,61}$/

describe('#964 五子棋 HF relay：请求头注入与错误对象携带 request_id', () => {
  it('join / poll 请求都携带 X-Request-Id（每次请求形状合法）', async () => {
    const router = createFetchRouter([
      {
        match: '/join',
        method: 'POST',
        respond: () => jsonResponse({ success: true, cursor: 1, peers: [], match_id: MATCH_ID })
      },
      {
        match: '/poll',
        method: 'GET',
        respond: () => jsonResponse({ success: true, cursor: 1, peers: [], events: [] })
      }
    ])
    const room = await createHfRelayGomokuRoom({
      roomCode: ROOM,
      baseUrl: RELAY_BASE,
      fetchImpl: router.fetch,
      pollIntervalMs: 0
    })
    await room.pollOnce()

    const joinCalls = router.callsFor('/join')
    const pollCalls = router.callsFor('/poll')
    expect(joinCalls).toHaveLength(1)
    expect(pollCalls).toHaveLength(1)
    expect(joinCalls[0].headers['x-request-id']).toMatch(REQUEST_ID_RE)
    expect(pollCalls[0].headers['x-request-id']).toMatch(REQUEST_ID_RE)
  })

  it('relay 错误对象携带服务端响应的 request_id（服务端值优先）', async () => {
    const router = createFetchRouter([
      {
        match: '/join',
        method: 'POST',
        respond: () => jsonResponse({ success: true, cursor: 1, peers: [] })
      },
      {
        match: '/poll',
        method: 'GET',
        // 403 + 非 binding 错误码：不可重试、不触发重绑 → 原样抛给 pollOnce
        respond: () =>
          jsonResponse({
            success: false,
            error_code: 'RELAY_POLL_DENIED',
            request_id: 'req_srv_relay_poll'
          }, 403)
      }
    ])
    const room = await createHfRelayGomokuRoom({
      roomCode: ROOM,
      baseUrl: RELAY_BASE,
      fetchImpl: router.fetch,
      pollIntervalMs: 0
    })

    let thrown: { requestId?: string; status?: number } | null = null
    await room.pollOnce().catch((error: { requestId?: string; status?: number }) => {
      thrown = error
    })
    const relayError = thrown as { requestId?: string; status?: number } | null
    expect(relayError).toBeTruthy()
    expect(relayError?.status).toBe(403)
    expect(relayError?.requestId).toBe('req_srv_relay_poll')
  })

  it('「联机中断」上报（onError poll_failed）透出 request_id，便于与服务端日志对齐', async () => {
    const router = createFetchRouter([
      {
        match: '/join',
        method: 'POST',
        respond: () => jsonResponse({ success: true, cursor: 1, peers: [] })
      },
      {
        match: '/poll',
        method: 'GET',
        respond: () =>
          jsonResponse({
            success: false,
            error_code: 'RELAY_POLL_DENIED',
            request_id: 'req_srv_relay_failed'
          }, 403)
      }
    ])
    const relayErrors: Array<Record<string, unknown>> = []
    const room = await createHfRelayGomokuRoom({
      roomCode: ROOM,
      baseUrl: RELAY_BASE,
      fetchImpl: router.fetch,
      pollIntervalMs: 0,
      onError: (event: Record<string, unknown>) => relayErrors.push(event)
    })

    // F3：连续失败达到阈值（3 次）才上报一次
    await room.pollOnce().catch(() => {})
    await room.pollOnce().catch(() => {})
    await room.pollOnce().catch(() => {})

    const pollFailed = relayErrors.find((event) => event.type === 'poll_failed')
    expect(pollFailed).toBeTruthy()
    expect(pollFailed?.request_id).toBe('req_srv_relay_failed')
  })
})

describe('#964 五子棋可信层（match_trust）：请求 ID 注入与 lastErrorRequestId', () => {
  it('transport 请求携带 X-Request-Id；错误对象透出服务端响应的 request_id', async () => {
    const router = createFetchRouter([
      {
        match: '/seat',
        method: 'POST',
        respond: () => errJson('FORBIDDEN_ACTOR', 403, { request_id: 'req_srv_match_seat' })
      }
    ])
    const transport = createPlatformMatchTransport({
      sessionToken: TOKEN,
      baseUrl: MATCH_BASE,
      fetchImpl: router.fetch
    })

    let thrown: { requestId?: string } | null = null
    await transport
      .claimSeat({ matchId: MATCH_ID, roomCode: ROOM, peerId: 'peer-a' })
      .catch((error: { requestId?: string }) => {
        thrown = error
      })
    const seatError = thrown as { requestId?: string } | null

    const seatCalls = router.callsFor('/seat')
    expect(seatCalls).toHaveLength(1)
    expect(seatCalls[0].headers['x-request-id']).toMatch(REQUEST_ID_RE)
    expect(seatError?.requestId).toBe('req_srv_match_seat')
  })

  it('可信层状态机：失败后 lastErrorRequestId 记录该 id，成功后清空（快照可读）', async () => {
    let failNext = true
    const router = createFetchRouter([
      {
        match: '/seat',
        method: 'POST',
        respond: () =>
          failNext
            ? errJson('FORBIDDEN_ACTOR', 403, { request_id: 'req_srv_match_failed' })
            : okJson({ seat: 'black', match: { match_id: MATCH_ID, server_verified: true } })
      }
    ])
    const transport = createPlatformMatchTransport({
      sessionToken: TOKEN,
      baseUrl: MATCH_BASE,
      fetchImpl: router.fetch
    })
    const snapshots: Array<Record<string, unknown>> = []
    const trust = createGomokuMatchTrust({
      transport,
      onUpdate: (snapshot: Record<string, unknown>) => snapshots.push({ ...snapshot })
    })
    // claimSeat 使用状态机内的 matchId（调用方先 rememberMatch）
    trust.rememberMatch({ matchId: MATCH_ID, roomCode: ROOM })

    // 第一次：失败 → lastErrorRequestId 记录服务端响应的请求 ID
    await trust.claimSeat({ peerId: 'peer-a' })
    const failedSnapshot = snapshots[snapshots.length - 1] || {}
    expect(failedSnapshot.lastErrorRequestId).toBe('req_srv_match_failed')

    // 第二次：成功 → 记录被清空
    failNext = false
    await trust.claimSeat({ peerId: 'peer-a', force: true })
    const okSnapshot = snapshots[snapshots.length - 1] || {}
    expect(okSnapshot.lastErrorRequestId).toBe('')
  })
})
