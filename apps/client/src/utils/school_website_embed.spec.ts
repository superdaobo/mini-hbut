import { afterEach, describe, expect, it, vi } from 'vitest'

const setWindowRuntime = ({
  protocol = 'https:',
  host = 'tauri.localhost',
  userAgent = 'Mozilla/5.0',
  tauriInternals = true
}: {
  protocol?: string
  host?: string
  userAgent?: string
  tauriInternals?: boolean
}) => {
  vi.resetModules()
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent },
    configurable: true
  })
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { protocol, host },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      ...(tauriInternals
        ? {
            __TAURI_INTERNALS__: { invoke: vi.fn() }
          }
        : {})
    },
    configurable: true
  })
}

describe('school website embed mode', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('uses tauri-webview on Tauri desktop', async () => {
    setWindowRuntime({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      tauriInternals: true
    })

    const { resolveSchoolWebsiteEmbedMode } = await import('./school_website_embed')

    await expect(resolveSchoolWebsiteEmbedMode()).resolves.toBe('tauri-webview')
  })

  it('uses proxy-iframe on Tauri iOS when bridge is reachable', async () => {
    setWindowRuntime({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      tauriInternals: true
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 }))
    )

    const { resolveSchoolWebsiteEmbedMode } = await import('./school_website_embed')

    await expect(resolveSchoolWebsiteEmbedMode()).resolves.toBe('proxy-iframe')
  })

  it('uses external-open on Tauri iOS when bridge is unreachable', async () => {
    setWindowRuntime({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      tauriInternals: true
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connection refused')
    }))

    const { resolveSchoolWebsiteEmbedMode } = await import('./school_website_embed')

    await expect(resolveSchoolWebsiteEmbedMode()).resolves.toBe('external-open')
  })

  it('uses external-open on Tauri Android without probing bridge', async () => {
    setWindowRuntime({
      userAgent:
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
      tauriInternals: true
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { resolveSchoolWebsiteEmbedMode } = await import('./school_website_embed')

    await expect(resolveSchoolWebsiteEmbedMode()).resolves.toBe('external-open')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('module bridge preview eligibility', () => {
  afterEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('enables local bridge preview on Tauri iOS', async () => {
    setWindowRuntime({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      tauriInternals: true
    })

    const { canUseLocalModuleBridgePreview } = await import('./more_modules.js')

    expect(canUseLocalModuleBridgePreview()).toBe(true)
  })

  it('disables local bridge preview on Tauri Android', async () => {
    setWindowRuntime({
      userAgent:
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
      tauriInternals: true
    })

    const { canUseLocalModuleBridgePreview } = await import('./more_modules.js')

    expect(canUseLocalModuleBridgePreview()).toBe(false)
  })
})
