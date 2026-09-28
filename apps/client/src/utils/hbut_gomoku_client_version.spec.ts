import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildResultClaimBody,
  createGomokuMatchTrustFromHost,
  createPlatformMatchTransport
} from '../../../../website/modules-src/hbut_gomoku/project/src/game/match_trust.js'
import { createFetchRouter, okJson } from './_sdk_test_harness'

/**
 * P1-A（复验修复）：五子棋必须把宿主注入的版本串**真的发出去**。
 *
 * 复验实测事实：`main.js` 调用 `createGomokuMatchTrustFromHost({ baseUrl, gameId, onUpdate })`
 * 不传 `clientVersion` → `match_trust.js` 默认 `''` → `X-Client-Version` 永不发送、
 * result body 只有 `claimed_outcome` → 服务端灰度 deny 名单在生产**永远匹配不到**。
 *
 * 本文件全部用**真实源码**驱动：
 * 1. `resolveModuleClientVersion`（宿主 URL 参数解析）：`app_version` 优先，`client_version` 等价别名；
 * 2. 端到端：解析出的版本经 `createGomokuMatchTrustFromHost` → 席位绑定请求头
 *    `X-Client-Version` + 请求体 `client_version`；结果上报 body 也带 `client_version`（additive 回退）；
 * 3. 缺版本时请求形状与旧版**逐字一致**（不注入空值，不回落本地历史值）；
 * 4. 接线护栏：`main.js` 把宿主注入的版本传给组合入口。
 *
 * 写法说明（与 `hbut_gomoku_relay_rebind_contract.spec.ts` 同一范式）：`resolveModuleClientVersion`
 * 与 `client_version` 字段是本次新增，静态 import 会让修复前的测试文件加载失败；因此对新符号用
 * 动态 import + 存在性断言，新字段用「修复前必然为假」的断言表达 —— 修复前测试文件仍能加载并
 * 逐条断言失败，而不是整文件报错。
 */

const MATCH_ID = 'gm_0123456789abcdef01234567'
const TICKET = 'gpt_abcdefghijklmnopqrstuvwx'
const TOKEN = 'gs_' + 'a'.repeat(32)
const CLIENT_VERSION = '1.4.11'

type ResolveModuleClientVersion = (params: unknown) => string

/** 动态取新增导出（修复前不存在 → 断言失败而不是加载失败） */
const requireResolveModuleClientVersion = async (): Promise<ResolveModuleClientVersion> => {
  let mod: Record<string, unknown> | null = null
  try {
    mod = (await import(
      '../../../../website/modules-src/hbut_gomoku/project/src/game/match_trust.js'
    )) as unknown as Record<string, unknown>
  } catch {
    mod = null
  }
  const fn = mod?.resolveModuleClientVersion as ResolveModuleClientVersion | undefined
  expect(typeof fn, 'resolveModuleClientVersion 必须是可用的真实函数（P1-A）').toBe('function')
  return fn!
}

const sessionRoute = () => ({
  match: '/sessions',
  method: 'POST',
  respond: () => okJson({ session_id: 'sid_0123456789abcdef', session_token: TOKEN, expires_at: '' })
})

const seatRoute = () => ({
  match: '/seat',
  method: 'POST',
  respond: () => okJson({ seat: 'black', match: { match_id: MATCH_ID } })
})

const resultRoute = () => ({
  match: '/result',
  method: 'POST',
  respond: () =>
    okJson({
      settled: true,
      seat: 'black',
      match: { match_id: MATCH_ID, status: 'finalized', result: 'black_win', server_verified: true },
      claim: { claimed: 'win', authoritative: 'win', matched: true }
    })
})

const bodyOf = (call: { body: unknown }) => (call.body || {}) as Record<string, unknown>

describe('P1-A 五子棋：版本串真实上线（请求头 + 结果体）', () => {
  it('宿主 URL 的 app_version → 席位绑定请求带 X-Client-Version 与 client_version', async () => {
    const resolveModuleClientVersion = await requireResolveModuleClientVersion()
    const params = new URLSearchParams(`gpt=${TICKET}&app_version=${CLIENT_VERSION}`)
    // 真实解析链：与 main.js 的 resolveHostClientVersion 同源
    expect(resolveModuleClientVersion(params)).toBe(CLIENT_VERSION)

    const router = createFetchRouter([sessionRoute(), seatRoute()])
    const bootstrapped = await createGomokuMatchTrustFromHost({
      params,
      fetchImpl: router.fetch,
      clientVersion: resolveModuleClientVersion(params)
    })
    expect(bootstrapped.enabled).toBe(true)
    bootstrapped.trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
    await bootstrapped.trust.claimSeat({ peerId: 'peer-a' })

    const seat = router.callsFor('/seat')[0]
    expect(seat).toBeTruthy()
    // 原样请求头：服务端 deny 名单的匹配依据
    expect(seat.headers['x-client-version']).toBe(CLIENT_VERSION)
    // body 回退位（只有非空才出现）
    expect(seat.body).toEqual({
      protocol_version: 1,
      room_code: 'HBUT1',
      peer_id: 'peer-a',
      client_version: CLIENT_VERSION
    })
    expect(seat.headers['x-game-platform-protocol']).toBe('1')
  })

  it('结果上报 body 也带 client_version（服务端头优先、body 回退；additive 不删既有字段）', async () => {
    const params = new URLSearchParams(`gpt=${TICKET}&app_version=${CLIENT_VERSION}`)
    const router = createFetchRouter([sessionRoute(), resultRoute()])
    const bootstrapped = await createGomokuMatchTrustFromHost({
      params,
      fetchImpl: router.fetch,
      clientVersion: CLIENT_VERSION
    })
    bootstrapped.trust.rememberMatch({ matchId: MATCH_ID })
    const payload = await bootstrapped.trust.reportResult({ claimedOutcome: 'win' })
    expect(payload?.settled).toBe(true)

    const result = router.callsFor('/result')[0]
    expect(result.headers['x-client-version']).toBe(CLIENT_VERSION)
    expect(result.body).toEqual({
      protocol_version: 1,
      claimed_outcome: 'win',
      client_version: CLIENT_VERSION
    })
    // 冻结字段仍在（additive：protocol_version + claimed_outcome 一个都不少）
    expect(bodyOf(result)).toMatchObject({ protocol_version: 1, claimed_outcome: 'win' })
  })

  it('宿主未注入版本 → 不发送任何版本字段（请求形状与旧版逐字一致，绝不注入空值）', async () => {
    const params = new URLSearchParams(`gpt=${TICKET}`)

    const router = createFetchRouter([sessionRoute(), seatRoute(), resultRoute()])
    const bootstrapped = await createGomokuMatchTrustFromHost({
      params,
      fetchImpl: router.fetch,
      clientVersion: ''
    })
    bootstrapped.trust.rememberMatch({ matchId: MATCH_ID, roomCode: 'HBUT1' })
    await bootstrapped.trust.claimSeat({ peerId: 'peer-a' })
    await bootstrapped.trust.reportResult({ claimedOutcome: 'win' })

    const seat = router.callsFor('/seat')[0]
    expect('x-client-version' in seat.headers).toBe(false)
    expect('client_version' in bodyOf(seat)).toBe(false)
    const result = router.callsFor('/result')[0]
    expect('x-client-version' in result.headers).toBe(false)
    expect('client_version' in bodyOf(result)).toBe(false)
    // 结果体冻结形状：未传版本时仍然是 { protocol_version, claimed_outcome }
    expect(buildResultClaimBody({ claimedOutcome: 'win' })).toEqual({
      protocol_version: 1,
      claimed_outcome: 'win'
    })
  })

  it('传输层：显式 clientVersion 时头与体同时带上（头优先、体回退）', async () => {
    const router = createFetchRouter([seatRoute(), resultRoute()])
    const transport = createPlatformMatchTransport({
      sessionToken: TOKEN,
      baseUrl: 'https://x.example/api/game-platform/v1',
      fetchImpl: router.fetch,
      clientVersion: CLIENT_VERSION
    })
    await transport.claimSeat({ matchId: MATCH_ID, roomCode: 'HBUT1', peerId: 'peer-a' })
    await transport.reportResult({ matchId: MATCH_ID, claimedOutcome: 'win' })
    expect(router.callsFor('/seat')[0].headers['x-client-version']).toBe(CLIENT_VERSION)
    expect(router.callsFor('/result')[0].headers['x-client-version']).toBe(CLIENT_VERSION)
    expect(bodyOf(router.callsFor('/result')[0]).client_version).toBe(CLIENT_VERSION)
  })

  it('版本解析：app_version 优先、client_version 为等价别名；非法 / 缺失 → 空串', async () => {
    const resolveModuleClientVersion = await requireResolveModuleClientVersion()
    expect(resolveModuleClientVersion(new URLSearchParams('app_version=1.4.11&client_version=9.9.9'))).toBe('1.4.11')
    expect(resolveModuleClientVersion(new URLSearchParams('client_version=1.4.12'))).toBe('1.4.12')
    for (const bad of ['', '   ', 'v 1.4', 'a'.repeat(65), '<script>']) {
      expect(resolveModuleClientVersion(new URLSearchParams(`app_version=${encodeURIComponent(bad)}`))).toBe('')
    }
    // 兼容注入任意可 get 的参数对象（main.js 走 URLSearchParams；测试/宿主替身可自建）
    expect(resolveModuleClientVersion({ get: (key: string) => (key === 'app_version' ? '1.4.11' : null) })).toBe('1.4.11')
    expect(resolveModuleClientVersion(undefined)).toBe('')
  })

  it('接线护栏：main.js 把宿主注入的版本传给 createGomokuMatchTrustFromHost', () => {
    const src = readFileSync(
      resolve(process.cwd(), '../../website/modules-src/hbut_gomoku/project/src/main.js'),
      'utf8'
    )
    expect(src).toContain('resolveModuleClientVersion')
    expect(src).toContain('clientVersion: resolveHostClientVersion()')
    expect(src).toContain('resolveModuleClientVersion(new URLSearchParams(window.location.search')
  })
})
