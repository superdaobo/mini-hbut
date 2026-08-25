import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./debug_logger', () => ({
  pushDebugLog: vi.fn()
}))

const loadModule = async () => {
  vi.resetModules()
  return import('./legacy_background_migration.js')
}

/** 内存版 localStorage（Node 环境无全局 localStorage）。 */
const createMemoryStorage = () => {
  const store = new Map<string, string>()
  const storage = {
    get length() {
      return store.size
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    }
  }
  return { storage, store }
}

describe('migrateLegacyBackgroundState（#616 旧 Capacitor 后台状态迁移）', () => {
  let memory: ReturnType<typeof createMemoryStorage>

  beforeEach(() => {
    memory = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', {
      value: memory.storage,
      configurable: true
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'localStorage')
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('把旧开关搬迁到新 config（新键未设置时），并清除旧键', async () => {
    memory.storage.setItem('hbu_bg_enabled', '1')
    memory.storage.setItem('hbu_bg_enable_grade', '0')
    memory.storage.setItem('hbu_bg_api_base', 'https://hbut.6661111.xyz/api')
    memory.storage.setItem('hbu_bg_school_inbox_state:20260001', '["a","b"]')

    const { migrateLegacyBackgroundState } = await loadModule()
    await migrateLegacyBackgroundState()

    expect(memory.storage.getItem('hbu_notify_bg')).toBe('true')
    expect(memory.storage.getItem('hbu_notify_grade')).toBe('false')
    expect(memory.storage.getItem('hbu_bg_enabled')).toBeNull()
    expect(memory.storage.getItem('hbu_bg_enable_grade')).toBeNull()
    expect(memory.storage.getItem('hbu_bg_api_base')).toBeNull()
    expect(memory.storage.getItem('hbu_bg_school_inbox_state:20260001')).toBeNull()
  })

  it('幂等：重复执行不覆盖新 config、不残留旧键', async () => {
    memory.storage.setItem('hbu_bg_enabled', '1')
    memory.storage.setItem('hbu_notify_bg', 'false')

    const { migrateLegacyBackgroundState } = await loadModule()
    await migrateLegacyBackgroundState()
    await migrateLegacyBackgroundState()

    // 新键已存在 -> 不覆盖；旧键被清除
    expect(memory.storage.getItem('hbu_notify_bg')).toBe('false')
    expect(memory.storage.getItem('hbu_bg_enabled')).toBeNull()
  })

  it('#706：已移除的 per-feature 开关键（hbu_bg_feature_*）纳入清理', async () => {
    memory.storage.setItem('hbu_bg_feature_grades', 'false')
    memory.storage.setItem('hbu_bg_feature_exams', 'true')
    memory.storage.setItem('hbu_bg_feature_school', 'false')

    const { migrateLegacyBackgroundState } = await loadModule()
    await migrateLegacyBackgroundState()

    expect(memory.storage.getItem('hbu_bg_feature_grades')).toBeNull()
    expect(memory.storage.getItem('hbu_bg_feature_exams')).toBeNull()
    expect(memory.storage.getItem('hbu_bg_feature_school')).toBeNull()
  })

  it('迁移完成后写入标记，后续调用直接跳过', async () => {
    memory.storage.setItem('hbu_bg_enabled', '1')
    const setItemSpy = vi.spyOn(memory.storage, 'setItem')

    const { migrateLegacyBackgroundState } = await loadModule()
    await migrateLegacyBackgroundState()
    const writesAfterFirstRun = setItemSpy.mock.calls.length
    expect(memory.storage.getItem('hbu_legacy_bg_migrated_v1')).toBe('1')

    await migrateLegacyBackgroundState()
    // 第二次调用命中标记，不再做任何写入
    expect(setItemSpy.mock.calls.length).toBe(writesAfterFirstRun)
  })

  it('无旧键时安全 no-op，不抛异常', async () => {
    const { migrateLegacyBackgroundState } = await loadModule()
    await expect(migrateLegacyBackgroundState()).resolves.toBeUndefined()
    expect(memory.storage.getItem('hbu_legacy_bg_migrated_v1')).toBe('1')
  })
})
