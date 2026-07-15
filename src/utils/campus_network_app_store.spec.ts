import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppStoreBuildOverrideForTests } from '../config/app_store_policy'

vi.mock('../platform/native', () => ({
  isTauriRuntime: () => true,
  invokeNative: vi.fn(async () => {
    throw new Error('should not invoke when App Store policy blocks auto-login')
  })
}))

vi.mock('./credential_storage', () => ({
  buildCampusAccountKey: (id: string) => `campus:${id}`,
  loadRememberedCredential: vi.fn(async () => 'secret'),
  saveRememberedCredential: vi.fn(async () => {})
}))

vi.mock('./campus_network_settings', () => ({
  readCampusNetworkSettings: () => ({
    auto_login: true,
    gateway_override: '',
    carrier: 'cmcc',
    remember_password: true
  }),
  writeCampusNetworkSettings: vi.fn()
}))

describe('runCampusNetworkAutoLogin App Store gate', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
    vi.resetModules()
  })

  it('flag on: never attempts auto login even when settings/password present', async () => {
    setAppStoreBuildOverrideForTests(true)
    const native = await import('../platform/native')
    const { runCampusNetworkAutoLogin } = await import('./campus_network_service')
    const result = await runCampusNetworkAutoLogin({
      studentId: '2026000001',
      reason: 'test'
    })
    expect(result).toBeNull()
    expect(native.invokeNative).not.toHaveBeenCalled()
  })
})
