import { afterEach, describe, expect, it, vi } from 'vitest'

const setWindowRuntime = ({
  protocol = 'https:',
  host = 'localhost',
  userAgent = 'Mozilla/5.0',
  capacitor
}: {
  protocol?: string
  host?: string
  userAgent?: string
  capacitor?: unknown
}) => {
  vi.resetModules()
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent },
    configurable: true
  })
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { protocol, host },
      ...(capacitor ? { Capacitor: capacitor } : {})
    },
    configurable: true
  })
}

describe('detectRuntime', () => {
  afterEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'window')
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
