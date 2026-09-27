import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeParkingScore } from '../../../../website/modules-src/hbut_parking/project/src/game/parking.js'
import {
  canUseGameRank,
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hbut_parking/project/src/utils/game_rank.js'

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

describe('hbut_parking rank contract', () => {
  beforeEach(() => {
    // @ts-expect-error storage
    globalThis.localStorage = createStorage()
    Object.defineProperty(globalThis, 'navigator', {
      value: { platform: 'test' },
      configurable: true
    })
    setSearch('')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('submits parking score with game_id hbut_parking', async () => {
    setSearch('?student_id=20240111&player_name=挪车&class_name=机械2401&rank_api=https://rank.example/api/game-rank')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const context = readGameModuleContext()
    expect(canUseGameRank(context)).toBe(true)
    const score = computeParkingScore({ clearedLevels: 3, totalSteps: 40, durationMs: 90000 })
    await submitGameRank(context, {
      runId: 'run_parking_1',
      score,
      maxLevel: 3,
      durationMs: 90000,
      moveCount: 40,
      endedReason: 'won'
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.game_id).toBe('hbut_parking')
    expect(body.score).toBe(score)
  })

  it('无 rank_api 注入（网页直开）→ 未配置：不判定可提交、零远程请求', async () => {
    // P1-5 收口：有身份但无 API 决策时必须 fail closed（standalone），绝不回落任何默认域
    setSearch('?student_id=20240111&player_name=挪车&class_name=机械2401')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const context = readGameModuleContext()
    expect(context.rankApiBase).toBe('')
    expect(canUseGameRank(context)).toBe(false)
    await expect(
      submitGameRank(context, { runId: 'run_parking_standalone', score: 900 })
    ).rejects.toThrow(/未注入 rank_api/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
