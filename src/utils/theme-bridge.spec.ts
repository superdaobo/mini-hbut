/**
 * theme-bridge 单元测试
 *
 * 验证 hexToHsl、transformPresetToAppleDesign、applyThemePreset、initThemeBridge 的核心逻辑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hexToHsl, transformPresetToAppleDesign, applyThemePreset, initThemeBridge } from './theme-bridge'
import { UI_PRESETS } from '@/config/ui_settings'
import type { UiPreset } from '@/config/ui_settings'

// ============================================================
// hexToHsl 测试
// ============================================================
describe('hexToHsl', () => {
  it('应将纯黑 #000000 转换为 "0 0% 0%"', () => {
    expect(hexToHsl('#000000')).toBe('0 0% 0%')
  })

  it('应将纯白 #ffffff 转换为 "0 0% 100%"', () => {
    expect(hexToHsl('#ffffff')).toBe('0 0% 100%')
  })

  it('应将纯红 #ff0000 转换为 "0 100% 50%"', () => {
    expect(hexToHsl('#ff0000')).toBe('0 100% 50%')
  })

  it('应将纯绿 #00ff00 转换为 "120 100% 50%"', () => {
    expect(hexToHsl('#00ff00')).toBe('120 100% 50%')
  })

  it('应将纯蓝 #0000ff 转换为 "240 100% 50%"', () => {
    expect(hexToHsl('#0000ff')).toBe('240 100% 50%')
  })

  it('应将 Apple primary #0066cc 转换为正确的 HSL', () => {
    // #0066cc → R=0, G=102, B=204 → H=210, S=100%, L=40%
    expect(hexToHsl('#0066cc')).toBe('210 100% 40%')
  })

  it('应将 Apple primary-on-dark #2997ff 转换为正确的 HSL', () => {
    // #2997ff → R=41, G=151, B=255 → H≈209, S=100%, L≈58%
    const result = hexToHsl('#2997ff')
    expect(result).toMatch(/^2\d{2} 100% 5[78]%$/)
  })

  it('应支持不带 # 前缀的 hex 值', () => {
    expect(hexToHsl('000000')).toBe('0 0% 0%')
    expect(hexToHsl('ffffff')).toBe('0 0% 100%')
  })

  it('应支持 3 位 hex 缩写', () => {
    expect(hexToHsl('#fff')).toBe('0 0% 100%')
    expect(hexToHsl('#000')).toBe('0 0% 0%')
    expect(hexToHsl('#f00')).toBe('0 100% 50%')
  })

  it('应对无效输入返回 "0 0% 0%" 并 console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(hexToHsl('')).toBe('0 0% 0%')
    expect(hexToHsl('invalid')).toBe('0 0% 0%')
    expect(hexToHsl('#gggggg')).toBe('0 0% 0%')
    expect(hexToHsl(null as unknown as string)).toBe('0 0% 0%')
    expect(hexToHsl(undefined as unknown as string)).toBe('0 0% 0%')

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ============================================================
// transformPresetToAppleDesign 测试
// ============================================================
describe('transformPresetToAppleDesign', () => {
  const REQUIRED_KEYS = [
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--border',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--destructive',
    '--destructive-foreground',
    '--radius',
  ]

  it('应为 light 类别预设返回所有必需的 CSS 变量键', () => {
    const preset = UI_PRESETS.campus_blue
    const result = transformPresetToAppleDesign(preset)

    for (const key of REQUIRED_KEYS) {
      expect(result).toHaveProperty(key)
      expect(result[key]).toBeTruthy()
    }
  })

  it('应为 dark 类别预设返回所有必需的 CSS 变量键', () => {
    const preset = UI_PRESETS.graphite_night
    const result = transformPresetToAppleDesign(preset)

    for (const key of REQUIRED_KEYS) {
      expect(result).toHaveProperty(key)
      expect(result[key]).toBeTruthy()
    }
  })

  it('light 类别预设的 --primary 应为 #0066cc 的 HSL 等价值', () => {
    const preset = UI_PRESETS.campus_blue
    const result = transformPresetToAppleDesign(preset)
    expect(result['--primary']).toBe(hexToHsl('#0066cc'))
  })

  it('dark 类别预设的 --primary 应为 #2997ff 的 HSL 等价值', () => {
    const preset = UI_PRESETS.graphite_night
    const result = transformPresetToAppleDesign(preset)
    expect(result['--primary']).toBe(hexToHsl('#2997ff'))
  })

  it('light 类别预设的 --background 应为 #f5f5f7 的 HSL 等价值', () => {
    const preset = UI_PRESETS.campus_blue
    const result = transformPresetToAppleDesign(preset)
    expect(result['--background']).toBe(hexToHsl('#f5f5f7'))
  })

  it('dark 类别预设的 --background 应为 #272729 的 HSL 等价值', () => {
    const preset = UI_PRESETS.graphite_night
    const result = transformPresetToAppleDesign(preset)
    expect(result['--background']).toBe(hexToHsl('#272729'))
  })

  it('light 类别预设的 --card 应为 #ffffff 的 HSL 等价值', () => {
    const preset = UI_PRESETS.campus_blue
    const result = transformPresetToAppleDesign(preset)
    expect(result['--card']).toBe(hexToHsl('#ffffff'))
  })

  it('dark 类别预设的 --card 应为 #2a2a2c 的 HSL 等价值', () => {
    const preset = UI_PRESETS.graphite_night
    const result = transformPresetToAppleDesign(preset)
    expect(result['--card']).toBe(hexToHsl('#2a2a2c'))
  })

  it('vivid 类别预设应使用 light 模式的 Apple 设计规范', () => {
    const preset = UI_PRESETS.forest_mint
    const result = transformPresetToAppleDesign(preset)
    expect(result['--primary']).toBe(hexToHsl('#0066cc'))
    expect(result['--background']).toBe(hexToHsl('#f5f5f7'))
    expect(result['--card']).toBe(hexToHsl('#ffffff'))
  })

  it('neutral 类别预设应使用 light 模式的 Apple 设计规范', () => {
    const preset = UI_PRESETS.minimal_slate
    const result = transformPresetToAppleDesign(preset)
    expect(result['--primary']).toBe(hexToHsl('#0066cc'))
    expect(result['--background']).toBe(hexToHsl('#f5f5f7'))
    expect(result['--card']).toBe(hexToHsl('#ffffff'))
  })

  it('--radius 应为 "0.6875rem"', () => {
    const preset = UI_PRESETS.campus_blue
    const result = transformPresetToAppleDesign(preset)
    expect(result['--radius']).toBe('0.6875rem')
  })

  it('所有 HSL 值应匹配 "H S% L%" 格式', () => {
    const hslPattern = /^\d{1,3} \d{1,3}% \d{1,3}%$/
    const preset = UI_PRESETS.campus_blue
    const result = transformPresetToAppleDesign(preset)

    for (const [key, value] of Object.entries(result)) {
      if (key === '--radius') continue // radius 不是 HSL 格式
      expect(value, `${key} 应为有效 HSL 格式`).toMatch(hslPattern)
    }
  })
})

// ============================================================
// applyThemePreset 测试（需要 DOM 模拟）
// ============================================================
describe('applyThemePreset', () => {
  let mockRoot: {
    style: { setProperty: ReturnType<typeof vi.fn> }
    classList: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  }

  beforeEach(() => {
    mockRoot = {
      style: { setProperty: vi.fn() },
      classList: { add: vi.fn(), remove: vi.fn() },
    }
    // @ts-expect-error - 模拟 document.documentElement
    globalThis.document = { documentElement: mockRoot }
  })

  afterEach(() => {
    // @ts-expect-error - 清理模拟
    delete globalThis.document
  })

  it('应为有效的 light 预设设置 CSS 变量并移除 dark class', () => {
    applyThemePreset('campus_blue')

    expect(mockRoot.style.setProperty).toHaveBeenCalled()
    expect(mockRoot.classList.remove).toHaveBeenCalledWith('dark')
    expect(mockRoot.classList.add).not.toHaveBeenCalledWith('dark')
  })

  it('应为有效的 dark 预设设置 CSS 变量并添加 dark class', () => {
    applyThemePreset('graphite_night')

    expect(mockRoot.style.setProperty).toHaveBeenCalled()
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
  })

  it('应为无效预设键回退到 campus_blue 并 console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    applyThemePreset('nonexistent_preset')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('未知预设')
    )
    // 回退后仍应设置 CSS 变量
    expect(mockRoot.style.setProperty).toHaveBeenCalled()
    expect(mockRoot.classList.remove).toHaveBeenCalledWith('dark')

    warnSpy.mockRestore()
  })

  it('应设置所有 16 个 CSS 变量', () => {
    applyThemePreset('campus_blue')

    // 16 个变量 = 15 个 HSL + 1 个 radius
    expect(mockRoot.style.setProperty).toHaveBeenCalledTimes(16)
  })
})

// ============================================================
// initThemeBridge 测试
// ============================================================
describe('initThemeBridge', () => {
  let mockRoot: {
    style: { setProperty: ReturnType<typeof vi.fn> }
    classList: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  }
  let mockLocalStorage: Record<string, string>
  let mockMatchMedia: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockRoot = {
      style: { setProperty: vi.fn() },
      classList: { add: vi.fn(), remove: vi.fn() },
    }
    mockLocalStorage = {}
    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    })

    // @ts-expect-error - 模拟全局对象
    globalThis.document = { documentElement: mockRoot }
    // @ts-expect-error - 模拟 window
    globalThis.window = { matchMedia: mockMatchMedia }
    // @ts-expect-error - 模拟 localStorage
    globalThis.localStorage = {
      getItem: (key: string) => mockLocalStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockLocalStorage[key] = value },
      removeItem: (key: string) => { delete mockLocalStorage[key] },
    }
  })

  afterEach(() => {
    // @ts-expect-error - 清理
    delete globalThis.document
    // @ts-expect-error - 清理
    delete globalThis.window
    // @ts-expect-error - 清理
    delete globalThis.localStorage
  })

  it('应在有持久化偏好时使用该偏好', () => {
    mockLocalStorage['hbu_ui_settings_v2'] = JSON.stringify({ preset: 'graphite_night' })

    initThemeBridge()

    // dark 预设应添加 dark class
    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
  })

  it('应在无持久化偏好且 OS 为 dark 时使用 dark 预设', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
    })

    initThemeBridge()

    expect(mockRoot.classList.add).toHaveBeenCalledWith('dark')
  })

  it('应在无持久化偏好且 OS 为 light 时使用默认 light 预设', () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    })

    initThemeBridge()

    expect(mockRoot.classList.remove).toHaveBeenCalledWith('dark')
  })

  it('应在 localStorage 读取失败时不崩溃', () => {
    // @ts-expect-error - 模拟读取异常
    globalThis.localStorage = {
      getItem: () => { throw new Error('Storage error') },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    expect(() => initThemeBridge()).not.toThrow()
    // 应回退到默认主题
    expect(mockRoot.style.setProperty).toHaveBeenCalled()
  })

  it('应在 matchMedia 不可用时不崩溃', () => {
    // @ts-expect-error - 模拟 matchMedia 不可用
    globalThis.window = {}

    expect(() => initThemeBridge()).not.toThrow()
    expect(mockRoot.style.setProperty).toHaveBeenCalled()
  })
})
