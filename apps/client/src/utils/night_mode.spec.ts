/**
 * night_mode 三态模型测试（#757：跟随系统 / 白天 / 夜间）
 *
 * 覆盖：
 * - 存储值解析与旧键迁移（'1'→dark、'0'→light、非法值→system）
 * - 旧版二态 API applyNightModePreference 兼容（debug_bridge 依赖 boolean 签名）
 * - system 态经 matchMedia 决定 dark class，change 事件即时切换（无需重启）
 * - 手动 light/dark 行为与旧版一致，且不受系统变化影响
 * - window / matchMedia 缺失时不崩溃
 *
 * 说明：模块内部持有监听句柄（模块级状态），因此用 vi.resetModules +
 * 动态 import 保证每个用例拿到全新模块实例，用例间互不污染。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as NightModeModule from './night_mode'

type NightMode = typeof NightModeModule

const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear(),
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  length: 0
}

const makeMockRoot = () => ({
  classList: {
    add: vi.fn(),
    remove: vi.fn(),
    // contains 声明为可带参形式，便于用例中替换为按类名判断的实现
    contains: vi.fn((_name?: string) => false)
  }
})

type MockRoot = ReturnType<typeof makeMockRoot>
let mockRoot: MockRoot

// matchMedia mock：记录监听器并支持模拟系统深浅色变化
const makeMatchMedia = (initialMatches: boolean) => {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const query = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: string, cb: (event: { matches: boolean }) => void) => {
      listeners.add(cb)
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn((cb: (event: { matches: boolean }) => void) => {
      listeners.add(cb)
    })
  }
  return {
    query,
    listenerCount: () => listeners.size,
    // 模拟系统深浅色变化：更新 matches 并通知全部监听器
    emit: (matches: boolean) => {
      query.matches = matches
      listeners.forEach((cb) => cb({ matches }))
    }
  }
}

type MatchMediaStub = ReturnType<typeof makeMatchMedia>
let matchMediaStub: MatchMediaStub | null

const loadModule = async (): Promise<NightMode> => {
  vi.resetModules()
  return (await import('./night_mode')) as NightMode
}

describe('night mode 三态模型（#757）', () => {
  beforeEach(() => {
    storageMap.clear()
    mockRoot = makeMockRoot()
    matchMediaStub = makeMatchMedia(false)
    ;(globalThis as { document?: unknown }).document = { documentElement: mockRoot }
    ;(globalThis as { localStorage?: Storage }).localStorage = stubStorage as unknown as Storage
    ;(globalThis as { window?: unknown }).window = {
      matchMedia: vi.fn(() => matchMediaStub!.query),
      dispatchEvent: vi.fn()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
    matchMediaStub = null
    delete (globalThis as { document?: unknown }).document
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { window?: unknown }).window
  })

  it('resolveNightModePreference：合法三态原样返回，旧键 1/0 迁移，非法值回退 system', async () => {
    const nm = await loadModule()

    expect(nm.resolveNightModePreference('system')).toBe('system')
    expect(nm.resolveNightModePreference('light')).toBe('light')
    expect(nm.resolveNightModePreference('dark')).toBe('dark')
    // 旧键语义迁移
    expect(nm.resolveNightModePreference('1')).toBe('dark')
    expect(nm.resolveNightModePreference('0')).toBe('light')
    // 空 / 非法值默认跟随系统
    expect(nm.resolveNightModePreference(null)).toBe('system')
    expect(nm.resolveNightModePreference(undefined)).toBe('system')
    expect(nm.resolveNightModePreference('yes')).toBe('system')
  })

  it('getNightModePreference：旧键 hbu_dark_mode=1 首次读取迁移为新键 dark 且语义不变', async () => {
    storageMap.set('hbu_dark_mode', '1')
    const nm = await loadModule()

    expect(nm.getNightModePreference()).toBe('dark')
    expect(storageMap.get('hbu_theme_mode')).toBe('dark')

    // 迁移后以新键优先，重复读取语义稳定
    expect(nm.getNightModePreference()).toBe('dark')
  })

  it('getNightModePreference：旧键 0 迁移为 light；无键默认 system 且不落盘', async () => {
    storageMap.set('hbu_dark_mode', '0')
    const nm = await loadModule()
    expect(nm.getNightModePreference()).toBe('light')
    expect(storageMap.get('hbu_theme_mode')).toBe('light')

    storageMap.clear()
    const fresh = await loadModule()
    expect(fresh.getNightModePreference()).toBe('system')
    expect(storageMap.get('hbu_theme_mode')).toBeUndefined()
  })

  it('applyNightModePreference(true/false) 兼容旧签名：写三态新键并切换 dark class', async () => {
    const nm = await loadModule()

    expect(nm.applyNightModePreference(true)).toBe(true)
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
    expect(mockRoot.classList.remove).not.toHaveBeenCalledWith('dark')
    expect(storageMap.get('hbu_theme_mode')).toBe('dark')

    expect(nm.applyNightModePreference(false)).toBe(false)
    expect(mockRoot.classList.remove).toHaveBeenCalledWith('dark')
    expect(storageMap.get('hbu_theme_mode')).toBe('light')
  })

  it('setNightModePreference：手动 light/dark 与旧版行为一致', async () => {
    const nm = await loadModule()

    expect(nm.setNightModePreference('dark')).toBe(true)
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
    expect(storageMap.get('hbu_theme_mode')).toBe('dark')

    expect(nm.setNightModePreference('light')).toBe(false)
    expect(mockRoot.classList.remove).toHaveBeenCalledWith('dark')
    expect(storageMap.get('hbu_theme_mode')).toBe('light')
  })

  it('initNightModeClass：无存储值默认 system，系统深色时应用 dark class（跟随系统）', async () => {
    matchMediaStub = makeMatchMedia(true) // 系统偏好深色
    const nm = await loadModule()

    expect(nm.initNightModeClass()).toBe(true)
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
    expect(storageMap.get('hbu_theme_mode')).toBeUndefined() // system 态不落盘用户偏好
  })

  it('initNightModeClass：system 态监听系统 change 事件即时切换（无需重启）', async () => {
    matchMediaStub = makeMatchMedia(false) // 初始浅色
    const nm = await loadModule()

    nm.initNightModeClass()
    expect(matchMediaStub.listenerCount()).toBe(1)

    // 系统切到深色 → 即时加深色 class
    matchMediaStub.emit(true)
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')

    // 系统切回浅色 → 即时移除
    matchMediaStub.emit(false)
    expect(mockRoot.classList.remove).toHaveBeenCalledWith('dark')
  })

  it('手动 light/dark 模式不跟随系统变化', async () => {
    matchMediaStub = makeMatchMedia(false)
    const nm = await loadModule()

    nm.initNightModeClass()
    nm.setNightModePreference('light')

    // 系统切到深色：手动白天模式不受影响
    matchMediaStub.emit(true)
    expect(mockRoot.classList.add).not.toHaveBeenCalledWith('dark')

    // 切回手动夜间后再跟随生效
    nm.setNightModePreference('dark')
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
  })

  it('resolveNightModeDark：设置页可据此决定动画方向（system 态解析系统值）', async () => {
    matchMediaStub = makeMatchMedia(true)
    const nm = await loadModule()

    expect(nm.resolveNightModeDark('dark')).toBe(true)
    expect(nm.resolveNightModeDark('light')).toBe(false)
    expect(nm.resolveNightModeDark('system')).toBe(true)

    matchMediaStub.emit(false)
    expect(nm.resolveNightModeDark('system')).toBe(false)
  })

  it('isNightModeEnabled 读 DOM dark class（语义不变）', async () => {
    const nm = await loadModule()
    expect(nm.isNightModeEnabled()).toBe(false)

    // 替换为带 dark class 的 document stub（新对象字面量，避免 Mock 类型逆变冲突）
    ;(globalThis as { document?: unknown }).document = {
      documentElement: {
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn((name: string) => name === 'dark')
        }
      }
    }
    expect(nm.isNightModeEnabled()).toBe(true)
  })

  it('window / matchMedia 缺失时不崩溃，system 态按浅色处理', async () => {
    ;(globalThis as { window?: unknown }).window = undefined
    const nm = await loadModule()

    expect(() => nm.initNightModeClass()).not.toThrow()
    expect(nm.initNightModeClass()).toBe(false)
    expect(mockRoot.classList.add).not.toHaveBeenCalledWith('dark')
  })

  it('localStorage 异常时不崩溃并回退 system', async () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => {
        throw new Error('storage unavailable')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0
    }
    const nm = await loadModule()

    expect(nm.getNightModePreference()).toBe('system')
    expect(() => nm.setNightModePreference('dark')).not.toThrow()
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
  })
})
