import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeNative = vi.fn()
const memoryStore = new Map<string, string>()

function installLocalStorageMock() {
  memoryStore.clear()
  const api = {
    getItem: (key: string) => (memoryStore.has(String(key)) ? memoryStore.get(String(key))! : null),
    setItem: (key: string, value: string) => {
      memoryStore.set(String(key), String(value))
    },
    removeItem: (key: string) => {
      memoryStore.delete(String(key))
    },
    clear: () => memoryStore.clear(),
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    get length() {
      return memoryStore.size
    }
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: api,
    configurable: true,
    writable: true
  })
}

vi.mock('../platform/native', () => ({
  isTauriRuntime: () => true,
  invokeNative: (...args: unknown[]) => invokeNative(...args)
}))

vi.mock('./encryption.js', () => ({
  encryptData: async (data: { password?: string }) =>
    JSON.stringify({ __enc: true, password: data?.password || '' }),
  decryptData: async (raw: string) => {
    const parsed = JSON.parse(raw)
    if (parsed?.__enc) return { password: parsed.password }
    return parsed
  }
}))

describe('credential_storage migrateLegacyCredential', () => {
  beforeEach(() => {
    installLocalStorageMock()
    invokeNative.mockReset()
  })

  it('does not remove legacy key when new store cannot verify password', async () => {
    const { migrateLegacyCredential, buildHbutAccountKey } = await import(
      './credential_storage.js'
    )

    localStorage.setItem('hbu_credentials', 'legacy-secret-pass')
    invokeNative.mockImplementation(async (cmd: string) => {
      if (cmd === 'save_remembered_credential') return
      if (cmd === 'load_remembered_credential') return ''
      return null
    })

    const setItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((k: string, v: string) => {
      if (String(k).startsWith('cred:')) return
      return setItem(k, v)
    }) as typeof localStorage.setItem

    await migrateLegacyCredential({
      legacyPasswordKey: 'hbu_credentials',
      accountKey: buildHbutAccountKey('2510231106')
    })

    expect(localStorage.getItem('hbu_credentials')).toBe('legacy-secret-pass')
  })

  it('removes legacy key only after verified dual-store read', async () => {
    const { migrateLegacyCredential, buildHbutAccountKey, loadRememberedCredential } =
      await import('./credential_storage.js')

    localStorage.setItem('hbu_credentials', 'legacy-ok-pass')
    const store = new Map<string, string>()
    invokeNative.mockImplementation(async (cmd: string, args?: { accountKey?: string; password?: string }) => {
      if (cmd === 'save_remembered_credential') {
        store.set(String(args?.accountKey || ''), String(args?.password || ''))
        return
      }
      if (cmd === 'load_remembered_credential') {
        return store.get(String(args?.accountKey || '')) || ''
      }
      return null
    })

    await migrateLegacyCredential({
      legacyPasswordKey: 'hbu_credentials',
      accountKey: buildHbutAccountKey('2510231106')
    })

    expect(localStorage.getItem('hbu_credentials')).toBeNull()
    const loaded = await loadRememberedCredential(buildHbutAccountKey('2510231106'))
    expect(loaded).toBe('legacy-ok-pass')
  })
})
