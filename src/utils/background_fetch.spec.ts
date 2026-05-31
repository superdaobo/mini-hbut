import { afterEach, describe, expect, it, vi } from 'vitest'

const setMock = vi.fn()
const removeMock = vi.fn()
const thenTrapMock = vi.fn()
const configureMock = vi.fn()
const scheduleTaskMock = vi.fn()
const finishMock = vi.fn()
const statusMock = vi.fn()

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: setMock,
    remove: removeMock,
    then: thenTrapMock
  }
}))

vi.mock('@transistorsoft/capacitor-background-fetch', () => ({
  BackgroundFetch: {
    STATUS_AVAILABLE: 2,
    NETWORK_TYPE_ANY: 1,
    configure: configureMock,
    scheduleTask: scheduleTaskMock,
    finish: finishMock,
    status: statusMock
  }
}))

vi.mock('../platform', () => ({
  getRuntime: () => 'capacitor'
}))

vi.mock('./debug_logger', () => ({
  pushDebugLog: vi.fn()
}))

describe('background fetch Capacitor preferences bridge', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('does not assimilate Preferences plugin proxies as thenables', async () => {
    thenTrapMock.mockImplementation((resolve: unknown, reject: unknown) => {
      if (typeof reject === 'function') {
        reject(new Error('Preferences.then should not be called'))
      }
    })
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(() => ''),
        setItem: vi.fn(),
        removeItem: vi.fn()
      },
      configurable: true
    })

    const { syncBackgroundFetchContext } = await import('./background_fetch.js')

    await expect(syncBackgroundFetchContext({
      studentId: '20260001',
      settings: {
        enableBackground: true,
        enableGradeNotice: true,
        enableExamReminder: true,
        enablePowerNotice: true,
        enableClassReminder: true,
        classLeadMinutes: 30,
        intervalMinutes: 30
      },
      dormSelection: ['1', '2', '3', '4']
    })).resolves.toBeUndefined()
    expect(setMock).toHaveBeenCalled()
    expect(thenTrapMock).not.toHaveBeenCalled()
  })

  it('initializes BackgroundFetch without invoking the catch result as a function', async () => {
    configureMock.mockResolvedValue(2)
    scheduleTaskMock.mockResolvedValue(undefined)

    const { initBackgroundFetchScheduler } = await import('./background_fetch.js')

    await expect(initBackgroundFetchScheduler(vi.fn())).resolves.toBe(true)
    expect(configureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        requiredNetworkType: 1
      }),
      expect.any(Function),
      expect.any(Function)
    )
    expect(scheduleTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'com.hbut.mini.notify.periodic',
      enableHeadless: true,
      stopOnTerminate: false,
      startOnBoot: true
    }))
  })
})
