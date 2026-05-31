import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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

describe('hbut 2048 game rank client', () => {
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

  it('retries transient score upload failures without changing the run id', async () => {
    setSearch('?student_id=20240003&player_name=2048玩家&class_name=自动化2401&rank_api=https://rank.example/api/game-rank')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: 'busy' }), { status: 503 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, accepted: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitGameRank(
      readGameModuleContext(),
      { runId: 'run_2048_retry', score: 4096, maxLevel: 512, durationMs: 60000, moveCount: 120 },
      { retryDelaysMs: [0] }
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).run_id).toBe('run_2048_retry')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).run_id).toBe('run_2048_retry')
  })
})
