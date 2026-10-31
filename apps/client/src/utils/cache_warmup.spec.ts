/**
 * 后台缓存预热（issue #1158 P1）单元测试
 *
 * vitest 主配置为 `environment: 'node'`（无 DOM / 无 jsdom）：
 * - stub 全局 `localStorage`（api.js 的 get/setCachedData 与本模块限频都依赖它）；
 * - `vi.mock('axios')` 拦截真实 HTTP，让 maybeRunCacheWarmup 的在线 happy-path 可离线验证。
 *
 * 各用例使用**互不相同**的缓存 key 前缀，避免 api.js 的 memoryCache 单例跨用例污染。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiPayload } from './api.js'
import { getCachedData } from './api.js'
import {
  planWarmupTasks,
  runWarmup,
  maybeRunCacheWarmup,
  WARMUP_RATE_LIMIT_KEY,
  type WarmupTask
} from './cache_warmup'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(async (): Promise<{ data: ApiPayload }> => ({
      data: { success: true, semesters: ['2025-2026-2', '2024-2025-2'], current: '2025-2026-2' }
    })),
    post: vi.fn(async (): Promise<{ data: ApiPayload }> => ({ data: { success: true, data: {} } }))
  }
}))

const installStorage = () => {
  const storage = new Map<string, string>()
  const api = {
    getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
    setItem: (key: string, value: string) => void storage.set(key, String(value)),
    removeItem: (key: string) => void storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size
    }
  }
  vi.stubGlobal('localStorage', api)
  return { storage, api }
}

const okPayload: ApiPayload = { success: true, data: {} }
const mkTask = (id: string, key: string, fetcher: () => Promise<ApiPayload>, ttl = 5 * 60 * 1000): WarmupTask => ({
  id,
  key,
  fetcher,
  ttl,
  options: { priority: 'background' }
})

beforeEach(() => {
  installStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ── 1. planWarmupTasks：key 与视图一致 ────────────────────────────────────────
describe('planWarmupTasks', () => {
  it('生成的 key 与视图实际 key 一致（覆盖全部 6 个只读模块）', () => {
    const sid = '2025000001'
    const sem = '2025-2026-2'
    const byId = Object.fromEntries(planWarmupTasks(sid, sem).map((t) => [t.id, t]))

    expect(Object.keys(byId).sort()).toEqual(['exams', 'grades', 'ranking', 'schedule', 'semesters', 'studentinfo'])

    // 与视图实际 key 字符串逐一断言
    expect(byId.semesters.key).toBe('semesters') // ExamView:168 / RankingView:86
    expect(byId.ranking.key).toBe(`ranking:${sid}:${sem}`) // RankingView:107
    expect(byId.studentinfo.key).toBe(`studentinfo:${sid}`) // StudentInfoView:187
    expect(byId.grades.key).toBe(`grades:${sid}`) // GradeCoordinator:196（主 key 非学期分片）
    expect(byId.exams.key).toBe(`exams:${sid}:${sem}`) // ExamView:193
    expect(byId.schedule.key).toBe(`schedule:${sid}:${sem}`) // Dashboard:373
  })

  it('无当前学期时使用页面同款兜底 key', () => {
    const sid = '2025000001'
    const byId = Object.fromEntries(planWarmupTasks(sid, '').map((t) => [t.id, t]))
    expect(byId.ranking.key).toBe(`ranking:${sid}:all`) // RankingView:107 `|| 'all'`
    expect(byId.exams.key).toBe(`exams:${sid}:current`) // ExamView:193 `|| 'current'`
    expect(byId.schedule.key).toBe(`schedule:${sid}`) // buildScheduleCacheKey 无学期段
  })

  it('空学号返回空数组', () => {
    expect(planWarmupTasks('', '2025-2026-2')).toEqual([])
    expect(planWarmupTasks('  ', '2025-2026-2')).toEqual([])
  })
})

// ── 2. runWarmup：限频 ─────────────────────────────────────────────────────────
describe('runWarmup 限频', () => {
  it('限频窗口内第二次 runWarmup 不触发 fetcher', async () => {
    const fetcher = vi.fn(async (): Promise<ApiPayload> => okPayload)
    const tasks = [mkTask('a', 'rl:semesters', fetcher)]

    const r1 = await runWarmup(tasks, { now: 1000 })
    expect(r1.ran).toBe(true)
    expect(r1.ok).toBe(1)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // 1 分钟后（仍 < 30min）→ 限频，不触发 fetcher
    const r2 = await runWarmup(tasks, { now: 1000 + 60_000 })
    expect(r2.ran).toBe(false)
    expect(r2.skipped).toBe('rate-limited')
    expect(fetcher).toHaveBeenCalledTimes(1) // 未被再次调用

    // 31 分钟后（窗口外）→ 允许再跑（用全新 key，验证确实触发）
    const fetcher2 = vi.fn(async (): Promise<ApiPayload> => okPayload)
    const r3 = await runWarmup([mkTask('b', 'rl2:semesters', fetcher2)], { now: 1000 + 31 * 60_000 })
    expect(r3.ran).toBe(true)
    expect(fetcher2).toHaveBeenCalledTimes(1)
  })

  it('可注入更短的 rateLimitMs（便于测试）', async () => {
    const fetcher = vi.fn(async (): Promise<ApiPayload> => okPayload)
    const fetcher2 = vi.fn(async (): Promise<ApiPayload> => okPayload)
    await runWarmup([mkTask('a', 'rl3a:semesters', fetcher)], { now: 1000, rateLimitMs: 10_000 })
    // 20s > 10s（覆盖的窗口）→ 允许再跑（用全新 key，验证确实触发 fetcher）
    const r2 = await runWarmup([mkTask('b', 'rl3b:semesters', fetcher2)], { now: 1000 + 20_000, rateLimitMs: 10_000 })
    expect(r2.ran).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher2).toHaveBeenCalledTimes(1)
  })
})

// ── 3. runWarmup：单任务失败隔离 ───────────────────────────────────────────────
describe('runWarmup 单任务失败隔离', () => {
  // 直接向 localStorage 写入新鲜缓存（timestamp = now，getCacheKey = `cache:${key}`）。
  const seedFresh = (key: string) => {
    localStorage.setItem(`cache:${key}`, JSON.stringify({ data: okPayload, timestamp: Date.now() }))
  }

  it('单任务抛错不影响其他任务', async () => {
    const okFetcher = vi.fn(async (): Promise<ApiPayload> => ({ success: true, data: { x: 1 } }))
    const badFetcher = vi.fn(async (): Promise<ApiPayload> => {
      throw new Error('boom')
    })
    const tasks: WarmupTask[] = [
      mkTask('a', 'ff:k1', okFetcher),
      mkTask('b', 'ff:k2', badFetcher),
      mkTask('c', 'ff:k3', okFetcher)
    ]

    const r = await runWarmup(tasks, { now: 1000 })
    expect(r.ran).toBe(true)
    expect(r.ok).toBe(2)
    expect(r.failed).toBe(1)
    expect(okFetcher).toHaveBeenCalledTimes(2)

    // 成功任务写入缓存（与页面同一 key）；失败任务未写入
    expect(getCachedData('ff:k1', 5 * 60 * 1000)).not.toBeNull()
    expect(getCachedData('ff:k3', 5 * 60 * 1000)).not.toBeNull()
    expect(getCachedData('ff:k2', 5 * 60 * 1000)).toBeNull()
  })

  it('新鲜缓存命中则跳过（不重复请求）', async () => {
    const key = 'swr:semesters'
    seedFresh(key)
    const fetcher = vi.fn(async (): Promise<ApiPayload> => okPayload)
    const r = await runWarmup([mkTask('a', key, fetcher)], { now: 1000 })
    expect(r.ok).toBe(1)
    expect(fetcher).not.toHaveBeenCalled() // 已新鲜 → 跳过
  })
})

// ── 4. maybeRunCacheWarmup：在线/离线门控 ─────────────────────────────────────
describe('maybeRunCacheWarmup 门控', () => {
  it('离线时不跑（skipped=offline，且不写限频标记）', async () => {
    const result = await maybeRunCacheWarmup({ studentId: '2025000001', isOnline: () => false, now: 1000 })
    expect(result.ran).toBe(false)
    expect(result.skipped).toBe('offline')
    expect(localStorage.getItem(WARMUP_RATE_LIMIT_KEY)).toBeNull()
  })

  it('未登录（无学号）时不跑', async () => {
    const result = await maybeRunCacheWarmup({ studentId: '', isOnline: () => true, now: 1000 })
    expect(result.ran).toBe(false)
    expect(result.skipped).toBe('no-student')
  })

  it('在线 + 已登录 → 执行并写入各模块缓存（happy path，axios 已 mock）', async () => {
    const result = await maybeRunCacheWarmup({ studentId: '2025000001', isOnline: () => true, now: 1000 })
    expect(result.ran).toBe(true)

    // 各只读模块 key 都写入了缓存（与页面读取命中同一 key）
    expect(getCachedData('semesters', 5 * 60 * 1000)).not.toBeNull()
    expect(getCachedData('grades:2025000001', 5 * 60 * 1000)).not.toBeNull()
    expect(getCachedData('studentinfo:2025000001', 7 * 24 * 60 * 60 * 1000)).not.toBeNull()
    expect(getCachedData('ranking:2025000001:2025-2026-2', 5 * 60 * 1000)).not.toBeNull()
    expect(getCachedData('exams:2025000001:2025-2026-2', 5 * 60 * 1000)).not.toBeNull()
    expect(getCachedData('schedule:2025000001:2025-2026-2', 5 * 60 * 1000)).not.toBeNull()
    // 限频标记已写（证明确实开跑了）
    expect(localStorage.getItem(WARMUP_RATE_LIMIT_KEY)).not.toBeNull()
  })
})
