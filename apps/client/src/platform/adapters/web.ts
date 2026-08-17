import type {
  BackgroundCheckConfig,
  BackgroundCheckContext,
  BackgroundCheckResult,
  BackgroundCheckState,
  BackgroundDetectedEvent,
  KeepAliveState,
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

// ---- 后台检查能力：Web 无任何后台调度，统一安全降级（#609）----

const buildBackgroundCheckState = (): BackgroundCheckState => ({
  supported: false,
  enabled: false,
  scheduler: { kind: 'unsupported', status: 'unavailable' },
  auth: { status: 'unknown' },
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastResult: 'unknown',
  reason: 'Web 环境不支持后台智能检查：页面关闭后无任何调度能力',
  updatedAt: new Date().toISOString()
})

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

  async getNotificationPermission() {
    if (!('Notification' in window)) return 'denied'
    return normalizePermission(Notification.permission)
  },

  async requestNotificationPermission() {
    if (!('Notification' in window)) return 'denied'
    const permission = await Notification.requestPermission()
    return normalizePermission(permission)
  },

  async ensureNotificationChannel() {
    return true
  },

  async sendLocalNotification(payload: NotifyPayload) {
    if (!('Notification' in window)) return false
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
    new Notification(payload.title, { body: payload.body || '' })
    return true
  },

  async addNotificationActionListener() {
    return null
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
  },

  async setAggressiveKeepAlive(enable: boolean): Promise<KeepAliveState> {
    return {
      supported: false,
      active: false,
      source: 'web',
      reason: enable ? 'Web 环境不支持前台服务保活' : 'Web 环境不支持前台服务保活'
    }
  },

  async getAggressiveKeepAliveState(): Promise<KeepAliveState> {
    return {
      supported: false,
      active: false,
      source: 'web',
      reason: 'Web 环境不支持移动端保活能力'
    }
  },

  async openBatteryOptimizationSettings() {
    return false
  },

  async openNotificationSettings() {
    return false
  },

  // ---- 后台检查能力（#609 契约）：Web 一律安全降级，不抛未处理异常 ----

  async getBackgroundCheckState(): Promise<BackgroundCheckState> {
    return buildBackgroundCheckState()
  },

  async setBackgroundCheckConfig(_config: BackgroundCheckConfig): Promise<BackgroundCheckState> {
    return buildBackgroundCheckState()
  },

  async runBackgroundCheckNow(): Promise<BackgroundCheckResult> {
    return 'unknown'
  },

  async syncBackgroundCheckContext(_context: BackgroundCheckContext): Promise<boolean> {
    return false
  },

  async clearBackgroundCheckContext(): Promise<boolean> {
    return false
  },

  async consumeBackgroundEvents(
    _handler: (event: BackgroundDetectedEvent) => void | Promise<void>
  ): Promise<(() => void) | null> {
    return null
  }
}
