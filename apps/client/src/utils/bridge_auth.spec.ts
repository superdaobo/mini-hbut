import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeNativeMock = vi.fn()
const isTauriRuntimeMock = vi.fn()

vi.mock('../platform/native', () => ({
  invokeNative: (...args: unknown[]) => invokeNativeMock(...args),
  isTauriRuntime: () => isTauriRuntimeMock()
}))

const loadModule = async () => {
  vi.resetModules()
  return import('./bridge_auth')
}

describe('bridge_auth（#1163 T02 令牌注入）', () => {
  beforeEach(() => {
    invokeNativeMock.mockReset()
    isTauriRuntimeMock.mockReset()
  })

  it('非 Tauri 运行时不取令牌、不加头、不调用原生命令', async () => {
    isTauriRuntimeMock.mockReturnValue(false)
    const { getBridgeSessionToken, withBridgeAuthHeaders } = await loadModule()

    expect(await getBridgeSessionToken()).toBeNull()
    expect(await withBridgeAuthHeaders({ 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json'
    })
    expect(invokeNativeMock).not.toHaveBeenCalled()
  })

  it('取到令牌后加到 Authorization，且只取一次（进程内缓存）', async () => {
    isTauriRuntimeMock.mockReturnValue(true)
    invokeNativeMock.mockResolvedValue('token-abc')
    const { getBridgeSessionToken, withBridgeAuthHeaders } = await loadModule()

    expect(await getBridgeSessionToken()).toBe('token-abc')
    expect(await withBridgeAuthHeaders({ 'X-A': '1' })).toEqual({
      'X-A': '1',
      Authorization: 'Bearer token-abc'
    })
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
    expect(invokeNativeMock).toHaveBeenCalledWith('bridge_session_token')
  })

  it('并发调用只触发一次原生命令', async () => {
    isTauriRuntimeMock.mockReturnValue(true)
    let resolveInvoke: (value: string | null) => void = () => {}
    invokeNativeMock.mockImplementation(
      () => new Promise<string | null>((resolve) => {
        resolveInvoke = resolve
      })
    )
    const { getBridgeSessionToken } = await loadModule()

    const first = getBridgeSessionToken()
    const second = getBridgeSessionToken()
    resolveInvoke('token-concurrent')

    expect(await first).toBe('token-concurrent')
    expect(await second).toBe('token-concurrent')
    expect(invokeNativeMock).toHaveBeenCalledTimes(1)
  })

  it('命令失败或返回空值时不抛错、不加头', async () => {
    isTauriRuntimeMock.mockReturnValue(true)
    invokeNativeMock.mockRejectedValue(new Error('仅主窗口'))
    const failed = await loadModule()
    expect(await failed.getBridgeSessionToken()).toBeNull()
    expect(await failed.withBridgeAuthHeaders(undefined)).toEqual({})

    invokeNativeMock.mockReset()
    invokeNativeMock.mockResolvedValue('   ')
    const blank = await loadModule()
    expect(await blank.getBridgeSessionToken()).toBeNull()
  })

  it('bridgeFetch 遇到 401 会清缓存，下次重新取令牌', async () => {
    isTauriRuntimeMock.mockReturnValue(true)
    invokeNativeMock.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2')
    const { bridgeFetch, getBridgeSessionToken } = await loadModule()

    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await bridgeFetch('http://127.0.0.1:4399/sync_grades', { method: 'GET' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer token-1')

    // 401 已清缓存：下一次调用会重新执行原生命令
    expect(await getBridgeSessionToken()).toBe('token-2')
    vi.unstubAllGlobals()
  })

  it('令牌只驻留内存：不写 storage、不进 URL', async () => {
    isTauriRuntimeMock.mockReturnValue(true)
    invokeNativeMock.mockResolvedValue('token-memory-only')
    const { bridgeFetch } = await loadModule()

    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() })
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await bridgeFetch('http://127.0.0.1:4399/health')

    expect(setItem).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain('token-memory-only')
    expect(JSON.stringify(init.url ?? '')).not.toContain('token-memory-only')
    vi.unstubAllGlobals()
  })
})
