import { afterEach, describe, expect, it, vi } from 'vitest'

type NavigatorLike = {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
}

const setWindowRuntime = ({
  protocol = 'https:',
  host = 'localhost',
  userAgent = 'Mozilla/5.0',
  platform,
  maxTouchPoints,
  capacitor
}: {
  protocol?: string
  host?: string
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
  capacitor?: unknown
}) => {
  vi.resetModules()
  const nav: NavigatorLike = { userAgent }
  if (platform !== undefined) nav.platform = platform
  if (maxTouchPoints !== undefined) nav.maxTouchPoints = maxTouchPoints
  Object.defineProperty(globalThis, 'navigator', {
    value: nav,
    configurable: true
  })
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { protocol, host },
      navigator: nav,
      ...(capacitor ? { Capacitor: capacitor } : {})
    },
    configurable: true
  })
}

const clearWindowRuntime = () => {
  vi.resetModules()
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'navigator')
}

describe('detectRuntime', () => {
  afterEach(() => {
    clearWindowRuntime()
  })

  it('does not treat a generic Android WebView on localhost as Capacitor without a bridge', async () => {
    setWindowRuntime({
      protocol: 'https:',
      host: 'localhost',
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel Build/TQ3A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 wv)'
    })

    const { detectRuntime } = await import('./runtime')

    expect(detectRuntime()).toBe('web')
  })

  it('detects packaged Capacitor only when the native bridge is present', async () => {
    setWindowRuntime({
      protocol: 'https:',
      host: 'localhost',
      userAgent:
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 wv)',
      capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android'
      }
    })

    const { detectRuntime } = await import('./runtime')

    expect(detectRuntime()).toBe('capacitor')
  })
})

describe('平台判断 API（runtime.ts 单一来源）', () => {
  afterEach(() => {
    clearWindowRuntime()
  })

  it('isIOSLike 识别 iPhone / iPad / iPod UA', async () => {
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    const { isIOSLike } = await import('./runtime')
    expect(isIOSLike()).toBe(true)

    clearWindowRuntime()
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X)' })
    const mod = await import('./runtime')
    expect(mod.isIOSLike()).toBe(true)

    clearWindowRuntime()
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)' })
    expect((await import('./runtime')).isIOSLike()).toBe(true)
  })

  it('isIOSLike 识别 iPadOS 桌面伪装（MacIntel + 触摸）', async () => {
    setWindowRuntime({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5
    })
    const { isIOSLike } = await import('./runtime')
    expect(isIOSLike()).toBe(true)
  })

  it('isIOSLike 对 Mac 桌面（无触摸）返回 false', async () => {
    setWindowRuntime({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })
    const { isIOSLike } = await import('./runtime')
    expect(isIOSLike()).toBe(false)
  })

  it('isAndroidLike 识别 Android UA（大小写不敏感）', async () => {
    setWindowRuntime({
      userAgent: 'Mozilla/5.0 (Linux; ANDROID 13; Pixel) AppleWebKit/537.36 Mobile'
    })
    const { isAndroidLike } = await import('./runtime')
    expect(isAndroidLike()).toBe(true)

    clearWindowRuntime()
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
    expect((await import('./runtime')).isAndroidLike()).toBe(false)
  })

  it('isDesktopLike 对桌面 UA 返回 true，对移动 UA 返回 false', async () => {
    setWindowRuntime({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'
    })
    const { isDesktopLike } = await import('./runtime')
    expect(isDesktopLike()).toBe(true)

    clearWindowRuntime()
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    expect((await import('./runtime')).isDesktopLike()).toBe(false)
  })

  it('isMobileLike 覆盖 iOS 与 Android', async () => {
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    const { isMobileLike } = await import('./runtime')
    expect(isMobileLike()).toBe(true)

    clearWindowRuntime()
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (Linux; Android 13)' })
    expect((await import('./runtime')).isMobileLike()).toBe(true)

    clearWindowRuntime()
    setWindowRuntime({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
    expect((await import('./runtime')).isMobileLike()).toBe(false)
  })

  it('SSR（无 window）时全部返回 false', async () => {
    Reflect.deleteProperty(globalThis, 'window')
    const { isIOSLike, isAndroidLike, isDesktopLike, isMobileLike } = await import('./runtime')
    expect(isIOSLike()).toBe(false)
    expect(isAndroidLike()).toBe(false)
    expect(isDesktopLike()).toBe(true) // 非 iOS 且非 Android → 桌面
    expect(isMobileLike()).toBe(false)
  })
})
