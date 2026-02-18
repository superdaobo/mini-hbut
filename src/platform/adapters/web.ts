import type {
  NotificationPermissionState,
  NotifyPayload,
  PlatformBridge
} from '../types'

const normalizePermission = (value: string | undefined): NotificationPermissionState => {
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  return 'prompt'
}

const openByWindow = (target: string) => {
  window.open(target, '_blank', 'noopener,noreferrer')
}

export const webBridge: PlatformBridge = {
  runtime: 'web',

  async openHttp(url: string) {
    try {
      openByWindow(url)
      return true
    } catch {
      try {
        location.href = url
        return true
      } catch {
        return false
      }
    }
  },

  async openUri(target: string) {
    try {
      openByWindow(target)
      return true
    } catch {
      try {
        location.href = target
        return true
      } catch {
        return false
      }
    }
  },

  async requestNotificationPermission() {
    if (!('Notification' in window)) return 'denied'
    const permission = await Notification.requestPermission()
    return normalizePermission(permission)
  },

  async sendLocalNotification(payload: NotifyPayload) {
    if (!('Notification' in window)) return false
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
    new Notification(payload.title, { body: payload.body || '' })
    return true
  },

  async keepScreenOn(enable: boolean) {
    // Web 端仅作为弱能力兜底，iOS Safari 对 WakeLock 支持有限。
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
    try {
      if (navigator.share) {
        await navigator.share({ title, url: target })
        return true
      }
    } catch {
      return false
    }
    return this.openUri(target)
  }
}

