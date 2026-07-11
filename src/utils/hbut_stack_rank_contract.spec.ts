import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canUseGameRank,
  readGameModuleContext,
  submitGameRank
} from '../../website/modules-src/hbut_stack/project/src/utils/game_rank.js'

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

describe('hbut_stack rank contract', () => {
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

  it('submits stack score with game_id hbut_stack', async () => {
    setSearch(
      '?student_id=20240111&player_name=叠塔&class_name=机械2401&rank_api=https://rank.example/api/game-rank'
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const context = readGameModuleContext()
    expect(canUseGameRank(context)).toBe(true)
    const result = await submitGameRank(context, {
      runId: 'run_stack_1',
      score: 650,
      maxLevel: 5,
      durationMs: 20000,
      moveCount: 5,
      endedReason: 'lost'
    })
    expect(result.success).toBe(true)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.game_id).toBe('hbut_stack')
    expect(body.score).toBe(650)
    expect(body.run_id).toBe('run_stack_1')
  })
})
