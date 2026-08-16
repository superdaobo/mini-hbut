import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppStoreBuildOverrideForTests } from '../config/app_store_policy'
import { checkForUpdates } from './updater.js'

describe('updater app store gate', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
    vi.restoreAllMocks()
  })

  it('short-circuits checkForUpdates on compliance builds without network', async () => {
    setAppStoreBuildOverrideForTests(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('network should not be used')
    })

    const result = await checkForUpdates('1.0.0')
    expect(result.mode).toBe('apple_storefront')
    expect(result.hasUpdate).toBe(false)
    expect(result.message || '').toMatch(/App Store|TestFlight/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
