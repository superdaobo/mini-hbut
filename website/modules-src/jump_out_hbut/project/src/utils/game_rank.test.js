import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './game_rank.js'

const setSearch = (search = '') => {
  window.history.replaceState({}, '', `/${search}`)
}

describe('jump out hbut game rank client', () => {
  beforeEach(() => {
    localStorage.clear()
    setSearch('')
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries transient score upload failures and keeps the same run id', async () => {
    setSearch('?student_id=20240004&player_name=跳跃玩家&class_name=机械2401&rank_api=https://rank.example/api/game-rank')
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('NetworkError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, accepted: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitGameRank(
      { run_id: 'jump_retry_1', score: 88, max_level: 8, duration_ms: 30000, move_count: 8 },
      { retryDelaysMs: [0] }
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).run_id).toBe('jump_retry_1')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).run_id).toBe('jump_retry_1')
  })

  it('uses legacy cached class context in class leaderboard requests', async () => {
    localStorage.setItem('student_id', '20240005')
    localStorage.setItem('player_name', '缓存玩家')
    localStorage.setItem('class_name', '电气2401')
    localStorage.setItem('rank_api', 'https://rank.example/api/game-rank')
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, leaderboard: [] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const context = readGameModuleContext()
    await fetchGameLeaderboard({ scope: 'class', limit: 20 })

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(context.class_name).toBe('电气2401')
    expect(url.searchParams.get('class_name')).toBe('电气2401')
  })
})
