import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CAMPUS_CARRIER_OPTIONS,
  DEFAULT_CAMPUS_NETWORK_SETTINGS,
  HBUT_CAMPUS_GATEWAYS,
  readCampusNetworkSettings,
  writeCampusNetworkSettings,
  campusStatusLabel
} from './campus_network_settings'
import {
  resetCampusNetworkAutoLoginStateForTests,
  runCampusNetworkAutoLogin
} from './campus_network_service'

vi.mock('../platform/native', () => ({
  isTauriRuntime: vi.fn(() => false),
  invokeNative: vi.fn()
}))

describe('campus network settings', () => {
  let stored: Record<string, string>

  beforeEach(() => {
    stored = {}
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
    delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
  })

  it('returns defaults when storage is empty', () => {
    expect(readCampusNetworkSettings()).toEqual(DEFAULT_CAMPUS_NETWORK_SETTINGS)
  })

  it('persists carrier and auto_login', () => {
    writeCampusNetworkSettings({ carrier: 'cmcc', auto_login: true })
    const saved = readCampusNetworkSettings()
    expect(saved.carrier).toBe('cmcc')
    expect(saved.auto_login).toBe(true)
  })

  it('maps status labels for UI', () => {
    expect(campusStatusLabel('authenticated')).toBe('已连接')
    expect(campusStatusLabel('needs_auth')).toBe('需要认证')
  })

  it('exposes four carrier options', () => {
    expect(CAMPUS_CARRIER_OPTIONS.map((item) => item.id)).toEqual([
      'campus',
      'cmcc',
      'cucc',
      'ctcc'
    ])
  })

  it('ships HBUT gateway presets', () => {
    expect(HBUT_CAMPUS_GATEWAYS).toContain('http://172.16.54.18')
    expect(HBUT_CAMPUS_GATEWAYS.length).toBeGreaterThanOrEqual(5)
  })
})

describe('campus network navigation contract', () => {
  it('registers campus_network in ME_SUB_VIEWS and parent map', () => {
    const navSource = readFileSync(resolve(process.cwd(), 'src/navigation/app_navigation.ts'), 'utf8')
    expect(navSource).toMatch(/ME_SUB_VIEWS\s*=\s*\[[\s\S]*'campus_network'/)
    expect(navSource).toMatch(/campus_network:\s*'me'/)
    expect(navSource).toMatch(/LOGIN_REQUIRED_ME_VIEWS\s*=\s*\[[\s\S]*'campus_network'/)
  })

  it('shows campus network entry only when logged in and policy allows', () => {
    const meSource = readFileSync(resolve(process.cwd(), 'src/components/MeView.vue'), 'utf8')
    // App Store 策略：showCampusNetwork = isLoggedIn && isViewAllowed('campus_network')
    expect(meSource).toContain('showCampusNetwork')
    expect(meSource).toContain('v-if="showCampusNetwork"')
    expect(meSource).toContain('@click="handleOpenCampusNetwork"')
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    expect(appSource).toContain("currentView === 'campus_network' && isLoggedIn")
  })

  it('adds Me page entry for campus network', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/MeView.vue'), 'utf8')
    expect(source).toContain("handleOpenCampusNetwork")
    expect(source).toContain('校园网')
  })
})

describe('campus network credential prefix', () => {
  it('builds campus account keys', async () => {
    const { buildCampusAccountKey, CAMPUS_CREDENTIAL_PREFIX } = await import('./credential_storage.js')
    expect(CAMPUS_CREDENTIAL_PREFIX).toBe('campus:')
    expect(buildCampusAccountKey('2024123456')).toBe('campus:2024123456')
  })
})

describe('campus network auto login', () => {
  beforeEach(() => {
    globalThis.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0
    } as unknown as Storage
    resetCampusNetworkAutoLoginStateForTests()
  })

  afterEach(() => {
    delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
  })

  it('skips when auto_login is disabled', async () => {
    writeCampusNetworkSettings({ auto_login: false })
    const result = await runCampusNetworkAutoLogin({ studentId: '2024123456' })
    expect(result).toBeNull()
  })
})
