import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applyNightModePreference,
  initNightModeClass,
  isNightModeEnabled
} from './night_mode'

describe('night mode helpers', () => {
  let stored: Record<string, string>
  let mockRoot: {
    classList: {
      add: ReturnType<typeof vi.fn>
      remove: ReturnType<typeof vi.fn>
      contains: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    stored = {}
    mockRoot = {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false)
      }
    }

    globalThis.document = {
      documentElement: mockRoot
    } as unknown as Document

    globalThis.localStorage = {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value
      },
      removeItem: (key: string) => {
        delete stored[key]
      },
      clear: () => {
        stored = {}
      },
      key: vi.fn(),
      length: 0
    } as unknown as Storage
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete (globalThis as typeof globalThis & { document?: Document }).document
    delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
  })

  it('启用夜晚模式时应添加 html.dark 并写入偏好', () => {
    applyNightModePreference(true)

    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
    expect(mockRoot.classList.remove).not.toHaveBeenCalledWith('dark')
    expect(stored.hbu_dark_mode).toBe('1')
  })

  it('关闭夜晚模式时应移除 html.dark 并写入偏好', () => {
    applyNightModePreference(false)

    expect(mockRoot.classList.remove).toHaveBeenCalledWith('dark')
    expect(mockRoot.classList.add).not.toHaveBeenCalledWith('dark')
    expect(stored.hbu_dark_mode).toBe('0')
  })

  it('初始化时应根据持久化偏好恢复夜晚模式', () => {
    stored.hbu_dark_mode = '1'

    expect(initNightModeClass()).toBe(true)
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
  })

  it('读取当前夜晚模式状态时应优先使用 html.dark', () => {
    mockRoot.classList.contains = vi.fn((name: string) => name === 'dark')

    expect(isNightModeEnabled()).toBe(true)
  })
})
