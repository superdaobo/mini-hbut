import { afterEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
const isPermissionGrantedMock = vi.fn()
const requestPermissionMock = vi.fn()
const createChannelMock = vi.fn()
const sendNotificationMock = vi.fn()
const onActionMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

vi.mock('@tauri-apps/plugin-notification', () => ({
  Importance: { High: 4 },
  Visibility: { Private: 0 },
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
  createChannel: createChannelMock,
  sendNotification: sendNotificationMock,
  onAction: onActionMock
}))

describe('tauriBridge notifications', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'navigator')
  })

  it('sends desktop notifications through the Rust native command first', async () => {
    invokeMock.mockResolvedValue(undefined)

    const { tauriBridge } = await import('./tauri')
    const ok = await tauriBridge.sendLocalNotification({
      id: 42,
      channelId: 'hbut-default',
      title: 'Mini-HBUT',
      body: '测试通知',
      targetView: 'grades'
    })

    expect(ok).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('send_local_notification_native', {
      id: 42,
      channelId: 'hbut-default',
      title: 'Mini-HBUT',
      body: '测试通知',
      targetView: 'grades'
    })
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it('falls back to the Tauri notification plugin when native sending fails', async () => {
    invokeMock.mockRejectedValue(new Error('native failed'))
    sendNotificationMock.mockImplementation(() => undefined)

    const { tauriBridge } = await import('./tauri')
    const ok = await tauriBridge.sendLocalNotification({
      title: 'Mini-HBUT',
      body: 'fallback'
    })

    expect(ok).toBe(true)
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: 'Mini-HBUT',
      body: 'fallback'
    })
  })

  it('does not hide failed Windows native notifications behind the WebView fallback', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      configurable: true
    })
    invokeMock.mockRejectedValue(new Error('native failed'))
    sendNotificationMock.mockImplementation(() => undefined)

    const { tauriBridge } = await import('./tauri')
    const ok = await tauriBridge.sendLocalNotification({
      title: 'Mini-HBUT',
      body: 'windows failure'
    })

    expect(ok).toBe(false)
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it('uses native permission commands before plugin permission APIs', async () => {
    invokeMock
      .mockResolvedValueOnce('granted')
      .mockResolvedValueOnce('denied')

    const { tauriBridge } = await import('./tauri')

    await expect(tauriBridge.getNotificationPermission()).resolves.toBe('granted')
    await expect(tauriBridge.requestNotificationPermission()).resolves.toBe('denied')

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_notification_permission_native')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'request_notification_permission_native')
    expect(isPermissionGrantedMock).not.toHaveBeenCalled()
    expect(requestPermissionMock).not.toHaveBeenCalled()
  })
})
