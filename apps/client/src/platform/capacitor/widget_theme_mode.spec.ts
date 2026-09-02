// src/platform/capacitor/widget_theme_mode.spec.ts
// #758：writeThemeMode（应用主题模式 → 原生 Widget 存储）平台通路单测
//
// 通路设计：
// - Tauri Android：invokeNative('write_widget_theme_mode')（Rust 命令待补齐，未注册时 reject）
// - Capacitor：MiniHbutWidget.writeThemeMode（插件未实现该方法时 reject）
// - 桌面/Web：reject
// 调用方 widget_bridge.writeWidgetThemeMode 静默捕获全部失败。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/platform/native', () => ({
  isTauriRuntime: vi.fn(() => false),
  isCapacitorRuntime: vi.fn(() => false),
  invokeNative: vi.fn(async () => ({}))
}))

import { writeThemeMode } from './widget'
import { invokeNative, isCapacitorRuntime, isTauriRuntime } from '@/platform/native'

const mockTauri = vi.mocked(isTauriRuntime)
const mockCapacitor = vi.mocked(isCapacitorRuntime)
const mockInvoke = vi.mocked(invokeNative)

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36'

beforeEach(() => {
  mockTauri.mockReturnValue(false)
  mockCapacitor.mockReturnValue(false)
  mockInvoke.mockClear()
  vi.stubGlobal('navigator', { userAgent: ANDROID_UA })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('#758 writeThemeMode 平台通路', () => {
  it('Tauri Android：走 invokeNative("write_widget_theme_mode")', async () => {
    mockTauri.mockReturnValue(true)
    await expect(writeThemeMode('dark')).resolves.toBeUndefined()
    expect(mockInvoke).toHaveBeenCalledWith('write_widget_theme_mode', { mode: 'dark' })
  })

  it('Capacitor 且插件已实现 writeThemeMode：透传调用', async () => {
    mockCapacitor.mockReturnValue(true)
    const pluginWrite = vi.fn(async () => {})
    vi.stubGlobal('window', {
      Capacitor: { Plugins: { MiniHbutWidget: { writeThemeMode: pluginWrite } } }
    })
    await expect(writeThemeMode('light')).resolves.toBeUndefined()
    expect(pluginWrite).toHaveBeenCalledWith({ mode: 'light' })
  })

  it('Capacitor 但插件未实现 writeThemeMode：reject（由上层静默）', async () => {
    mockCapacitor.mockReturnValue(true)
    vi.stubGlobal('window', { Capacitor: { Plugins: { MiniHbutWidget: {} } } })
    await expect(writeThemeMode('light')).rejects.toThrow(/not implemented/)
  })

  it('window 未定义（SSR/Node）：reject', async () => {
    vi.stubGlobal('window', undefined)
    mockCapacitor.mockReturnValue(true)
    await expect(writeThemeMode('system')).rejects.toThrow(/not implemented|unavailable/)
  })

  it('桌面/Web 运行时：reject（由上层静默）', async () => {
    await expect(writeThemeMode('system')).rejects.toThrow(/unavailable/)
  })
})
