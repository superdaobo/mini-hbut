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

  it('#968c: 历史裸键读到即迁入私有上下文并清除裸键（值保持可用）', async () => {
    localStorage.setItem('student_id', '20240006')
    localStorage.setItem('rank_api', 'https://rank.example/api/game-rank')

    const context = readGameModuleContext()

    expect(context.student_id).toBe('20240006')
    expect(context.rank_api).toBe('https://rank.example/api/game-rank')
    // 裸键已清除（生产无写入方的脏数据不永久残留）
    expect(localStorage.getItem('student_id')).toBeNull()
    expect(localStorage.getItem('rank_api')).toBeNull()
    // 值已迁入 <gameId>_rank_context_v1（宿主启动清理器可对它做跨环境 base 校验）
    const migrated = JSON.parse(localStorage.getItem('jump_out_hbut_rank_context_v1'))
    expect(migrated.studentId).toBe('20240006')
    expect(migrated.rankApiBase).toBe('https://rank.example/api/game-rank')
  })

  it('#968c: 迁移后二次读取从私有上下文取值，行为不变', async () => {
    localStorage.setItem('class_name', '电气2401')
    localStorage.setItem('rank_api', 'https://rank.example/api/game-rank')
    const first = readGameModuleContext()
    expect(first.rank_api).toBe('https://rank.example/api/game-rank')

    // 第二次读取：裸键已被迁移清除，私有上下文仍提供同值
    const second = readGameModuleContext()
    expect(second.class_name).toBe('电气2401')
    expect(second.rank_api).toBe('https://rank.example/api/game-rank')
  })

  it('#968c: URL 参数仍优先于存储（迁移不改变注入语义）', async () => {
    localStorage.setItem('rank_api', 'https://stored.example/api/game-rank')
    setSearch('?rank_api=https://injected.example/api/game-rank')
    const context = readGameModuleContext()
    expect(context.rank_api).toBe('https://injected.example/api/game-rank')
    // 参数命中时不触发迁移（裸键保持原样）
    expect(localStorage.getItem('rank_api')).toBe('https://stored.example/api/game-rank')
  })
})
