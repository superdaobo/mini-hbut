import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canUseGameRank,
  readGameModuleContext,
  submitGameRank
} from '../../../../website/modules-src/hbut_memory_match/project/src/utils/game_rank.js'

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

describe('hbut_memory_match rank contract', () => {
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

  it('submits memory score with game_id hbut_memory_match and retries once on 503', async () => {
    setSearch(
      '?student_id=20240111&player_name=记忆牌&class_name=机械2401&rank_api=https://rank.example/api/game-rank'
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'busy' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const context = readGameModuleContext()
    expect(canUseGameRank(context)).toBe(true)
    const result = await submitGameRank(
      context,
      {
        runId: 'run_memory_1',
        score: 860,
        maxLevel: 3,
        durationMs: 54000,
        moveCount: 22,
        endedReason: 'lost',
        extra: { mistakes: 4, levelIndex: 2 }
      },
      { retryDelaysMs: [0] }
    )
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.game_id).toBe('hbut_memory_match')
    expect(body.score).toBe(860)
    expect(body.run_id).toBe('run_memory_1')
    expect(body.max_level).toBe(3)
    expect(body.ended_reason).toBe('lost')
  })

  it('disables rank without student_id', () => {
    setSearch('?rank_api=https://rank.example/api/game-rank')
    const context = readGameModuleContext()
    expect(canUseGameRank(context)).toBe(false)
  })

  it('无 rank_api 注入（网页直开）→ 未配置：不判定可提交、零远程请求', async () => {
    // P1-5 收口：有身份但无 API 决策时必须 fail closed（standalone），绝不回落任何默认域
    setSearch('?student_id=20240111&player_name=记忆牌&class_name=机械2401')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const context = readGameModuleContext()
    expect(context.rankApiBase).toBe('')
    expect(canUseGameRank(context)).toBe(false)
    await expect(
      submitGameRank(context, { runId: 'run_memory_standalone', score: 860 })
    ).rejects.toThrow(/未注入 rank_api/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
