import { afterEach, describe, expect, it, vi } from 'vitest'

const scheduleMock = vi.fn()
const requestPermissionsMock = vi.fn()
const checkPermissionsMock = vi.fn()
const createChannelMock = vi.fn()
const addListenerMock = vi.fn()
const thenTrapMock = vi.fn()

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: scheduleMock,
    requestPermissions: requestPermissionsMock,
    checkPermissions: checkPermissionsMock,
    createChannel: createChannelMock,
    addListener: addListenerMock,
    then: thenTrapMock
  }
}))

vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: {
    openUrl: vi.fn()
  }
}))

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn()
}))

describe('capacitorBridge notifications', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'navigator')
  })

  it('does not assimilate Capacitor plugin proxies as thenables', async () => {
    thenTrapMock.mockImplementation((resolve: unknown, reject: unknown) => {
      if (typeof reject === 'function') {
        reject(new Error('LocalNotifications.then should not be called'))
      }
    })
    checkPermissionsMock.mockResolvedValue({ display: 'granted' })

    const { capacitorBridge } = await import('./capacitor')

    await expect(capacitorBridge.getNotificationPermission()).resolves.toBe('granted')
    expect(checkPermissionsMock).toHaveBeenCalledTimes(1)
    expect(thenTrapMock).not.toHaveBeenCalled()
  })

  it('requests the native notification permission prompt through LocalNotifications', async () => {
    requestPermissionsMock.mockResolvedValue({ display: 'granted' })

    const { capacitorBridge } = await import('./capacitor')

    await expect(capacitorBridge.requestNotificationPermission()).resolves.toBe('granted')
    expect(requestPermissionsMock).toHaveBeenCalledTimes(1)
  })

  it('schedules Android notifications with channel and target view payload', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36' },
      configurable: true
    })
    scheduleMock.mockResolvedValue(undefined)

    const { capacitorBridge } = await import('./capacitor')
    const ok = await capacitorBridge.sendLocalNotification({
      id: 7,
      channelId: 'hbut-default',
      title: 'Mini-HBUT',
      body: '移动端测试',
      targetView: 'schedule'
    })

    expect(ok).toBe(true)
    expect(scheduleMock).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: 7,
          channelId: 'hbut-default',
          title: 'Mini-HBUT',
          body: '移动端测试',
          extra: { view: 'schedule' },
          schedule: expect.objectContaining({ allowWhileIdle: true })
        })
      ]
    })
  })

  it('does not attach Android channel metadata on iOS notifications', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      configurable: true
    })
    scheduleMock.mockResolvedValue(undefined)

    const { capacitorBridge } = await import('./capacitor')
    const ok = await capacitorBridge.sendLocalNotification({
      id: 8,
      channelId: 'hbut-default',
      title: 'Mini-HBUT'
    })

    expect(ok).toBe(true)
    const payload = scheduleMock.mock.calls[0]?.[0]?.notifications?.[0]
    expect(payload).toMatchObject({
      id: 8,
      title: 'Mini-HBUT',
      extra: { view: 'notifications' },
      schedule: expect.objectContaining({ allowWhileIdle: false })
    })
    expect(payload).not.toHaveProperty('channelId')
  })
})
