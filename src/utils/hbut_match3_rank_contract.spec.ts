import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canUseGameRank,
  readGameModuleContext,
  submitGameRank
} from '../../website/modules-src/hbut_match3/project/src/utils/game_rank.js'

const setSearch = (search = '') => {
  // @ts-expect-error test window
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

describe('hbut_match3 rank contract', () => {
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
  })

  it('submits match3 score with game_id hbut_match3', async () => {
    setSearch('?student_id=20240111&player_name=消消乐&class_name=机械2401&rank_api=https://rank.example/api/game-rank')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const context = readGameModuleContext()
    expect(canUseGameRank(context)).toBe(true)
    await submitGameRank(context, {
      runId: 'run_match3_1',
      score: 1280,
      maxLevel: 1,
      durationMs: 60000,
      moveCount: 30,
      endedReason: 'lost'
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.game_id).toBe('hbut_match3')
    expect(body.score).toBe(1280)
  })
})
