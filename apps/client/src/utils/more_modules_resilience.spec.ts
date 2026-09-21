import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  isCapacitor: vi.fn(() => false)
}))

vi.mock('../platform/native', () => ({
  getNativeAppVersion: vi.fn(async () => '1.4.11'),
  isCapacitorRuntime: mocks.isCapacitor,
  isLikelyAndroidUserAgent: vi.fn(() => true),
  isTauriRuntime: mocks.isTauri,
  toNativeFileSrc: vi.fn((value: string) => value)
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke
}))

import {
  deleteCachedManifestSnapshot,
  pickFirstReachableUrl,
  readCachedManifestSnapshot,
  writeCachedManifestSnapshot
} from './more_modules.js'

const createStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear()
  }
}

describe('#883 remote module resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', createStorage())
    mocks.isTauri.mockReturnValue(true)
    mocks.isCapacitor.mockReturnValue(false)
  })

  it('Tauri probes HTTP status and skips a 404 primary URL for a healthy fallback', async () => {
    const probe = vi.fn(async (url: string) => !url.includes('primary.example'))
    const selected = await pickFirstReachableUrl(
      [
        'https://primary.example/modules/game/site/index.html',
        'https://fallback.example/modules/game/site/index.html'
      ],
      probe
    )

    expect(selected).toBe('https://fallback.example/modules/game/site/index.html')
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('returns no iframe URL when every native probe reports unavailable', async () => {
    await expect(
      pickFirstReachableUrl(
        [
          'https://primary.example/old/site/index.html',
          'https://fallback.example/old/site/index.html'
        ],
        async () => false
      )
    ).resolves.toBe('')
  })

  it('can invalidate a cached manifest that points to a pruned version', () => {
    const url = 'https://hbut.6661111.xyz/modules/main/hbut_2048/manifest.json'
    writeCachedManifestSnapshot({
      url,
      module_id: 'hbut_2048',
      module_name: '2048 湖工大版',
      version: 'old-version',
      package_url: 'https://hbut.6661111.xyz/modules/main/hbut_2048/old-version/bundle.zip',
      open_url: 'https://hbut.6661111.xyz/modules/main/hbut_2048/old-version/site/index.html'
    })

    expect(readCachedManifestSnapshot(url)?.version).toBe('old-version')
    expect(deleteCachedManifestSnapshot(url)).toBe(true)
    expect(readCachedManifestSnapshot(url)).toBeNull()
  })
})
