import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import * as clumsyBirdHbut from '../../../../website/modules-src/clumsy_bird_hbut/project/src/utils/game_rank.js'
import * as hbut2048 from '../../../../website/modules-src/hbut_2048/project/src/utils/game_rank.js'
import * as hbutMatch3 from '../../../../website/modules-src/hbut_match3/project/src/utils/game_rank.js'
import * as hbutMemoryMatch from '../../../../website/modules-src/hbut_memory_match/project/src/utils/game_rank.js'
import * as hbutMiner from '../../../../website/modules-src/hbut_miner/project/src/utils/game_rank.js'
import * as hbutMonopoly from '../../../../website/modules-src/hbut_monopoly/project/src/utils/game_rank.js'
import * as hbutParking from '../../../../website/modules-src/hbut_parking/project/src/utils/game_rank.js'
import * as hbutStack from '../../../../website/modules-src/hbut_stack/project/src/utils/game_rank.js'
import * as hechengHugongda from '../../../../website/modules-src/hecheng_hugongda/project/src/utils/game_rank.js'
import * as jumpOutHbut from '../../../../website/modules-src/jump_out_hbut/project/src/utils/game_rank.js'
import { CLUMSY_BIRD_ADAPTER } from '../../../../website/modules-src/clumsy_bird_hbut/project/src/utils/game_sdk_adapter.js'
import { HBUT_2048_ADAPTER } from '../../../../website/modules-src/hbut_2048/project/src/utils/game_sdk_adapter.js'
import { HBUT_MATCH3_ADAPTER } from '../../../../website/modules-src/hbut_match3/project/src/utils/game_sdk_adapter.js'
import { HBUT_MEMORY_MATCH_ADAPTER } from '../../../../website/modules-src/hbut_memory_match/project/src/utils/game_sdk_adapter.js'
import { HBUT_MINER_ADAPTER } from '../../../../website/modules-src/hbut_miner/project/src/utils/game_sdk_adapter.js'
import { HBUT_MONOPOLY_ADAPTER } from '../../../../website/modules-src/hbut_monopoly/project/src/utils/game_sdk_adapter.js'
import { HBUT_PARKING_ADAPTER } from '../../../../website/modules-src/hbut_parking/project/src/utils/game_sdk_adapter.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { HECHENG_HUGONGDA_ADAPTER } from '../../../../website/modules-src/hecheng_hugongda/project/src/utils/game_sdk_adapter.js'
import { JUMP_OUT_HBUT_ADAPTER } from '../../../../website/modules-src/jump_out_hbut/project/src/utils/game_sdk_adapter.js'
import { createFetchRouter } from './_sdk_test_harness'

/**
 * P1-5 收口端到端证明（W4）：
 *
 * 背景：9/10 个 `game_rank.js` 曾硬编码测试域默认值，网页直开模块（有身份、无 `rank_api`）
 * 会回落到该域 → 把成绩写进测试库；测试库当机时表现为「排行榜不可用」。
 *
 * 收口后：
 * - Legacy/回滚路径（`utils/game_rank.js`）：无 `rank_api` = **未配置**（base 为空串）→
 *   `canUseGameRank` 为 false，submit / leaderboard 明确拒绝且**零远程请求**，成绩只留本地；
 * - SDK 主入口：无 `rank_api` / ticket → **standalone**（零远程请求），本文件按 10 个游戏逐一验证；
 * - 源码护栏：9 个 `game_rank.js` 与 `.d.ts` 不再出现测试域字面量与默认域常量。
 */

type RankContext = { gameId: string; rankApiBase?: string; [key: string]: unknown }
type RankPayload = { runId: string; score: number; [key: string]: unknown }

interface RankModuleApi {
  readGameModuleContext: () => RankContext
  canUseGameRank: (context: RankContext) => boolean
  submitGameRank: (
    context: RankContext,
    payload?: RankPayload,
    options?: Record<string, unknown>
  ) => Promise<unknown>
  fetchGameLeaderboard: (context: RankContext, options?: Record<string, unknown>) => Promise<unknown>
  resolveRankApiBase: (value: unknown) => string
}

interface RankModuleCase {
  gameId: string
  /** 相对仓库根的源码路径前缀（不含扩展名） */
  sourcePath: string
  /** 模块私有上下文存储键（hecheng 使用历史共享键） */
  storageKey: string
  api: RankModuleApi
}

/** 仓库根（apps/client 的上两级） */
const REPO_ROOT = resolve(process.cwd(), '../..')

const MODULES: RankModuleCase[] = [
  {
    gameId: 'clumsy_bird_hbut',
    sourcePath: 'website/modules-src/clumsy_bird_hbut/project/src/utils/game_rank',
    storageKey: 'clumsy_bird_hbut_rank_context_v1',
    api: clumsyBirdHbut
  },
  {
    gameId: 'hbut_2048',
    sourcePath: 'website/modules-src/hbut_2048/project/src/utils/game_rank',
    storageKey: 'hbut_2048_rank_context_v1',
    api: hbut2048
  },
  {
    gameId: 'hbut_match3',
    sourcePath: 'website/modules-src/hbut_match3/project/src/utils/game_rank',
    storageKey: 'hbut_match3_rank_context_v1',
    api: hbutMatch3
  },
  {
    gameId: 'hbut_memory_match',
    sourcePath: 'website/modules-src/hbut_memory_match/project/src/utils/game_rank',
    storageKey: 'hbut_memory_match_rank_context_v1',
    api: hbutMemoryMatch
  },
  {
    gameId: 'hbut_miner',
    sourcePath: 'website/modules-src/hbut_miner/project/src/utils/game_rank',
    storageKey: 'hbut_miner_rank_context_v1',
    api: hbutMiner
  },
  {
    gameId: 'hbut_monopoly',
    sourcePath: 'website/modules-src/hbut_monopoly/project/src/utils/game_rank',
    storageKey: 'hbut_monopoly_rank_context_v1',
    api: hbutMonopoly
  },
  {
    gameId: 'hbut_parking',
    sourcePath: 'website/modules-src/hbut_parking/project/src/utils/game_rank',
    storageKey: 'hbut_parking_rank_context_v1',
    api: hbutParking
  },
  {
    gameId: 'hbut_stack',
    sourcePath: 'website/modules-src/hbut_stack/project/src/utils/game_rank',
    storageKey: 'hbut_stack_rank_context_v1',
    api: hbutStack
  },
  {
    gameId: 'hecheng_hugongda',
    sourcePath: 'website/modules-src/hecheng_hugongda/project/src/utils/game_rank',
    storageKey: 'hbut_game_rank_context_v1',
    api: hechengHugongda
  }
]

/** 网页直开模块形态：有身份，但没有任何 API 决策（无 rank_api / gp_api / ticket） */
const DIRECT_OPEN_QUERY = 'student_id=20240111&player_name=直开玩家&class_name=机械2401'
const INJECTED_BASE = 'https://rank.example/api/game-rank'

const SDK_RESULT_INPUT = { score: 650, maxLevel: 5, durationMs: 20000, moveCount: 5, endedReason: 'lost' }
/** memory_match / monopoly 的 adapter 声明了 extra 白名单，需带业务键才是合法结果（形状取自各自 migration 测试） */
const SDK_MEMORY_MATCH_INPUT = {
  score: 1280,
  maxLevel: 4,
  durationMs: 61000,
  moveCount: 23,
  endedReason: 'won',
  extra: { mistakes: 5, levelIndex: 3, combo: 4 }
}
const SDK_MONOPOLY_INPUT = {
  score: 1900,
  maxLevel: 1,
  durationMs: 5000,
  moveCount: 12,
  endedReason: 'lost',
  extra: { credits: 5, influence: 2, coins: 0, energy: 10, stress: 3, stage: '创业起步', stageIndex: 0 }
}

const SDK_MODULES = [
  { gameId: 'clumsy_bird_hbut', adapter: CLUMSY_BIRD_ADAPTER, input: SDK_RESULT_INPUT },
  { gameId: 'hbut_2048', adapter: HBUT_2048_ADAPTER, input: SDK_RESULT_INPUT },
  { gameId: 'hbut_match3', adapter: HBUT_MATCH3_ADAPTER, input: SDK_RESULT_INPUT },
  { gameId: 'hbut_memory_match', adapter: HBUT_MEMORY_MATCH_ADAPTER, input: SDK_MEMORY_MATCH_INPUT },
  { gameId: 'hbut_miner', adapter: HBUT_MINER_ADAPTER, input: SDK_RESULT_INPUT },
  { gameId: 'hbut_monopoly', adapter: HBUT_MONOPOLY_ADAPTER, input: SDK_MONOPOLY_INPUT },
  { gameId: 'hbut_parking', adapter: HBUT_PARKING_ADAPTER, input: SDK_RESULT_INPUT },
  { gameId: 'hbut_stack', adapter: HBUT_STACK_ADAPTER, input: SDK_RESULT_INPUT },
  { gameId: 'hecheng_hugongda', adapter: HECHENG_HUGONGDA_ADAPTER, input: SDK_RESULT_INPUT },
  { gameId: 'jump_out_hbut', adapter: JUMP_OUT_HBUT_ADAPTER, input: SDK_RESULT_INPUT }
] as const

const setSearch = (search = '') => {
  vi.stubGlobal('window', {
    location: { search },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  })
}

const createStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear()
  }
}

describe('P1-5 网页直开（无 rank_api 注入）→ 未配置，零远程请求', () => {
  beforeEach(() => {
    // @ts-expect-error 测试用内存存储
    globalThis.localStorage = createStorage()
    Object.defineProperty(globalThis, 'navigator', { value: { platform: 'test' }, configurable: true })
    setSearch('')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(MODULES)('$gameId：判定未配置，submit / leaderboard 都不发请求', async ({ api, storageKey }) => {
    setSearch(`?${DIRECT_OPEN_QUERY}`)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const context = api.readGameModuleContext()
    expect(context.rankApiBase).toBe('')
    expect(api.canUseGameRank(context)).toBe(false)

    await expect(api.submitGameRank(context, { runId: 'run_standalone_1', score: 100 })).rejects.toThrow(
      /未注入 rank_api/
    )
    await expect(api.fetchGameLeaderboard(context, { scope: 'class' })).rejects.toThrow(/未注入 rank_api/)
    expect(fetchMock).not.toHaveBeenCalled()

    // writeStoredContext 落盘也不得写入任何隐式远程目标（否则下次访问会继承）
    const stored = JSON.parse(String(localStorage.getItem(storageKey))) as Record<string, unknown>
    expect(stored.rankApiBase).toBe('')
    expect(JSON.stringify(stored)).not.toContain('testocr1')
  })

  it.each(MODULES)('$gameId：空 / 空白 / null 注入一律视为未配置', ({ api }) => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(api.resolveRankApiBase(empty)).toBe('')
    }
    // 显式注入仍按既有规则归一（只补协议与 /api/game-rank 后缀）
    expect(api.resolveRankApiBase('rank.example/api/game-rank')).toBe(INJECTED_BASE)
  })
})

describe('P1-5 对照：显式注入 rank_api 时既有能力不变', () => {
  beforeEach(() => {
    // @ts-expect-error 测试用内存存储
    globalThis.localStorage = createStorage()
    Object.defineProperty(globalThis, 'navigator', { value: { platform: 'test' }, configurable: true })
    setSearch('')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('hbut_2048：按注入域提交，绝不回落任何默认域', async () => {
    setSearch(`?student_id=20240003&player_name=2048玩家&class_name=自动化2401&rank_api=${INJECTED_BASE}`)
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const context = hbut2048.readGameModuleContext()
    expect(context.rankApiBase).toBe(INJECTED_BASE)
    expect(hbut2048.canUseGameRank(context)).toBe(true)
    await hbut2048.submitGameRank(context, { runId: 'run_injected_1', score: 4096 })
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${INJECTED_BASE}/submit`)
  })

  it('hbut_stack：已落盘的显式 base 仍是合法来源（对齐 SDK sources.legacy=stored）', async () => {
    localStorage.setItem(
      'hbut_stack_rank_context_v1',
      JSON.stringify({ studentId: '20240111', rankApiBase: INJECTED_BASE })
    )
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const context = hbutStack.readGameModuleContext()
    expect(hbutStack.canUseGameRank(context)).toBe(true)
    await hbutStack.submitGameRank(context, { runId: 'run_stored_1', score: 10 })
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${INJECTED_BASE}/submit`)
  })
})

describe('P1-5 源码护栏：模块内不得再有测试域字面量或默认域常量', () => {
  it.each(MODULES)('$gameId 的 game_rank.js 与 .d.ts 干净', ({ sourcePath }) => {
    for (const rel of [`${sourcePath}.js`, `${sourcePath}.d.ts`]) {
      const source = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
      expect(source, `${rel} 不得硬编码测试域`).not.toContain('testocr1')
      expect(source, `${rel} 不得再有隐式默认域常量`).not.toContain('DEFAULT_GAME_RANK_API')
    }
  })

  it('jump_out_hbut（异构旧协议）同样干净 —— 它本来就没有默认域', () => {
    for (const rel of [
      'website/modules-src/jump_out_hbut/project/src/utils/game_rank.js',
      'website/modules-src/jump_out_hbut/project/src/utils/game_rank.d.ts'
    ]) {
      const source = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
      expect(source, `${rel} 不得硬编码测试域`).not.toContain('testocr1')
      expect(source, `${rel} 不得有隐式默认域常量`).not.toContain('DEFAULT_GAME_RANK_API')
    }
  })
})

describe('P1-5 SDK 端到端：10 个游戏无 rank_api → standalone 且全程零请求', () => {
  beforeEach(() => {
    // @ts-expect-error 测试用内存存储
    globalThis.localStorage = createStorage()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(SDK_MODULES)(
    '$gameId：finish 本地成功、leaderboard 无来源、零 fetch',
    async ({ gameId, adapter, input }) => {
      const router = createFetchRouter([])
      vi.stubGlobal('fetch', router.fetch)

      const game = await MiniHBUTGame.init({
        gameId,
        adapter,
        params: new URLSearchParams(DIRECT_OPEN_QUERY),
        timeouts: { welcome: 5 }
      })
      expect(game.mode).toBe('standalone')
      expect(game.capabilities).toMatchObject({ canSubmit: false, canSubmitLegacy: false })

      const run = game.startRun()
      const outcome = await run.finish(input)
      expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })
      expect((await game.leaderboard({ scope: 'class' })).source).toBe('none')
      // P1-5 核心断言：既不发 V2（/meta、/sessions、/runs、/finish），也不发 Legacy（/submit）
      expect(router.calls).toHaveLength(0)
      game.dispose()
    }
  )
})

describe('jump_out_hbut 异构旧协议（本就没有默认域，确认 fail closed 语义一致）', () => {
  beforeEach(() => {
    // @ts-expect-error 测试用内存存储
    globalThis.localStorage = createStorage()
    setSearch('?student_id=20240104&player_name=跳跃玩家')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('无 rank_api → submit / leaderboard 返回 no_api，零远程请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      jumpOutHbut.submitGameRank({ run_id: 'run_jump_1', score: 100, max_level: 3, duration_ms: 1000, move_count: 5 })
    ).resolves.toMatchObject({ success: false, error: 'no_api' })
    await expect(jumpOutHbut.fetchGameLeaderboard({ scope: 'class' })).resolves.toMatchObject({
      success: false,
      error: 'no_api'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
