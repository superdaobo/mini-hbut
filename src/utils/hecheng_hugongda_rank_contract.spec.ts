import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canUseGameRank,
  readGameModuleContext,
  shouldRetryRequest,
  submitGameRank
} from '../../website/modules-src/hecheng_hugongda/project/src/utils/game_rank.js'

const setSearch = (search = '') => {
  // @ts-expect-error test window stub
  globalThis.window = {
    location: { search },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  }
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

describe('hecheng_hugongda rank upload contract', () => {
  beforeEach(() => {
    // @ts-expect-error test storage stub
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

  it('does not enable rank without student_id', () => {
    setSearch('?rank_api=https://rank.example/api/game-rank')
    expect(canUseGameRank(readGameModuleContext())).toBe(false)
  })

  it('retries transient submit failures with the same run_id and score payload', async () => {
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

    const result = await submitGameRank(
      readGameModuleContext(),
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
    const body0 = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    const body1 = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(body0.run_id).toBe('run_hecheng_retry')
    expect(body1.run_id).toBe('run_hecheng_retry')
    expect(body0.game_id).toBe('hecheng_hugongda')
    expect(body0.score).toBe(128)
  })

  it('never posts submit without student context', async () => {
    setSearch('?rank_api=https://rank.example/api/game-rank')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(submitGameRank(readGameModuleContext(), { runId: 'x', score: 1 })).rejects.toThrow(/学号/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('classifies retriable errors like 2048 client', () => {
    expect(shouldRetryRequest(Object.assign(new Error('network failed'), { status: 0 }))).toBe(true)
    expect(shouldRetryRequest(Object.assign(new Error('server'), { status: 503 }))).toBe(true)
    expect(shouldRetryRequest(Object.assign(new Error('rate'), { status: 429 }))).toBe(true)
    expect(shouldRetryRequest(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false)
  })
})
