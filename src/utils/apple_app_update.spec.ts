import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAppStoreBuildOverrideForTests } from '../config/app_store_policy'
import {
  buildAppStoreOpenUrls,
  buildTestFlightOpenUrls,
  checkAppleStoreUpdate
} from './apple_app_update'

describe('apple_app_update', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    setAppStoreBuildOverrideForTests(true)
  })

  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('builds App Store and TestFlight open URLs', () => {
    const storeUrls = buildAppStoreOpenUrls({
      trackId: '123',
      trackViewUrl: 'https://apps.apple.com/app/id123'
    })
    expect(storeUrls[0]).toBe('https://apps.apple.com/app/id123')
    expect(storeUrls).toContain('itms-apps://apps.apple.com/app/id123')
    expect(buildTestFlightOpenUrls('123')).toContain('itms-beta://beta.itunes.apple.com/v1/app/123')
    expect(buildTestFlightOpenUrls()).toContain('itms-beta://')
  })

  it('reports update when store version is newer', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        resultCount: 1,
        results: [
          {
            version: '9.9.9',
            trackId: 424242,
            trackViewUrl: 'https://apps.apple.com/cn/app/id424242'
          }
        ]
      })
    })) as unknown as typeof fetch

    const result = await checkAppleStoreUpdate('1.0.0')
    expect(result.mode).toBe('apple_storefront')
    expect(result.hasUpdate).toBe(true)
    expect(result.storeVersion).toBe('9.9.9')
    expect(result.trackId).toBe('424242')
    expect(result.trackViewUrl).toContain('apps.apple.com')
  })

  it('reports no update when current is ahead of store (typical TestFlight)', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        resultCount: 1,
        results: [{ version: '1.4.0', trackId: 1, trackViewUrl: 'https://apps.apple.com/app/id1' }]
      })
    })) as unknown as typeof fetch

    const result = await checkAppleStoreUpdate('1.4.3')
    expect(result.hasUpdate).toBe(false)
    expect(result.storeVersion).toBe('1.4.0')
    expect(result.error).toBeFalsy()
  })

  it('handles empty store listing without falling back to github semantics', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ resultCount: 0, results: [] })
    })) as unknown as typeof fetch

    const result = await checkAppleStoreUpdate('1.0.0')
    expect(result.hasUpdate).toBe(false)
    expect(result.notOnStore).toBe(true)
    expect(result.message || '').toMatch(/TestFlight|正式版/)
  })

  it('rejects check when github updater is allowed (non compliance build)', async () => {
    setAppStoreBuildOverrideForTests(false)
    const result = await checkAppleStoreUpdate('1.0.0')
    expect(result.error).toBe(true)
    expect(result.hasUpdate).toBe(false)
  })
})
