import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SNAPSHOT_KEY = 'hbu_remote_config_snapshot'

const createMemoryStorage = () => {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    }
  }
}

describe('remote config snapshot persistence', () => {
  let storage: ReturnType<typeof createMemoryStorage>

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
    storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('prefers existing snapshot over package fallback and does not overwrite with package', async () => {
    const snapshotCfg = {
      announcements: { pinned: [], ticker: [], list: [], confirm: [] },
      force_update: { min_version: '', message: '', download_url: '' },
      chaoxing_class: { enabled: true, invite_code: '11112222' },
      ocr: { enabled: true, endpoint: 'https://example.com/api/ocr/recognize', endpoints: [] }
    }
    storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshotCfg))

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('remote down')
      })
    )

    const { fetchRemoteConfig } = await import('./remote_config.js')
    const cfg = await fetchRemoteConfig({ force: false })
    expect(cfg.chaoxing_class.invite_code).toBe('11112222')

    const raw = JSON.parse(storage.getItem(SNAPSHOT_KEY) || '{}')
    expect(raw.chaoxing_class?.invite_code).toBe('11112222')
  })

  it('writes snapshot when remote content differs', async () => {
    const oldSnap = {
      announcements: { pinned: [], ticker: [], list: [], confirm: [] },
      chaoxing_class: { invite_code: '11112222' }
    }
    storage.setItem(SNAPSHOT_KEY, JSON.stringify(oldSnap))

    const remotePayload = {
      announcements: { pinned: [], ticker: [], list: [], confirm: [] },
      force_update: { min_version: '', message: '', download_url: '' },
      chaoxing_class: { enabled: true, invite_code: '33334444' },
      ocr: {
        enabled: true,
        endpoint: 'https://mini-hbut-testocr1.hf.space/api/ocr/recognize',
        endpoints: ['https://mini-hbut-testocr1.hf.space/api/ocr/recognize']
      }
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => remotePayload
      }))
    )

    const { refreshRemoteConfigFromNetwork, remoteConfigFingerprint } = await import(
      './remote_config.js'
    )
    const result = await refreshRemoteConfigFromNetwork({ emitEvent: false })
    expect(result.changed).toBe(true)
    expect(result.source).toBe('remote')
    expect(result.config?.chaoxing_class?.invite_code).toBe('33334444')

    const stored = JSON.parse(storage.getItem(SNAPSHOT_KEY) || '{}')
    expect(remoteConfigFingerprint(stored)).toBe(remoteConfigFingerprint(remotePayload))
  })

  it('does not rewrite snapshot when remote content is identical', async () => {
    const payload = {
      announcements: { pinned: [], ticker: [], list: [], confirm: [] },
      force_update: { min_version: '', message: '', download_url: '' },
      chaoxing_class: { enabled: true, invite_code: '55556666' },
      ocr: {
        enabled: true,
        endpoint: 'https://mini-hbut-testocr1.hf.space/api/ocr/recognize',
        endpoints: ['https://mini-hbut-testocr1.hf.space/api/ocr/recognize'],
        local_fallback_endpoints: []
      }
    }

    const { normalizeRemoteConfig, remoteConfigFingerprint, refreshRemoteConfigFromNetwork } =
      await import('./remote_config.js')
    const normalized = normalizeRemoteConfig(payload)
    storage.setItem(SNAPSHOT_KEY, JSON.stringify(normalized))
    const fpBefore = remoteConfigFingerprint(normalized)

    let setCount = 0
    const origSet = storage.setItem.bind(storage)
    storage.setItem = (key: string, value: string) => {
      if (key === SNAPSHOT_KEY) setCount += 1
      return origSet(key, value)
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => payload
      }))
    )

    const result = await refreshRemoteConfigFromNetwork({ emitEvent: false })
    expect(result.changed).toBe(false)
    expect(result.source).toBe('remote')
    expect(setCount).toBe(0)
    expect(remoteConfigFingerprint(JSON.parse(storage.getItem(SNAPSHOT_KEY) || '{}'))).toBe(
      fpBefore
    )
  })

  it('exports stable fingerprint helper', async () => {
    const { remoteConfigFingerprint, normalizeRemoteConfig } = await import('./remote_config.js')
    const a = remoteConfigFingerprint({ chaoxing_class: { invite_code: '1' } })
    const b = remoteConfigFingerprint(normalizeRemoteConfig({ chaoxing_class: { invite_code: '1' } }))
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(10)
  })
})
