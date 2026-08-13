import { afterEach, describe, expect, it, vi } from 'vitest'

// #609 旧状态兼容测试：getBackgroundFetchRuntimeState 在不同 runtime 下的真实语义
// - Tauri：不再伪报 foreground-interval + supported/configured/available=true
// - Web：明确降级
// - Capacitor：旧路径保持原行为（真实状态由插件 status() 提供）

const getRuntimeMock = vi.fn()

vi.mock('../platform', () => ({
  getRuntime: () => getRuntimeMock()
}))

vi.mock('./debug_logger', () => ({
  pushDebugLog: vi.fn()
}))

const loadModule = async () => {
  vi.resetModules()
  return import('./background_fetch.js')
}

describe('getBackgroundFetchRuntimeState 语义修正（#609）', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('Tauri runtime 不再伪报后台调度已就绪：supported/configured/available 全部为 false', async () => {
    getRuntimeMock.mockReturnValue('tauri')
    const { getBackgroundFetchRuntimeState } = await loadModule()
    const state = await getBackgroundFetchRuntimeState()

    expect(state.runtime).toBe('tauri')
    expect(state.supported).toBe(false)
    expect(state.configured).toBe(false)
    expect(state.available).toBe(false)
    expect(state.mode).not.toBe('foreground-interval')
    expect(state.mode).toBe('unsupported')
    expect(state.reason).toContain('前台轮询')
  })

  it('Web runtime 明确降级为 unsupported', async () => {
    getRuntimeMock.mockReturnValue('web')
    const { getBackgroundFetchRuntimeState } = await loadModule()
    const state = await getBackgroundFetchRuntimeState()

    expect(state.supported).toBe(false)
    expect(state.configured).toBe(false)
    expect(state.available).toBe(false)
    expect(state.mode).toBe('unsupported')
  })

  it('Capacitor 旧路径保持真实状态：available 由插件 status 决定而非伪造', async () => {
    getRuntimeMock.mockReturnValue('capacitor')
    const statusMock = vi.fn()
    vi.doMock('@transistorsoft/capacitor-background-fetch', () => ({
      BackgroundFetch: {
        STATUS_AVAILABLE: 2,
        status: statusMock
      }
    }))
    // 模拟插件真实可用
    statusMock.mockResolvedValue(2)
    const { getBackgroundFetchRuntimeState } = await loadModule()
    const state = await getBackgroundFetchRuntimeState()

    expect(state.supported).toBe(true)
    expect(state.available).toBe(true)
    expect(statusMock).toHaveBeenCalled()
  })
})
