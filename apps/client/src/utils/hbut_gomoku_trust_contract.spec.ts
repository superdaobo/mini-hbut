import { describe, expect, it, vi } from 'vitest'

/**
 * 五子棋 `server_verified_match` 客户端契约测试（#908）。
 *
 * 1. **把既有的 1199 行联机测试接入 CI**：`online.test.js` 原本不在任何 vitest 配置的
 *    `include` 范围内（`vitest.ci.config.ts` 只采集 `src/**\/*.spec.ts`）。这里以相对路径
 *    直接 import 该文件，其 `describe/it` 会在本文件所在进程内注册并执行，从而进入 CI 门禁
 *    （与 `hbut_stack_game.spec.ts` 直接 import 游戏源码同一范式）。
 * 2. 新增 `match_trust.js`（客户端可信层）与 `online.js` 的 addtive `match_id` 的测试。
 *
 * 硬约束断言：客户端**只上报"我以为的结果"**，赛果恒以服务端返回为准；actor 字段本地即拒。
 */

import '../../../../website/modules-src/hbut_gomoku/project/src/game/online.test.js'
import {
  RELAY_BINDING_REQUIRED_CODE,
  createHfRelayGomokuRoom,
  normalizeRoomCode
} from '../../../../website/modules-src/hbut_gomoku/project/src/game/online.js'
import {
  CLAIM_OUTCOMES,
  GOMOKU_GAME_ID,
  MATCH_RESULTS,
  MATCH_TRUST_LEVEL,
  RELAY_AUTH_HEADER,
  bootstrapMatchSession,
  buildResultClaimBody,
  buildSeatClaimBody,
  createGomokuMatchTrust,
  createGomokuMatchTrustFromHost,
  createPlatformMatchTransport,
  describeMatchOutcome,
  extractRelayBinding,
  isRetryableMatchError,
  matchPaths,
  normalizeMatchView,
  outcomeForSeat,
  resolveAuthoritativeOutcome,
  resolveGamePlatformBase
} from '../../../../website/modules-src/hbut_gomoku/project/src/game/match_trust.js'
import { okJson, errJson, createFetchRouter, jsonResponse } from './_sdk_test_harness'

const MATCH_ID = 'gm_0123456789abcdef01234567'
const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const TOKEN = 'gs_' + 'a'.repeat(32)

describe('五子棋服务端确认赛果（客户端契约）', () => {
  describe('API base 与请求体', () => {
    it('base 推导与 SDK 同规则（显式注入 > rank_api 同源 > 默认）', () => {
      expect(resolveGamePlatformBase({ injected: 'https://x.example/api/game-platform/v1' })).toBe(
        'https://x.example/api/game-platform/v1'
      )
      expect(resolveGamePlatformBase({ injected: 'https://x.example' })).toBe(
        'https://x.example/api/game-platform/v1'
      )
      expect(resolveGamePlatformBase({ rankApi: 'https://x.example/api/game-rank' })).toBe(
        'https://x.example/api/game-platform/v1'
      )
      expect(resolveGamePlatformBase({})).toContain('/api/game-platform/v1')
    })

    it('端点路径与 relay/服务端实现逐条对应', () => {
      expect(matchPaths(MATCH_ID)).toEqual({
        seat: `/matches/${MATCH_ID}/seat`,
        result: `/matches/${MATCH_ID}/result`,
        detail: `/matches/${MATCH_ID}`,
        stats: '/me/gomoku/stats'
      })
    })

    it('席位绑定体只含白名单字段，绝无 actor / 奖励字段', () => {
      const body = buildSeatClaimBody({ roomCode: 'hbut-1', peerId: 'peer-a', clientVersion: '1.0.0' })
      expect(Object.keys(body).sort()).toEqual([
        'client_version',
        'peer_id',
        'protocol_version',
        'room_code'
      ])
      expect(body.protocol_version).toBe(1)
      expect(JSON.stringify(body)).not.toMatch(/student_id|player_id|user_id|reward/)
    })

    it('结果上报体只有 claimed_outcome（客户端不能提交 winner/score）', () => {
      const body = buildResultClaimBody({ claimedOutcome: CLAIM_OUTCOMES.win })
      expect(body).toEqual({ protocol_version: 1, claimed_outcome: 'win' })
      expect(JSON.stringify(body)).not.toMatch(/winner|score|xp|coin/)
    })
  })

  describe('赛果采纳：服务端优先', () => {
    it('服务端确认时采用服务端赛果与信任级别', () => {
      const result = resolveAuthoritativeOutcome({
        claim: { claimed: 'win', authoritative: 'loss', matched: false },
        match: { status: 'finalized', result: 'white_win', server_verified: true },
        seat: 'black'
      })
      expect(result.authoritative).toBe('loss')
      expect(result.matched).toBe(false)
      expect(result.mismatched).toBe(true)
      expect(result.trustLevel).toBe(MATCH_TRUST_LEVEL)
      expect(MATCH_TRUST_LEVEL).toBe('server_verified_match')
    })

    it('服务端未确认（作废局）时本地不得声称已确认', () => {
      const result = resolveAuthoritativeOutcome({
        claim: { claimed: 'win' },
        match: { status: 'abandoned', result: 'abandoned', server_verified: false },
        seat: 'black'
      })
      expect(result.trustLevel).toBe('')
      expect(result.authoritative).toBe('')
    })

    it('席位视角胜负折算与展示文案', () => {
      expect(outcomeForSeat(MATCH_RESULTS.blackWin, 'black')).toBe('win')
      expect(outcomeForSeat(MATCH_RESULTS.blackWin, 'white')).toBe('loss')
      expect(outcomeForSeat(MATCH_RESULTS.draw, 'white')).toBe('draw')
      expect(outcomeForSeat(MATCH_RESULTS.abandoned, 'white')).toBe('abandoned')
      expect(describeMatchOutcome({ outcome: 'win', trustLevel: MATCH_TRUST_LEVEL })).toContain(
        '服务端已确认'
      )
      expect(describeMatchOutcome({ outcome: 'win', trustLevel: '' })).toContain('服务端未确认')
    })

    it('W1：未认证局（authenticated=false）不得声称已确认；旧服务端字段缺失仍兼容', () => {
      const unverified = resolveAuthoritativeOutcome({
        claim: { claimed: 'win', authoritative: 'win' },
        match: {
          status: 'finalized',
          result: 'black_win',
          server_verified: true,
          authenticated: false
        },
        seat: 'black'
      })
      expect(unverified.trustLevel).toBe('')
      expect(unverified.authoritative).toBe('')
      // additive 兼容：旧服务端不返回 authenticated 字段 → 按已确认处理。
      const legacy = resolveAuthoritativeOutcome({
        claim: { claimed: 'win', authoritative: 'win' },
        match: { status: 'finalized', result: 'black_win', server_verified: true },
        seat: 'black'
      })
      expect(legacy.trustLevel).toBe(MATCH_TRUST_LEVEL)
    })

    it('归一化视图丢弃所有身份字段', () => {
      const view = normalizeMatchView({
        match_id: MATCH_ID,
        status: 'finalized',
        result: 'black_win',
        server_verified: true,
        player_id: 'secret',
        black_player_id: 'secret',
        peer_id: 'peer-secret',
        anomalies: { claim_mismatch: 1 }
      })
      expect(view.matchId).toBe(MATCH_ID)
      expect(view.serverVerified).toBe(true)
      expect(view.anomalies).toEqual({ claim_mismatch: 1 })
      expect(JSON.stringify(view)).not.toMatch(/secret|player_id|peer_id/)
    })
  })

  describe('传输层（Bearer GS token + match_id 幂等键）', () => {
    it('带上 Authorization / Idempotency-Key / 协议头', async () => {
      const router = createFetchRouter([
        { match: '/seat', method: 'POST', respond: () => okJson({ seat: 'black', match: {} }) }
      ])
      const transport = createPlatformMatchTransport({
        sessionToken: TOKEN,
        baseUrl: 'https://x.example/api/game-platform/v1',
        fetchImpl: router.fetch
      })
      await transport.claimSeat({ matchId: MATCH_ID, roomCode: 'HBUT1', peerId: 'peer-a' })
      const call = router.calls[0]
      expect(call.url).toBe(`https://x.example/api/game-platform/v1/matches/${MATCH_ID}/seat`)
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`)
      expect(call.headers['idempotency-key']).toBe(MATCH_ID)
      expect(call.headers['x-game-platform-protocol']).toBe('1')
      expect(call.body).toEqual({
        protocol_version: 1,
        room_code: 'HBUT1',
        peer_id: 'peer-a'
      })
    })

    it('4xx 语义错误不重试，5xx / 网络错误可重试', async () => {
      const router = createFetchRouter([
        {
          match: '/result',
          method: 'POST',
          respond: () => errJson('FORBIDDEN_ACTOR', 403)
        }
      ])
      const transport = createPlatformMatchTransport({
        sessionToken: TOKEN,
        baseUrl: 'https://x.example/api/game-platform/v1',
        fetchImpl: router.fetch
      })
      await expect(transport.reportResult({ matchId: MATCH_ID })).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN_ACTOR'
      })
      expect(isRetryableMatchError({ status: 403 })).toBe(false)
      expect(isRetryableMatchError({ status: 429 })).toBe(true)
      expect(isRetryableMatchError({ status: 0 })).toBe(true)
      expect(isRetryableMatchError({ status: 502 })).toBe(true)
    })
  })

  describe('可信层状态机', () => {
    const transportStub = (overrides: Record<string, unknown> = {}) => ({
      hasSession: () => true,
      claimSeat: vi.fn(async () => ({ seat: 'black', match: { match_id: MATCH_ID } })),
      reportResult: vi.fn(async () => ({
        seat: 'black',
        settled: true,
        match: { match_id: MATCH_ID, status: 'finalized', result: 'black_win', server_verified: true },
        claim: { claimed: 'win', authoritative: 'win', matched: true },
        stats: { season: { wins: 1, losses: 0, draws: 0, matches: 1, points: 3 } }
      })),
      fetchStats: vi.fn(async () => ({ stats: { season: { wins: 1 } } })),
      ...overrides
    })

    it('未连接会话时整体禁用且绝不抛错', async () => {
      const trust = createGomokuMatchTrust({ transport: null })
      expect(trust.isEnabled()).toBe(false)
      // 没有 match_id 时上报是空操作（不产生任何副作用）。
      await expect(trust.reportResult({ claimedOutcome: 'win' })).resolves.toBeNull()
      trust.rememberMatch({ matchId: MATCH_ID })
      await expect(trust.reportResult({ claimedOutcome: 'win' })).resolves.toBeNull()
      expect(trust.snapshot().lastError).toContain('未连接')
    })

    it('席位绑定幂等：同一 match_id 只绑定一次', async () => {
      const transport = transportStub()
      const trust = createGomokuMatchTrust({ transport })
      trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
      await trust.claimSeat({ peerId: 'peer-a' })
      await trust.claimSeat({ peerId: 'peer-a' })
      expect(transport.claimSeat).toHaveBeenCalledTimes(1)
      expect(trust.snapshot().seatClaimed).toBe(true)
      expect(trust.snapshot().seat).toBe('black')
    })

    it('同一结果只上报一次；服务端赛果被采纳为本席位胜负', async () => {
      const transport = transportStub()
      const updates: Array<Record<string, unknown>> = []
      const trust = createGomokuMatchTrust({
        transport,
        onUpdate: (snapshot) => updates.push(snapshot)
      })
      trust.rememberMatch({ matchId: MATCH_ID })
      await trust.claimSeat({ peerId: 'peer-a' })
      await trust.reportResult({ claimedOutcome: 'win' })
      await trust.reportResult({ claimedOutcome: 'win' })
      expect(transport.reportResult).toHaveBeenCalledTimes(1)
      const outcome = trust.authoritative()
      expect(outcome.authoritative).toBe('win')
      expect(outcome.trustLevel).toBe(MATCH_TRUST_LEVEL)
      expect(outcome.settled).toBe(true)
      expect(updates.length).toBeGreaterThan(0)
    })

    it('客户端谎报时标记不一致但绝不改写服务端赛果', async () => {
      const transport = transportStub({
        reportResult: vi.fn(async () => ({
          seat: 'black',
          settled: true,
          match: { match_id: MATCH_ID, status: 'finalized', result: 'white_win', server_verified: true },
          claim: { claimed: 'win', authoritative: 'loss', matched: false }
        }))
      })
      const trust = createGomokuMatchTrust({ transport })
      trust.rememberMatch({ matchId: MATCH_ID })
      await trust.reportResult({ claimedOutcome: 'win', force: true })
      const outcome = trust.authoritative()
      expect(outcome.authoritative).toBe('loss')
      expect(outcome.mismatched).toBe(true)
      expect(outcome.trustLevel).toBe(MATCH_TRUST_LEVEL)
    })

    it('上报失败只记错误（旁路），下棋流程不受影响', async () => {
      const transport = transportStub({
        reportResult: vi.fn(async () => {
          const error = new Error('mock FORBIDDEN_ACTOR')
          ;(error as unknown as Record<string, unknown>).status = 403
          ;(error as unknown as Record<string, unknown>).code = 'FORBIDDEN_ACTOR'
          throw error
        })
      })
      const trust = createGomokuMatchTrust({ transport })
      trust.rememberMatch({ matchId: MATCH_ID })
      await expect(trust.reportResult({ claimedOutcome: 'win' })).resolves.toBeNull()
      expect(trust.snapshot().lastErrorCode).toBe('FORBIDDEN_ACTOR')
      expect(trust.authoritative().trustLevel).toBe('')
    })

    it('换场（房间号复用）时重置席位与上报记忆', async () => {
      const transport = transportStub()
      const trust = createGomokuMatchTrust({ transport })
      trust.rememberMatch({ matchId: MATCH_ID })
      await trust.claimSeat({ peerId: 'peer-a' })
      await trust.reportResult({ claimedOutcome: 'win' })
      trust.rememberMatch({ matchId: 'gm_ffffffffffffffffffffffff' })
      expect(trust.snapshot().seatClaimed).toBe(false)
      expect(trust.snapshot().reported).toBe('')
    })
  })

  describe('宿主 ticket → 会话引导', () => {
    it('无 ticket 时降级为禁用（不阻塞下棋）', async () => {
      const result = await bootstrapMatchSession({
        params: new URLSearchParams(''),
        fetchImpl: createFetchRouter([]).fetch
      })
      expect(result.enabled).toBe(false)
      expect(result.reason).toBe('no_launch_ticket')
    })

    it('有 ticket 时兑换会话并清理 URL', async () => {
      const router = createFetchRouter([
        {
          match: '/sessions',
          method: 'POST',
          respond: () =>
            okJson({
              session_id: 'sid_0123456789abcdef',
              session_token: TOKEN,
              expires_at: '2026-09-27T09:00:00Z'
            })
        }
      ])
      const historyUrls: string[] = []
      const result = await bootstrapMatchSession({
        params: new URLSearchParams(`gpt=${TICKET}`),
        location: { pathname: '/index.html', search: `?gpt=${TICKET}`, hash: '' },
        history: {
          replaceState: (_state: unknown, _title: string, url: string) => historyUrls.push(url)
        },
        fetchImpl: router.fetch
      })
      expect(result.enabled).toBe(true)
      expect(result.sessionToken).toBe(TOKEN)
      expect(router.callsFor('/sessions')).toHaveLength(1)
      expect(historyUrls[0]).not.toContain(TICKET)
    })

    it('兑换失败时禁用并给出原因码', async () => {
      const router = createFetchRouter([
        { match: '/sessions', method: 'POST', respond: () => errJson('TICKET_USED', 409) }
      ])
      const result = await bootstrapMatchSession({
        params: new URLSearchParams(`gpt=${TICKET}`),
        fetchImpl: router.fetch
      })
      expect(result.enabled).toBe(false)
      expect(result.reason).toBe('TICKET_USED')
    })

    it('组合入口：无 ticket 时返回禁用的可信层（可安全调用）', async () => {
      const bootstrapped = await createGomokuMatchTrustFromHost({
        params: new URLSearchParams(''),
        fetchImpl: createFetchRouter([]).fetch
      })
      expect(bootstrapped.enabled).toBe(false)
      expect(bootstrapped.trust.isEnabled()).toBe(false)
      await expect(bootstrapped.trust.reportResult({ claimedOutcome: 'win' })).resolves.toBeNull()
    })

    it('组合入口：有 ticket 时可信层可用并能上报', async () => {
      const router = createFetchRouter([
        {
          match: '/sessions',
          method: 'POST',
          respond: () =>
            okJson({ session_id: 'sid_0123456789abcdef', session_token: TOKEN, expires_at: '' })
        },
        {
          match: '/result',
          method: 'POST',
          respond: () =>
            jsonResponse({
              success: true,
              settled: true,
              seat: 'black',
              match: { match_id: MATCH_ID, status: 'finalized', result: 'black_win', server_verified: true },
              claim: { claimed: 'win', authoritative: 'win', matched: true }
            })
        }
      ])
      const bootstrapped = await createGomokuMatchTrustFromHost({
        params: new URLSearchParams(`gpt=${TICKET}`),
        fetchImpl: router.fetch
      })
      expect(bootstrapped.enabled).toBe(true)
      bootstrapped.trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
      const payload = await bootstrapped.trust.reportResult({ claimedOutcome: 'win' })
      expect(payload?.settled).toBe(true)
      expect(bootstrapped.trust.authoritative().trustLevel).toBe(MATCH_TRUST_LEVEL)
      expect(router.callsFor('/matches')).toHaveLength(1)
    })
  })

  describe('online.js 的 additive match_id', () => {
    const buildRelayFetch = (joinBody: Record<string, unknown>) => {
      const calls: Array<[string, Record<string, unknown>]> = []
      const fetchImpl = async (url: string, init: Record<string, unknown> = {}) => {
        calls.push([String(url), init])
        if (String(url).endsWith('/join')) {
          return { ok: true, json: async () => joinBody }
        }
        if (String(url).endsWith('/poll')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              cursor: 2,
              peers: ['peer-a', 'peer-b'],
              events: [],
              match_id: joinBody.match_id
            })
          }
        }
        return { ok: true, json: async () => ({ success: true }) }
      }
      return { calls, fetchImpl }
    }

    it('join 响应带 match_id 时下发 match 事件并可从房间读取', async () => {
      const { fetchImpl } = buildRelayFetch({
        success: true,
        cursor: 1,
        peers: ['peer-a', 'peer-b'],
        match_id: MATCH_ID
      })
      const events: Array<Record<string, unknown>> = []
      const client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: 'https://relay.example/api/gomoku-relay',
        fetchImpl,
        pollIntervalMs: 0,
        onEvent: (event) => events.push(event)
      })
      const matchEvent = events.find((event) => event.type === 'match')
      expect(matchEvent).toEqual({
        type: 'match',
        matchId: MATCH_ID,
        roomCode: normalizeRoomCode('room-1'),
        peerId: 'peer-a'
      })
      expect(client.getMatchId()).toBe(MATCH_ID)
      await client.pollOnce()
      expect(events.filter((event) => event.type === 'match')).toHaveLength(1)
      await client.close()
    })

    it('旧 relay（无 match_id）行为逐字不变：不下发 match 事件', async () => {
      const { fetchImpl } = buildRelayFetch({ success: true, cursor: 1, peers: ['peer-a', 'peer-b'] })
      const events: Array<Record<string, unknown>> = []
      const client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: 'https://relay.example/api/gomoku-relay',
        fetchImpl,
        pollIntervalMs: 0,
        onEvent: (event) => events.push(event)
      })
      expect(events.some((event) => event.type === 'match')).toBe(false)
      expect(client.getMatchId()).toBe('')
      expect(events.some((event) => event.type === 'peer_join')).toBe(true)
      await client.close()
    })
  })

  describe('W1 relay 绑定凭证（peer_id 不再单独代表身份）', () => {
    const buildRelayRouter = () =>
      createFetchRouter([
        {
          match: '/join',
          method: 'POST',
          respond: () =>
            jsonResponse({ success: true, cursor: 1, peers: ['peer-a', 'peer-b'], match_id: MATCH_ID })
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

    const bodyOf = (call: { body: unknown }) => (call.body || {}) as Record<string, unknown>

    it('携带凭证时 join/send/poll/leave 全部带上 relay_binding', async () => {
      const router = buildRelayRouter()
      const client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: 'https://relay.example/api/gomoku-relay',
        fetchImpl: router.fetch,
        pollIntervalMs: 0,
        relayBinding: 'grb1.demo.token',
        onEvent: () => {}
      })
      await client.send({ type: 'move', row: 0, col: 0 }, 'peer-b')
      await client.pollOnce()
      await client.close()

      expect(bodyOf(router.callsFor('/join')[0]).relay_binding).toBe('grb1.demo.token')
      expect(bodyOf(router.callsFor('/send')[0]).relay_binding).toBe('grb1.demo.token')
      expect(router.callsFor('/poll')[0].url).toContain('relay_binding=grb1.demo.token')
      expect(bodyOf(router.callsFor('/leave')[0]).relay_binding).toBe('grb1.demo.token')
    })

    it('未提供凭证时请求形状与旧版逐字一致（旧客户端 / 未接入时段）', async () => {
      const router = buildRelayRouter()
      const client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: 'https://relay.example/api/gomoku-relay',
        fetchImpl: router.fetch,
        pollIntervalMs: 0,
        onEvent: () => {}
      })
      await client.send({ type: 'move', row: 0, col: 0 })
      await client.pollOnce()

      expect('relay_binding' in bodyOf(router.callsFor('/join')[0])).toBe(false)
      expect('relay_binding' in bodyOf(router.callsFor('/send')[0])).toBe(false)
      expect(router.callsFor('/poll')[0].url).not.toContain('relay_binding')
    })

    it('setRelayBinding 热更新后立即生效（席位绑定回填路径）', async () => {
      const router = buildRelayRouter()
      const client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: 'https://relay.example/api/gomoku-relay',
        fetchImpl: router.fetch,
        pollIntervalMs: 0,
        onEvent: () => {}
      })
      expect('relay_binding' in bodyOf(router.callsFor('/join')[0])).toBe(false)
      client.setRelayBinding('grb1.late.token')
      await client.send({ type: 'move', row: 0, col: 0 })
      expect(bodyOf(router.callsFor('/send')[0]).relay_binding).toBe('grb1.late.token')
    })

    it('403 RELAY_BINDING_REQUIRED → 触发重绑回调并带新凭证重试一次', async () => {
      const sendBodies: Array<Record<string, unknown>> = []
      let sendAttempts = 0
      const fetchImpl = async (url: string, init: Record<string, unknown> = {}) => {
        const target = String(url)
        if (target.includes('/join')) {
          return jsonResponse({ success: true, cursor: 0, peers: [] })
        }
        if (target.includes('/send')) {
          sendAttempts += 1
          sendBodies.push(JSON.parse(String(init.body || '{}')) as Record<string, unknown>)
          if (sendAttempts === 1) {
            return jsonResponse(
              {
                success: false,
                error: '该 peer 已绑定身份，必须携带 relay 绑定凭证',
                error_code: RELAY_BINDING_REQUIRED_CODE
              },
              403
            )
          }
          return jsonResponse({ success: true })
        }
        return jsonResponse({ success: true })
      }
      let rebinds = 0
      let client: any = null
      client = await createHfRelayGomokuRoom({
        roomCode: 'room-1',
        peerId: 'peer-a',
        baseUrl: 'https://relay.example/api/gomoku-relay',
        fetchImpl,
        pollIntervalMs: 0,
        onBindingRequired: () => {
          rebinds += 1
          client?.setRelayBinding('grb1.fresh.token')
        },
        onEvent: () => {}
      })
      await client.send({ type: 'move', row: 0, col: 0 })

      expect(RELAY_BINDING_REQUIRED_CODE).toBe('RELAY_BINDING_REQUIRED')
      expect(rebinds).toBe(1)
      expect(sendAttempts).toBe(2)
      expect(sendBodies[1].relay_binding).toBe('grb1.fresh.token')
    })
  })

  describe('W1 席位绑定声明与凭证回传（match_trust.js）', () => {
    const transportStub = (overrides: Record<string, unknown> = {}) => ({
      hasSession: () => true,
      claimSeat: vi.fn(async () => ({ seat: 'black', match: { match_id: MATCH_ID } })),
      reportResult: vi.fn(async () => ({ seat: 'black', settled: true, match: {} })),
      fetchStats: vi.fn(async () => ({ stats: {} })),
      ...overrides
    })

    it('席位绑定请求声明 X-Gomoku-Relay-Auth（旧客户端不发该头）', async () => {
      const router = createFetchRouter([
        { match: '/seat', method: 'POST', respond: () => okJson({ seat: 'black', match: {} }) }
      ])
      const transport = createPlatformMatchTransport({
        sessionToken: TOKEN,
        baseUrl: 'https://x.example/api/game-platform/v1',
        fetchImpl: router.fetch
      })
      await transport.claimSeat({ matchId: MATCH_ID, roomCode: 'HBUT1', peerId: 'peer-a' })
      expect(router.calls[0].headers[RELAY_AUTH_HEADER.toLowerCase()]).toBe('1')
      // 声明走 header：body 白名单形状不变（协议字段不变形）。
      expect(Object.keys(router.calls[0].body as Record<string, unknown>).sort()).toEqual([
        'peer_id',
        'protocol_version',
        'room_code'
      ])
    })

    it('席位绑定响应里的 relay_binding 被保存并可交给 relay 房间', async () => {
      const transport = transportStub({
        claimSeat: vi.fn(async () => ({
          seat: 'black',
          match: { match_id: MATCH_ID },
          relay_binding: { token: 'grb1.demo.token', expires_at: 1_700_000_000 }
        }))
      })
      const trust = createGomokuMatchTrust({ transport })
      trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
      await trust.claimSeat({ peerId: 'peer-a' })
      expect(trust.relayBinding()).toBe('grb1.demo.token')
      expect(trust.snapshot().relayBindingExpiresAt).toBe(1_700_000_000)
    })

    it('force 重绑取回新凭证；换场（match_id 变化）时清空旧凭证', async () => {
      let token = 'grb1.old.token'
      const transport = transportStub({
        claimSeat: vi.fn(async () => ({
          seat: 'black',
          match: { match_id: MATCH_ID },
          relay_binding: { token, expires_at: 1 }
        }))
      })
      const trust = createGomokuMatchTrust({ transport })
      trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
      await trust.claimSeat({ peerId: 'peer-a' })
      expect(trust.relayBinding()).toBe('grb1.old.token')

      await trust.claimSeat({ peerId: 'peer-a' })
      expect(transport.claimSeat).toHaveBeenCalledTimes(1)
      token = 'grb1.new.token'
      await trust.claimSeat({ peerId: 'peer-a', force: true })
      expect(transport.claimSeat).toHaveBeenCalledTimes(2)
      expect(trust.relayBinding()).toBe('grb1.new.token')

      trust.rememberMatch({ matchId: 'gm_ffffffffffffffffffffffff' })
      expect(trust.relayBinding()).toBe('')
      expect(trust.snapshot().relayBindingExpiresAt).toBe(0)
    })

    it('extractRelayBinding 只读取非 PII 字段（token / expires_at）', () => {
      expect(extractRelayBinding({ relay_binding: { token: 'grb1.x.1', expires_at: 5 } })).toEqual({
        token: 'grb1.x.1',
        expiresAt: 5
      })
      expect(extractRelayBinding({})).toEqual({ token: '', expiresAt: 0 })
      expect(extractRelayBinding({ relay_binding: { token: 'grb1.y.1' } }).expiresAt).toBe(0)
    })
  })

  it('游戏 id 常量与服务端 registry 一致', () => {
    expect(GOMOKU_GAME_ID).toBe('hbut_gomoku')
  })
})
