/**
 * #451 硬重载护栏（#991 加固）单元测试。
 *
 * 核心不变量：**计数必须跨 `location.reload()` 存活**。原实现把计数放在内存状态里，
 * 而重载恰好会清空它 —— 护栏被自己要防的那次重载清掉，上限形同不存在。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  HARD_RELOAD_COUNT_WINDOW_MS,
  HARD_RELOAD_STORAGE_KEY,
  getHardReloadCountInWindow,
  readHardReloadState,
  recordHardReload
} from './hard_reload_guard'

const installStorage = (seed?: Record<string, string>) => {
  const store = new Map<string, string>(Object.entries(seed ?? {}))
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear()
  }
  return store
}

beforeEach(() => {
  installStorage()
})

describe('hard_reload_guard', () => {
  it('无记录时计数为 0，读取返回 null', () => {
    expect(getHardReloadCountInWindow()).toBe(0)
    expect(readHardReloadState()).toBeNull()
  })

  it('记录后计数递增，并保留诊断字段', () => {
    const base = 1_700_000_000_000
    expect(recordHardReload({ reason: 'dom-unhealthy-after-resume', view: 'home', idleMs: 6_299_000 }, base)).toBe(1)
    expect(
      recordHardReload({ reason: 'dom-unhealthy-after-resume', view: 'home', idleMs: 6_299_000 }, base + 1000)
    ).toBe(2)

    const state = readHardReloadState()
    expect(state?.count).toBe(2)
    expect(state?.view).toBe('home')
    expect(state?.idleMs).toBe(6_299_000)
    expect(getHardReloadCountInWindow(base + 2000)).toBe(2)
  })

  it('计数跨「页面重载」存活（这是本次加固的核心）', () => {
    const base = 1_700_000_000_000
    recordHardReload({ reason: 'a', view: 'home', idleMs: 1 }, base)
    // 模拟 reload：内存状态清零，但 localStorage 保留 → 护栏仍生效
    expect(getHardReloadCountInWindow(base + 500)).toBe(1)
  })

  it('超出时间窗后计数重置（不永久封锁兜底能力）', () => {
    const base = 1_700_000_000_000
    recordHardReload({ reason: 'a', view: 'home', idleMs: 1 }, base)
    expect(getHardReloadCountInWindow(base + HARD_RELOAD_COUNT_WINDOW_MS + 1)).toBe(0)
    // 窗口外的下一次记录重新从 1 开始
    expect(
      recordHardReload({ reason: 'a', view: 'home', idleMs: 1 }, base + HARD_RELOAD_COUNT_WINDOW_MS + 2)
    ).toBe(1)
  })

  it('损坏的存储内容不抛错且视为无记录', () => {
    installStorage({ [HARD_RELOAD_STORAGE_KEY]: '{not-json' })
    expect(readHardReloadState()).toBeNull()
    expect(getHardReloadCountInWindow()).toBe(0)

    installStorage({ [HARD_RELOAD_STORAGE_KEY]: JSON.stringify({ nope: 1 }) })
    expect(readHardReloadState()).toBeNull()
  })

  it('存储不可用时仍返回本次计数（护栏退回内存语义）', () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage
    expect(() => recordHardReload({ reason: 'a', view: 'home', idleMs: 1 })).not.toThrow()
    expect(recordHardReload({ reason: 'a', view: 'home', idleMs: 1 })).toBe(1)
  })
})
