/**
 * 契约 A：安装 id（分桶键）持久化测试。
 *
 * 覆盖：
 * - 首次使用生成 128bit（32 hex）随机 id 并持久化到 `hbu_game_install_id`；
 * - 已有合法值 → 复用（稳定分桶前提，不再写入）；
 * - 存储不可用 / 读取抛错 / 已有值非法 / 写入失败（含静默失败）→ `''`（fail closed）；
 * - 无 Web Crypto → Math.random 退化（仍为 32 hex，不抛错、不伪造常量 id）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GAME_PLATFORM_INSTALL_ID_KEY, getOrCreateGameInstallId } from './game_center/install_id'

/** 可控的内存 localStorage（可注入 setItem/getItem 故障） */
const createStorage = (options: { failRead?: boolean; failWrite?: boolean; silentWrite?: boolean } = {}) => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => {
      if (options.failRead) throw new Error('read unavailable')
      return map.has(key) ? (map.get(key) as string) : null
    },
    setItem: (key: string, value: string) => {
      if (options.failWrite) throw new Error('write unavailable')
      if (options.silentWrite) return // 静默失败：写入不生效（隐私模式 / 配额 0）
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getOrCreateGameInstallId（fail closed 的分桶键）', () => {
  it('首次生成 32 位 hex 并持久化；再次调用复用同一值', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    const first = getOrCreateGameInstallId()
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(storage.map.get(GAME_PLATFORM_INSTALL_ID_KEY)).toBe(first)

    const second = getOrCreateGameInstallId()
    expect(second).toBe(first)
  })

  it('已有合法值 → 直接复用且不重复写入', () => {
    const storage = createStorage()
    const existing = '0123456789abcdef0123456789abcdef'
    storage.map.set(GAME_PLATFORM_INSTALL_ID_KEY, existing)
    const setSpy = vi.spyOn(storage, 'setItem')
    vi.stubGlobal('localStorage', storage)

    expect(getOrCreateGameInstallId()).toBe(existing)
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('已有值非法（被污染）→ 返回空串且不覆盖、不伪造', () => {
    const storage = createStorage()
    storage.map.set(GAME_PLATFORM_INSTALL_ID_KEY, 'not-an-install-id')
    const setSpy = vi.spyOn(storage, 'setItem')
    vi.stubGlobal('localStorage', storage)

    expect(getOrCreateGameInstallId()).toBe('')
    expect(setSpy).not.toHaveBeenCalled()
    expect(storage.map.get(GAME_PLATFORM_INSTALL_ID_KEY)).toBe('not-an-install-id')
  })

  it('localStorage 不存在 / 读取抛错 → 返回空串（fail closed）', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(getOrCreateGameInstallId()).toBe('')

    const failing = createStorage({ failRead: true })
    vi.stubGlobal('localStorage', failing)
    expect(getOrCreateGameInstallId()).toBe('')
  })

  it('写入抛错 / 静默失败 → 返回空串（不得返回未持久化的 id）', () => {
    const failingWrite = createStorage({ failWrite: true })
    vi.stubGlobal('localStorage', failingWrite)
    expect(getOrCreateGameInstallId()).toBe('')

    const silentWrite = createStorage({ silentWrite: true })
    vi.stubGlobal('localStorage', silentWrite)
    expect(getOrCreateGameInstallId()).toBe('')
    expect(silentWrite.map.has(GAME_PLATFORM_INSTALL_ID_KEY)).toBe(false)
  })

  it('无 Web Crypto → Math.random 退化仍生成 32 hex 并持久化', () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('crypto', {}) // 无 getRandomValues

    const id = getOrCreateGameInstallId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(storage.map.get(GAME_PLATFORM_INSTALL_ID_KEY)).toBe(id)
    expect(getOrCreateGameInstallId()).toBe(id)
  })

  it('不伪造常量 id：多次全新环境生成的 id 不会都相同', () => {
    const generated = new Set<string>()
    for (let i = 0; i < 3; i += 1) {
      const storage = createStorage()
      vi.stubGlobal('localStorage', storage)
      generated.add(getOrCreateGameInstallId())
    }
    expect(generated.has('')).toBe(false)
    expect(generated.size).toBeGreaterThan(1)
    for (const id of generated) {
      expect(id).toMatch(/^[0-9a-f]{32}$/)
      expect(id).not.toBe('0'.repeat(32))
    }
  })
})
