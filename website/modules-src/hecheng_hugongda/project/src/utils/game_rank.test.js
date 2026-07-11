import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canUseGameRank,
  readGameModuleContext,
  shouldRetryRequest,
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
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear()
  }
}

describe('hecheng hugongda game rank client', () => {
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

  it('does not treat missing student context as rank-enabled', () => {
    setSearch('?rank_api=https://rank.example/api/game-rank')
    const context = readGameModuleContext()
    expect(canUseGameRank(context)).toBe(false)
  })

  it('retries transient score upload failures without changing the run id', async () => {
    setSearch(
      '?student_id=20240088&player_name=合成玩家&class_name=软件2401&rank_api=https://rank.example/api/game-rank'
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'busy' }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, accepted: true, player: { score: 128 } }), { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)

    const context = readGameModuleContext()
    const result = await submitGameRank(
      context,
      {
        runId: 'run_hecheng_retry',
        score: 128,
        maxLevel: 6,
        durationMs: 45000,
        moveCount: 20,
        endedReason: 'failed'
      },
      { retryDelaysMs: [0] }
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).run_id).toBe('run_hecheng_retry')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).run_id).toBe('run_hecheng_retry')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).game_id).toBe('hecheng_hugongda')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).score).toBe(128)
  })

  it('rejects submit when student id is missing', async () => {
    setSearch('?rank_api=https://rank.example/api/game-rank')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitGameRank(readGameModuleContext(), { runId: 'run_no_student', score: 10 })
    ).rejects.toThrow(/学号/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('classifies retriable network and server errors', () => {
    expect(shouldRetryRequest(Object.assign(new Error('network failed'), { status: 0 }))).toBe(true)
    expect(shouldRetryRequest(Object.assign(new Error('server'), { status: 503 }))).toBe(true)
    expect(shouldRetryRequest(Object.assign(new Error('rate'), { status: 429 }))).toBe(true)
    expect(shouldRetryRequest(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false)
  })
})
