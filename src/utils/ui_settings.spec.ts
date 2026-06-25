import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyUiSettings, normalizeSettings } from './ui_settings'

vi.mock('./widget_bridge', () => ({
  writeWidgetThemeColor: vi.fn()
}))

describe('applyUiSettings night mode isolation', () => {
  let attributes: Record<string, string>
  let stored: Record<string, string>
  let mockRoot: {
    style: { setProperty: ReturnType<typeof vi.fn> }
    classList: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
    setAttribute: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    attributes = {}
    stored = {}
    mockRoot = {
      style: { setProperty: vi.fn() },
      classList: { add: vi.fn(), remove: vi.fn() },
      setAttribute: vi.fn((key: string, value: string) => {
        attributes[key] = value
      })
    }

    globalThis.document = {
      documentElement: mockRoot,
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({
        id: '',
        type: '',
        textContent: '',
        remove: vi.fn()
      })),
      head: { appendChild: vi.fn() },
      body: { appendChild: vi.fn() }
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

  it('应用任意 UI 预设时不应改写夜晚模式类名', () => {
    applyUiSettings(normalizeSettings({ preset: 'campus_blue' }))

    expect(attributes['data-theme']).toBe('campus_blue')
    expect(mockRoot.classList.add).not.toHaveBeenCalledWith('dark')
    expect(mockRoot.classList.remove).not.toHaveBeenCalledWith('dark')
    expect(stored.hbu_dark_mode).toBeUndefined()
  })

  it('应用暗色分类预设时也不应覆盖独立夜晚模式开关', () => {
    applyUiSettings(normalizeSettings({ preset: 'graphite_night' }))

    expect(attributes['data-theme']).toBe('graphite_night')
    expect(mockRoot.classList.add).not.toHaveBeenCalledWith('dark')
    expect(mockRoot.classList.remove).not.toHaveBeenCalledWith('dark')
    expect(stored.hbu_dark_mode).toBeUndefined()
  })

  it('夜晚模式开启时应注入暗色语义 token，即使用户选择的是亮色预设', () => {
    stored.hbu_dark_mode = '1'
    mockRoot.classList.contains = vi.fn((className: string) => className === 'dark')

    applyUiSettings(normalizeSettings({ preset: 'campus_blue' }))

    const setProperty = mockRoot.style.setProperty
    expect(setProperty).toHaveBeenCalledWith('--ui-text', '#e2e8f0')
    expect(setProperty).toHaveBeenCalledWith('--ui-muted', '#94a3b8')
    expect(setProperty).toHaveBeenCalledWith(
      '--ui-surface',
      expect.stringContaining('15, 23, 42')
    )
  })
})
