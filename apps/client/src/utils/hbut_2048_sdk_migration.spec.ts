import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_2048_ADAPTER } from '../../../../website/modules-src/hbut_2048/project/src/utils/game_sdk_adapter.js'
import {
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hbut_2048/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchRoute } from './_sdk_test_harness'

/**
 * #907a 迁移守卫：2048 湖工大版（hbut_2048）接入 Game SDK。
 *
 * 关键语义（game-registry §4.3）：
 * - `maxLevel = maxTile`（1:1），`extra.maxTile` 保留；
 * - `endedReason = won ? 'win' : 'game_over'` → V2 枚举 `won` / `game_over`；
 * - **只有无步可走才提交**（`game/GameManager.js:177-185`），本次不改动。
 */

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const MAIN = 'website/modules-src/hbut_2048/project/src/main.js'
const GAME_MANAGER = 'website/modules-src/hbut_2048/project/src/game/GameManager.js'
const ADAPTER = 'website/modules-src/hbut_2048/project/src/utils/game_sdk_adapter.js'
const LEGACY_RANK = 'website/modules-src/hbut_2048/project/src/utils/game_rank.js'

const LEGACY_QUERY =
  'student_id=20240066&player_name=方块玩家&class_name=计算机2403&major=计算机&school_name=湖北工业大学&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'

/** 迁移前 handleGameEnd 组装的 payload（main.js:134-142） */
const buildLegacyPayload = (endedReason: string) => ({
  score: 20480,
  maxLevel: 2048,
  durationMs: 183000,
  moveCount: 512,
  endedReason,
  extra: { maxTile: 2048 }
})

const setupEnv = (search: string) => {
  const host = createFakeHostWindow({ search })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('localStorage', host.win.localStorage)
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'test-platform', userAgent: 'test' },
    configurable: true
  })
  return host
}

const init2048 = async (router: ReturnType<typeof createFetchRouter>, search = `?${LEGACY_QUERY}`) => {
  setupEnv(search)
  vi.stubGlobal('fetch', router.fetch)
  const game = await MiniHBUTGame.init({
    gameId: 'hbut_2048',
    adapter: HBUT_2048_ADAPTER,
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
  return game
}

const submitRoute = (): FetchRoute => ({
  match: '/submit',
  method: 'POST',
  respond: () => okJson({ success: true, my_rank: { rank: 5, score: 20480 } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('hbut_2048 接入形态（静态守卫）', () => {
  it('main.js 通过相对路径 import SDK 与 adapter，且不再使用旧 game_rank 工具', () => {
    const source = read(MAIN)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).not.toContain('createRunId(')
  })

  it('旧 game_rank.js 仍保留（回滚路径 + 只读契约测试依赖）', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'hbut_2048'")
    expect(source).toContain('export const submitGameRank')
    expect(source).toContain('export const fetchGameLeaderboard')
    // adapter 文件真实存在且用 createGameAdapter 声明
    expect(read(ADAPTER)).toContain('createGameAdapter({')
  })

  it('提交数值语义逐字保留：score / maxTile / durationMs / moveCount / win|game_over / extra.maxTile', () => {
    const source = read(MAIN)
    expect(source).toContain('score: result.score')
    expect(source).toContain('maxLevel: result.maxTile')
    expect(source).toContain('durationMs: result.durationMs')
    expect(source).toContain('moveCount: result.moveCount')
    expect(source).toContain("endedReason: result.won ? 'win' : 'game_over'")
    expect(source).toContain('extra: { maxTile: result.maxTile }')
  })

  it('run 生命周期：加载即开局 + 新游戏 replaceActive；重试复用 SDK pending payload', () => {
    const source = read(MAIN)
    expect(source).toContain('let run = sdkGame.startRun()')
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
    expect(source).toContain('await run.finish(payload)')
    expect(source).toContain('await run.retry()')
    expect(source).toContain('if (!rankEnabled) return')
  })

  it('只有无步可走才提交（GameManager 判定未被改动）', () => {
    const source = read(GAME_MANAGER)
    expect(source).toContain('if (!this.movesAvailable()) {')
    expect(source).toContain('this.over = true')
    expect(source).toContain('this.onGameEnd({')
  })

  it('保留排行榜错误文本的 textContent 写入（CodeQL xss-through-exception 门禁）', () => {
    const source = read(MAIN)
    expect(source).not.toContain('<div class="leaderboard-error">加载失败: ${')
    expect(source).toContain("content.innerHTML = '<div class=\"leaderboard-error\"></div>'")
    expect(source).toContain('errorBox.textContent')
  })

  it('不把学号 / 奖励数量写进任何请求体', () => {
    const source = read(MAIN)
    expect(source).not.toMatch(/student_id\s*:/)
    expect(source).not.toMatch(/xp_amount|coin_amount|reward_amount/)
  })
})

describe('hbut_2048 adapter 语义（game-registry §3/§4.3）', () => {
  it('metric / capabilities / ended_reason 映射与 registry 一致', () => {
    expect(HBUT_2048_ADAPTER.gameId).toBe('hbut_2048')
    expect(HBUT_2048_ADAPTER.metric).toMatchObject({ name: 'max_tile', semantics: 'value', max: 131072 })
    expect(HBUT_2048_ADAPTER.capabilities.legacyCompatible).toBe(true)
    expect(HBUT_2048_ADAPTER.endedReasonMap).toEqual({ win: 'won', game_over: 'game_over' })
    expect(HBUT_2048_ADAPTER.extraKeys).toEqual(['maxTile'])
  })

  it('metric 1:1：maxTile 2048 → metric.value 2048 → Legacy max_level 2048', () => {
    const built = HBUT_2048_ADAPTER.buildResult({ score: 20480, maxLevel: 2048, extra: { maxTile: 2048 } })
    expect(built.result.metric).toEqual({ name: 'max_tile', value: 2048 })
    expect(built.result.extra).toEqual({ maxTile: 2048 })
    expect(HBUT_2048_ADAPTER.toLegacyPayload(built)).toMatchObject({ max_level: 2048, payload: { maxTile: 2048 } })
  })

  it('ended_reason：win → won、game_over → game_over；未知值 → unknown（不拒绝）', () => {
    expect(HBUT_2048_ADAPTER.normalizeEndedReason('win')).toEqual({ reason: 'won', mapped: true, raw: 'win' })
    expect(HBUT_2048_ADAPTER.normalizeEndedReason('game_over').reason).toBe('game_over')
    expect(HBUT_2048_ADAPTER.normalizeEndedReason('忽然断电').reason).toBe('unknown')
  })

  it('extra 白名单：maxTile 保留，未声明键被丢弃', () => {
    const built = HBUT_2048_ADAPTER.buildResult({ score: 10, maxLevel: 4, extra: { maxTile: 4, cheat: 1 } })
    expect(built.result.extra).toEqual({ maxTile: 4 })
    expect(built.diagnostics.droppedExtraKeys).toEqual(['cheat'])
  })
})

describe('hbut_2048 提交（compatibility 通道）', () => {
  it('game_over 局：SDK body 与迁移前 submitGameRank body 逐字段一致', async () => {
    const router = createFetchRouter([submitRoute()])
    const game = await init2048(router)
    expect(game.mode).toBe('compatibility')

    const payload = buildLegacyPayload('game_over')
    const run = game.startRun({ runId: 'run_2048_equivalence_over', startedAt: 1700000000000 })
    const outcome = await run.finish(payload)
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    await submitGameRank(readGameModuleContext(), { runId: 'run_2048_equivalence_over', ...payload })

    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))
    expect(router.callsFor('/submit')[0].body).toEqual(legacyBody)
    game.dispose()
  })

  it('win 局：与迁移前逐字段完全等价（ended_reason 存原值 win）', async () => {
    const router = createFetchRouter([submitRoute()])
    const game = await init2048(router)
    const payload = buildLegacyPayload('win')
    const run = game.startRun({ runId: 'run_2048_equivalence_win', startedAt: 1700000000000 })
    await run.finish(payload)

    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    await submitGameRank(readGameModuleContext(), { runId: 'run_2048_equivalence_win', ...payload })
    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body)) as Record<string, unknown>
    const sdkBody = router.callsFor('/submit')[0].body as Record<string, unknown>

    // #937 修复后：经典榜存**未归一化**的原值（归一化只属 V2 语义）
    expect(legacyBody.ended_reason).toBe('win')
    expect(sdkBody.ended_reason).toBe('win')
    for (const key of Object.keys(legacyBody)) {
      expect(sdkBody[key], `字段 ${key} 应保持等价`).toEqual(legacyBody[key])
    }
    expect(sdkBody).toMatchObject({
      game_id: 'hbut_2048',
      run_id: 'run_2048_equivalence_win',
      score: 20480,
      max_level: 2048,
      move_count: 512,
      duration_ms: 183000,
      payload: { maxTile: 2048 }
    })
    game.dispose()
  })

  it('同一 run 重复 finish（2048 一局一次）→ 只发一次请求；重开一局才生成新 run_id', async () => {
    const router = createFetchRouter([submitRoute()])
    const game = await init2048(router)
    const payload = buildLegacyPayload('game_over')
    const run = game.startRun()
    const first = await run.finish(payload)
    const second = await run.finish(payload)
    expect(first.success).toBe(true)
    expect(second.duplicate).toBe(true)
    expect(router.callsFor('/submit')).toHaveLength(1)

    const next = game.startRun({ replaceActive: true })
    expect(next.id).not.toBe(run.id)
    await next.finish(payload)
    expect(router.callsFor('/submit')).toHaveLength(2)
    game.dispose()
  })

  it('可重试失败 → 保留 pending，run.retry() 复用字节级一致的 body', async () => {
    let attempt = 0
    const router = createFetchRouter([
      {
        match: '/submit',
        method: 'POST',
        respond: () => {
          attempt += 1
          return attempt <= 2
            ? new Response(JSON.stringify({ success: false, error: 'busy' }), { status: 503 })
            : okJson({ success: true })
        }
      }
    ])
    const game = await init2048(router)
    const run = game.startRun()
    vi.useFakeTimers()
    const pending = run.finish(buildLegacyPayload('game_over'))
    await vi.advanceTimersByTimeAsync(5000)
    const outcome = await pending
    expect(outcome.success).toBe(true)
    const bodies = router.callsFor('/submit').map((call) => JSON.stringify(call.body))
    expect(bodies.length).toBeGreaterThan(1)
    expect(new Set(bodies).size).toBe(1)
    game.dispose()
  })

  it('榜单走 SDK：条目归一 + my_rank 仍可展示', async () => {
    const router = createFetchRouter([
      {
        match: '/leaderboard',
        method: 'GET',
        respond: () =>
          okJson({
            leaderboard: [
              { rank: 1, player_name: '张三', score: 30000, class_name: '计算机2403', student_id: '20240066' },
              { rank: 2, player_name: '李四', score: 20000, class_name: '计算机2403' }
            ],
            my_rank: { rank: 5, score: 20480 }
          })
      }
    ])
    const game = await init2048(router)
    const result = await game.leaderboard({ scope: 'class', limit: 20 })
    expect(result.success).toBe(true)
    expect(result.entries[0]).toMatchObject({ rank: 1, display_name: '张三', score: 30000 })
    expect(JSON.stringify(result.entries)).not.toContain('20240066')
    expect((result.raw as Record<string, unknown>).my_rank).toMatchObject({ rank: 5 })
    game.dispose()
  })
})
