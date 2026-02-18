import type {
  NotificationPermissionState,
  NotifyPayload,
  PlatformBridge
} from '../types'

const getCapacitor = () => (window as any)?.Capacitor
const getPlugin = <T = any>(name: string): T | undefined =>
  getCapacitor()?.Plugins?.[name] as T | undefined

const normalizePermission = (value: string | undefined): NotificationPermissionState => {
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  return 'prompt'
}

export const capacitorBridge: PlatformBridge = {
  runtime: 'capacitor',

  async openHttp(url: string) {
    return this.openUri(url)
  },

  async openUri(target: string) {
    const browser = getPlugin<any>('Browser')
    if (browser?.open) {
      try {
        await browser.open({ url: target })
        return true
      } catch {
        // continue fallback
      }
    }
    try {
      window.open(target, '_blank', 'noopener,noreferrer')
      return true
    } catch {
      return false
    }
  },

  async requestNotificationPermission() {
    const localNotifications = getPlugin<any>('LocalNotifications')
    if (!localNotifications?.requestPermissions) return 'prompt'
    try {
      const result = await localNotifications.requestPermissions()
      return normalizePermission(result?.display)
    } catch {
      return 'denied'
    }
  },

  async sendLocalNotification(payload: NotifyPayload) {
    const localNotifications = getPlugin<any>('LocalNotifications')
    if (!localNotifications?.schedule) return false
    try {
      const id = payload.id ?? Math.floor(Date.now() / 1000)
      await localNotifications.schedule({
        notifications: [
          {
            id,
            title: payload.title,
            body: payload.body || ''
          }
        ]
      })
      return true
    } catch {
      return false
    }
  },

  async keepScreenOn(enable: boolean) {
    // Capacitor 标准插件未内置 keep-screen-on，这里先保留 Web WakeLock 兜底。
    if (!enable) return true
    try {
      const nav = navigator as any
      await nav?.wakeLock?.request?.('screen')
      return true
    } catch {
      return false
    }
  },

  async shareLinkOrFile(target: string, title?: string) {
    const share = getPlugin<any>('Share')
    if (share?.share) {
      try {
        await share.share({
          title: title || 'Mini-HBUT',
          text: title || 'Mini-HBUT 文件分享',
          url: target
        })
        return true
      } catch {
        // fallback
      }
    }
    return this.openUri(target)
  }
}

