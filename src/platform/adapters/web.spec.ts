import { afterEach, describe, expect, it, vi } from 'vitest'

describe('webBridge notifications', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'window')
    Reflect.deleteProperty(globalThis, 'Notification')
  })

  it('requests browser notification permission before sending', async () => {
    const notificationConstructor = vi.fn()
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const NotificationMock = Object.assign(notificationConstructor, {
      permission: 'default',
      requestPermission
    })

    Object.defineProperty(globalThis, 'Notification', {
      value: NotificationMock,
      configurable: true
    })
    Object.defineProperty(globalThis, 'window', {
      value: {
        Notification: NotificationMock,
        open: vi.fn()
      },
      configurable: true
    })

    const { webBridge } = await import('./web')
    const ok = await webBridge.sendLocalNotification({
      title: 'Mini-HBUT',
      body: '浏览器测试'
    })

    expect(ok).toBe(true)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(notificationConstructor).toHaveBeenCalledWith('Mini-HBUT', {
      body: '浏览器测试'
    })
  })

  it('does not create a browser notification when permission is denied', async () => {
    const notificationConstructor = vi.fn()
    const NotificationMock = Object.assign(notificationConstructor, {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied')
    })

    Object.defineProperty(globalThis, 'Notification', {
      value: NotificationMock,
      configurable: true
    })
    Object.defineProperty(globalThis, 'window', {
      value: {
        Notification: NotificationMock,
        open: vi.fn()
      },
      configurable: true
    })

    const { webBridge } = await import('./web')
    const ok = await webBridge.sendLocalNotification({
      title: 'Mini-HBUT'
    })

    expect(ok).toBe(false)
    expect(notificationConstructor).not.toHaveBeenCalled()
  })
})
