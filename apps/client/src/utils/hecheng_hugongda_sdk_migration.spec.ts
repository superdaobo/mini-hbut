import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import {
  HECHENG_HUGONGDA_ADAPTER,
  HECHENG_HUGONGDA_STORAGE_KEYS
} from '../../../../website/modules-src/hecheng_hugongda/project/src/utils/game_sdk_adapter.js'
import {
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hecheng_hugongda/project/src/utils/game_rank.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'
import type { FetchRoute } from './_sdk_test_harness'

/**
 * #907a 迁移守卫：合成湖工大（hecheng_hugongda）接入 Game SDK。
 *
 * 覆盖三件事：
 * 1. 接入形态（adapter 声明 + App.vue 三处调用替换，旧 game_rank.js 保留作回滚路径）；
 * 2. **提交字段逐字等价**（SDK 经典榜 body 与迁移前 submitGameRank body 完全一致，含 extra）；
 * 3. 值域/白名单/幂等（metric=9 上限、extraKeys 白名单、同 run 只提交一次、storage key 不再串味）。
 */

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const APP = 'website/modules-src/hecheng_hugongda/project/src/App.vue'
const ADAPTER = 'website/modules-src/hecheng_hugongda/project/src/utils/game_sdk_adapter.js'
const LEGACY_RANK = 'website/modules-src/hecheng_hugongda/project/src/utils/game_rank.js'

const LEGACY_QUERY =
  'student_id=20240088&player_name=合成玩家&class_name=软件2401&major=软件工程&school_name=湖北工业大学&runtime=module-web&app_version=1.4.11&from=more&rank_api=https://rank.example/api/game-rank'

/** 迁移前 payload 的原始形态（逐字来自 App.vue:1093-1107 buildRankPayload） */
const LEGACY_PAYLOAD = {
  score: 1280,
  maxLevel: 9,
  durationMs: 61000,
  moveCount: 42,
  endedReason: 'cleared',
  extra: {
    source: 'mini-hbut-module',
    is_mobile: true,
    from: 'more',
    runtime: 'module-web'
  }
}

const submitRoute = (): FetchRoute => ({
  match: '/submit',
  method: 'POST',
  respond: () => okJson({ success: true, player: { class_rank: 3, school_rank: 12 } })
})

const setupLegacyEnv = (search: string) => {
  const host = createFakeHostWindow({ search })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('localStorage', host.win.localStorage)
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'test-platform', userAgent: 'test' },
    configurable: true
  })
  return host
}

const createLegacyGame = async (router: ReturnType<typeof createFetchRouter>, search = `?${LEGACY_QUERY}`) => {
  const host = setupLegacyEnv(search)
  vi.stubGlobal('fetch', router.fetch)
  const game = await MiniHBUTGame.init({
    gameId: 'hecheng_hugongda',
    adapter: HECHENG_HUGONGDA_ADAPTER,
    legacy: { storageKeys: HECHENG_HUGONGDA_STORAGE_KEYS },
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
  return { game, host }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('hecheng_hugongda 接入形态（静态守卫）', () => {
  it('App.vue 通过相对路径 import SDK 与 adapter，且不再使用旧 game_rank 工具', () => {
    const source = read(APP)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
    expect(source).not.toContain('createRunId(')
  })

  it('旧 game_rank.js 仍保留（回滚路径 + 只读契约测试依赖）', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'hecheng_hugongda'")
    expect(source).toContain('export const submitGameRank')
    expect(source).toContain('export const fetchGameLeaderboard')
    // adapter 文件真实存在且用 createGameAdapter 声明
    expect(read(ADAPTER)).toContain('createGameAdapter({')
  })

  it('玩法数值语义逐字保留：computeCurrentMaxLevel / moveCount / durationMs / extra 四键', () => {
    const source = read(APP)
    expect(source).toContain('maxLevel: this.computeCurrentMaxLevel()')
    expect(source).toContain('durationMs: Math.max(0, Date.now() - Number(this.gameStartedAt || Date.now()))')
    expect(source).toContain('moveCount: this.moveCount')
    expect(source).toContain("source: 'mini-hbut-module'")
    expect(source).toContain('is_mobile: this.isMobile')
    expect(source).toContain('from: this.rankContext.from || ')
    expect(source).toContain('runtime: this.rankContext.runtime || ')
  })

  it('run 生命周期：加载即开局 + 重开 replaceActive；hasSubmittedResult 幂等锁保留', () => {
    const source = read(APP)
    expect(source).toContain('let run = sdkGame.startRun()')
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
    expect(source).toContain('if (!this.rankEnabled || this.rankSubmitBusy || this.hasSubmittedResult) return')
    expect(source).toContain('await run.finish(')
    expect(source).toContain('await run.retry()')
  })

  it('不在模块顶层 await ready（不得阻塞渲染），用 .then 刷新入口显隐', () => {
    const source = read(APP)
    expect(source).toContain('void sdkGame.ready.then(')
    expect(source).not.toMatch(/await sdkGame\.ready/)
  })

  it('共享 storage key 只在读路径出现（不再写 hbut_game_rank_context_v1）', () => {
    const source = read(APP)
    expect(source).not.toContain("localStorage.setItem('hbut_game_rank_context_v1'")
    expect(HECHENG_HUGONGDA_STORAGE_KEYS).toEqual(['hecheng_hugongda_rank_context_v1', 'hbut_game_rank_context_v1'])
    expect(HECHENG_HUGONGDA_ADAPTER.legacy.storageKeys).toEqual(HECHENG_HUGONGDA_STORAGE_KEYS)
  })

  it('不把学号 / 奖励数量写进任何请求体', () => {
    const source = read(APP)
    expect(source).not.toMatch(/student_id\s*:/)
    expect(source).not.toMatch(/xp_amount|coin_amount|reward_amount/)
  })

  it('榜单条目映射保留既有展示列（max_level / duration_ms / player_count / avg_score）', () => {
    const source = read(APP)
    expect(source).toContain('max_level: legacy.max_level ?? entry.metric_value')
    expect(source).toContain('duration_ms: legacy.duration_ms')
    expect(source).toContain('player_count: legacy.player_count')
    expect(source).toContain('avg_score: legacy.avg_score')
  })
})

describe('hecheng_hugongda adapter 语义（game-registry §3/§4.1）', () => {
  it('metric / capabilities / leaderboard 与 registry 冻结值一致', () => {
    expect(HECHENG_HUGONGDA_ADAPTER.gameId).toBe('hecheng_hugongda')
    expect(HECHENG_HUGONGDA_ADAPTER.metric).toMatchObject({
      name: 'school_level',
      semantics: 'progress_index',
      max: 9
    })
    expect(HECHENG_HUGONGDA_ADAPTER.capabilities).toMatchObject({
      ranked: true,
      multiplayer: false,
      classicMirror: true,
      seasonEligible: true,
      legacyCompatible: true
    })
    expect(HECHENG_HUGONGDA_ADAPTER.leaderboard).toEqual({ board: 'classic', order: 'score_desc' })
    expect(HECHENG_HUGONGDA_ADAPTER.extraKeys).toEqual(['source', 'is_mobile', 'from', 'runtime'])
    expect(HECHENG_HUGONGDA_ADAPTER.endedReasonMap).toEqual({ cleared: 'cleared', failed: 'failed' })
  })

  it('metric 1:1 双向换算：9 → Legacy max_level 9，Legacy 9 → metric 9', () => {
    const built = HECHENG_HUGONGDA_ADAPTER.buildResult({ score: 100, maxLevel: 9 })
    expect(built.result.metric).toEqual({ name: 'school_level', value: 9 })
    expect(HECHENG_HUGONGDA_ADAPTER.toLegacyPayload(built)).toMatchObject({ max_level: 9 })
  })

  it('metric 上限 9：越界（10）本地即拒（SCHEMA_INVALID，不发请求）', () => {
    expect(() => HECHENG_HUGONGDA_ADAPTER.buildResult({ score: 100, maxLevel: 10 })).toThrowError(
      /指标数值超出该游戏上限/
    )
  })

  it('extra 白名单：is_mobile 等四键保留，未声明键被丢弃（diagnostics 可见）', () => {
    const built = HECHENG_HUGONGDA_ADAPTER.buildResult({
      score: 100,
      maxLevel: 3,
      extra: { source: 'mini-hbut-module', is_mobile: false, from: '', runtime: 'module-web', hack: 'nope' }
    })
    expect(built.result.extra).toEqual({
      source: 'mini-hbut-module',
      is_mobile: false,
      from: '',
      runtime: 'module-web'
    })
    expect(built.diagnostics.droppedExtraKeys).toEqual(['hack'])
    expect(HECHENG_HUGONGDA_ADAPTER.toLegacyPayload(built).payload).toEqual(built.result.extra)
  })

  it('ended_reason 映射：cleared/failed 原样（不产生 unknown）', () => {
    expect(HECHENG_HUGONGDA_ADAPTER.normalizeEndedReason('cleared').reason).toBe('cleared')
    expect(HECHENG_HUGONGDA_ADAPTER.normalizeEndedReason('failed').reason).toBe('failed')
  })
})

describe('hecheng_hugongda 提交（compatibility 通道）', () => {
  it('SDK 经典榜 body 与迁移前 submitGameRank body 逐字段一致（含 extra 四键）', async () => {
    const router = createFetchRouter([submitRoute()])
    const { game } = await createLegacyGame(router)
    expect(game.mode).toBe('compatibility')

    const run = game.startRun({ runId: 'run_hecheng_equivalence_1', startedAt: 1700000000000 })
    const outcome = await run.finish({ ...LEGACY_PAYLOAD })
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy', uploaded: true })

    // 用迁移前实现（未改动的 game_rank.js）构造同一局请求
    const legacyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', legacyFetch)
    await submitGameRank(readGameModuleContext(), { runId: 'run_hecheng_equivalence_1', ...LEGACY_PAYLOAD })

    const legacyBody = JSON.parse(String(legacyFetch.mock.calls[0][1].body))
    const sdkBody = router.callsFor('/submit')[0].body
    expect(sdkBody).toEqual(legacyBody)
    expect(sdkBody).toMatchObject({
      game_id: 'hecheng_hugongda',
      run_id: 'run_hecheng_equivalence_1',
      student_id: '20240088',
      score: 1280,
      max_level: 9,
      move_count: 42,
      duration_ms: 61000,
      ended_reason: 'cleared',
      payload: { source: 'mini-hbut-module', is_mobile: true, from: 'more', runtime: 'module-web' }
    })
    game.dispose()
  })

  it('同一 run 重复 finish → 只发一次请求（duplicate）；重开一局后 run_id 才变化', async () => {
    const router = createFetchRouter([submitRoute()])
    const { game } = await createLegacyGame(router)
    const run = game.startRun({ runId: 'run_hecheng_duplicate_1' })
    const first = await run.finish({ ...LEGACY_PAYLOAD })
    const second = await run.finish({ ...LEGACY_PAYLOAD })
    expect(first.success).toBe(true)
    expect(second.duplicate).toBe(true)
    expect(router.callsFor('/submit')).toHaveLength(1)

    const next = game.startRun({ replaceActive: true })
    expect(next.id).not.toBe(run.id)
    await next.finish({ ...LEGACY_PAYLOAD })
    const runIds = router.callsFor('/submit').map((call) => (call.body as { run_id: string }).run_id)
    expect(runIds).toEqual(['run_hecheng_duplicate_1', next.id])
    game.dispose()
  })

  it('榜单走 SDK：class_total 用班级名与总分，条目绝不外泄学号', async () => {
    const router = createFetchRouter([
      submitRoute(),
      {
        match: '/leaderboard',
        method: 'GET',
        respond: () =>
          okJson({
            leaderboard: [
              { rank: 1, class_name: '软件2401', total_score: 9999, player_count: 31, student_id: '20240088' },
              { rank: 2, class_name: '软件2402', total_score: 8800, player_count: 30 }
            ],
            refreshed_at: '2026-09-27T08:00:00Z',
            player: { score: 1280, class_rank: 3 }
          })
      }
    ])
    const { game } = await createLegacyGame(router)
    const result = await game.leaderboard({ scope: 'class_total', limit: 20 })
    expect(result.success).toBe(true)
    expect(result.source).toBe('legacy')
    expect(result.entries[0]).toMatchObject({ rank: 1, display_name: '软件2401', score: 9999, total_score: 9999 })
    expect(JSON.stringify(result.entries)).not.toContain('20240088')
    expect((result.raw as Record<string, unknown>).refreshed_at).toBe('2026-09-27T08:00:00Z')
    expect(router.callsFor('/leaderboard')[0].url).toContain('scope=class_total')
    game.dispose()
  })
})

describe('hecheng_hugongda storage key 不再串味（迁移指南 §7）', () => {
  it('URL 注入上下文时只写模块私有 key', async () => {
    const router = createFetchRouter([submitRoute()])
    const { game, host } = await createLegacyGame(router)
    expect(host.storageWrites.map((item) => item.key)).toEqual(['hecheng_hugongda_rank_context_v1'])
    expect(host.storageWrites[0].value).toContain('20240088')
    game.dispose()
  })

  it('已落盘的老共享 key 仍能读到（回落兼容），并把上下文迁移写回私有 key', async () => {
    const router = createFetchRouter([submitRoute()])
    const host = setupLegacyEnv('?rank_api=https://rank.example/api/game-rank')
    const storage = host.win.localStorage as { setItem: (key: string, value: string) => void }
    storage.setItem(
      'hbut_game_rank_context_v1',
      JSON.stringify({ studentId: '20240999', className: '老班级', schoolName: '湖北工业大学', rankApiBase: 'https://rank.example/api/game-rank' })
    )
    vi.stubGlobal('fetch', router.fetch)
    const seededWrites = host.storageWrites.length // 预置老 key 自身也会被记录，这里只断言 SDK 写入的部分
    const game = await MiniHBUTGame.init({
      gameId: 'hecheng_hugongda',
      adapter: HECHENG_HUGONGDA_ADAPTER,
      legacy: { storageKeys: HECHENG_HUGONGDA_STORAGE_KEYS },
      retryDelaysMs: [1, 1, 1],
      timeouts: { welcome: 10, ticket: 10 },
      requestTimeoutMs: 60
    })
    // 老共享 key 提供 student_id → 仍然可提交流程不降级
    expect(game.capabilities.canSubmitLegacy).toBe(true)
    const sdkWrites = host.storageWrites.slice(seededWrites)
    expect(sdkWrites.map((item) => item.key)).toEqual(['hecheng_hugongda_rank_context_v1'])
    expect(sdkWrites[0].value).toContain('20240999')
    game.dispose()
  })
})
