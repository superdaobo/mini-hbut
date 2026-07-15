import { afterEach, describe, expect, it } from 'vitest'
import { setAppStoreBuildOverrideForTests } from '../config/app_store_policy'
import { applyAppStoreRemoteConfigClamp, normalizeRemoteConfig } from './remote_config.js'

describe('remote_config App Store clamp', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
  })

  it('flag off: does not empty module_center from remote-like payload', () => {
    setAppStoreBuildOverrideForTests(false)
    const normalized = normalizeRemoteConfig({
      module_center: {
        channel: 'main',
        modules: [{ id: 'jump_out_hbut', name: 'game', kind: 'remote' }]
      },
      resource_share: { enabled: true },
      forum: { enabled: true },
      cloud_sync: { enabled: true }
    })
    const clamped = applyAppStoreRemoteConfigClamp(normalized)
    expect(clamped.module_center.modules.length).toBeGreaterThan(0)
    expect(clamped.resource_share.enabled).toBe(true)
    expect(clamped.forum.enabled).toBe(true)
  })

  it('flag on: keeps fetch-shaped config but locks dangerous capabilities', () => {
    setAppStoreBuildOverrideForTests(true)
    const normalized = normalizeRemoteConfig({
      announcements: {
        ticker: [{ id: 't1', title: 'ok', summary: 's', content: 'c', updated_at: '2026-01-01' }]
      },
      module_center: {
        channel: 'main',
        modules: [
          { id: 'jump_out_hbut', name: 'game' },
          { id: 'hbut_2048', name: '2048' }
        ]
      },
      resource_share: { enabled: true, endpoint: 'https://example.com' },
      forum: { enabled: true },
      chaoxing_class: { enabled: true, invite_code: '123' },
      ai_models: [{ label: 'x', value: 'y' }],
      config_admin_ids: ['2026000001'],
      cloud_sync: { enabled: true },
      ocr: {
        endpoints: ['https://example.com/ocr', 'http://1.2.3.4/ocr'],
        local_fallback_endpoints: ['http://1.2.3.4/ocr', 'https://example.com/ocr']
      }
    })
    const clamped = applyAppStoreRemoteConfigClamp(normalized)
    expect(clamped.announcements.ticker.length).toBeGreaterThan(0)
    expect(clamped.module_center.modules).toEqual([])
    expect(clamped.resource_share.enabled).toBe(false)
    expect(clamped.forum.enabled).toBe(false)
    expect(clamped.chaoxing_class.enabled).toBe(false)
    expect(clamped.ai_models).toEqual([])
    expect(clamped.config_admin_ids).toEqual([])
    expect(clamped.cloud_sync.enabled).toBe(false)
    expect(clamped.ocr.local_fallback_endpoints.every((u) => String(u).startsWith('https://'))).toBe(
      true
    )
  })
})
