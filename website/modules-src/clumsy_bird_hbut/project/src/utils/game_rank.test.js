import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './game_rank.js'

const setSearch = (search = '') => {
  globalThis.window = {
    location: { search },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  }
}

const createStorage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear()
  }
}

describe('clumsy bird game rank client', () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage()
    Object.defineProperty(globalThis, 'navigator', {
      value: { platform: 'test-platform' },
      configurable: true
    })
    localStorage.clear()
    setSearch('')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries transient score upload failures with the same run id', async () => {
    setSearch('?student_id=20240001&player_name=测试玩家&class_name=软件2401&rank_api=https://rank.example/api/game-rank')
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, accepted: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitGameRank(
      readGameModuleContext(),
      { runId: 'run_retry_1', score: 9, maxLevel: 9, durationMs: 1200, moveCount: 4 },
      { retryDelaysMs: [0] }
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(firstBody.run_id).toBe('run_retry_1')
    expect(secondBody.run_id).toBe('run_retry_1')
    expect(secondBody.class_name).toBe('软件2401')
  })

  it('restores legacy snake_case class context for class leaderboard queries', async () => {
    localStorage.setItem(
      'clumsy_bird_hbut_rank_context_v1',
      JSON.stringify({
        student_id: '20240002',
        player_name: '旧缓存玩家',
        class_name: '计科2402',
        rank_api: 'https://rank.example/api/game-rank'
      })
    )
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, leaderboard: [] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const context = readGameModuleContext()
    await fetchGameLeaderboard(context, { scope: 'class', limit: 20 })

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(context.className).toBe('计科2402')
    expect(url.searchParams.get('class_name')).toBe('计科2402')
    expect(url.searchParams.get('student_id')).toBe('20240002')
  })
})
