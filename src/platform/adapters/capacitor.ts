import type {
  KeepAliveState,
  NotificationPermissionState,
  NotifyPayload,
  PlatformBridge
} from '../types'

const getWindow = () => (typeof window === 'undefined' ? undefined : (window as any))
const getCapacitor = () => getWindow()?.Capacitor
const getPlugin = <T = any>(name: string): T | undefined =>
  getCapacitor()?.Plugins?.[name] as T | undefined
let hbutNativeProxy: any | null = null

const getRegisteredPlugin = async <T = any>(name: string): Promise<T | undefined> => {
  const globalPlugin = getPlugin<T>(name)
  if (globalPlugin) return globalPlugin
  try {
    const mod = await import('@capacitor/core')
    if (typeof mod.registerPlugin !== 'function') return undefined
    if (name === 'HBUTNative') {
      hbutNativeProxy ||= mod.registerPlugin('HBUTNative')
      return hbutNativeProxy as T
    }
  } catch {
    // ignore
  }
  return undefined
}

const getHBUTNativePlugin = () => getRegisteredPlugin<any>('HBUTNative')

const getLocalNotifications = async () => {
  try {
    const mod = await import('@capacitor/local-notifications')
    if (mod?.LocalNotifications) return mod.LocalNotifications as any
  } catch {
    // fallback to global plugin proxy
  }
  return getPlugin<any>('LocalNotifications')
}

const normalizePermission = (value: string | undefined): NotificationPermissionState => {
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  return 'prompt'
}

const openByAppLauncher = async (target: string) => {
  try {
    const mod = await import('@capacitor/app-launcher')
    const launcher = mod?.AppLauncher
    if (!launcher?.openUrl) return false
    await launcher.openUrl({ url: target })
    return true
  } catch {
    return false
  }
}

export const capacitorBridge: PlatformBridge = {
  runtime: 'capacitor',

  async openHttp(url: string) {
    const launched = await openByAppLauncher(url)
    if (launched) return true
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    } catch {
      return false
    }
  },

  async openUri(target: string) {
    const launched = await openByAppLauncher(target)
    if (launched) return true
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

  async getNotificationPermission() {
    const localNotifications = await getLocalNotifications()
    if (!localNotifications?.checkPermissions) return 'prompt'
    try {
      const result = await localNotifications.checkPermissions()
      return normalizePermission(result?.display)
    } catch {
      return 'prompt'
    }
  },

  async requestNotificationPermission() {
    const localNotifications = await getLocalNotifications()
    if (!localNotifications?.requestPermissions) return 'prompt'
    try {
      const result = await localNotifications.requestPermissions()
      return normalizePermission(result?.display)
    } catch {
      return 'denied'
    }
  },

  async ensureNotificationChannel(channelId: string) {
    const localNotifications = await getLocalNotifications()
    if (!localNotifications?.createChannel) return true
    try {
      await localNotifications.createChannel({
        id: channelId,
        name: 'Mini-HBUT 通知',
        description: '课程、考试与系统提醒',
        importance: 4,
        visibility: 1
      })
      return true
    } catch {
      return false
    }
  },

  async sendLocalNotification(payload: NotifyPayload) {
    const localNotifications = await getLocalNotifications()
    if (!localNotifications?.schedule) return false
    try {
      const id = payload.id ?? Math.floor(Date.now() % 2147483000)
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      const notification: Record<string, any> = {
        id,
        title: payload.title,
        body: payload.body || '',
        extra: {
          view: payload.targetView || 'notifications'
        },
        schedule: {
          at: new Date(Date.now() + 1500),
          allowWhileIdle: !isIOS
        }
      }
      // channelId 是 Android 概念，iOS 上不传
      if (!isIOS && payload.channelId) {
        notification.channelId = payload.channelId
      }
      await localNotifications.schedule({ notifications: [notification] })
      return true
    } catch {
      return false
    }
  },

  async addNotificationActionListener(listener: (payload: unknown) => void) {
    const localNotifications = await getLocalNotifications()
    if (!localNotifications?.addListener) return null
    try {
      const handle = await localNotifications.addListener(
        'localNotificationActionPerformed',
        (payload: unknown) => {
          listener(payload)
        }
      )
      return () => {
        try {
          void handle?.remove?.()
        } catch {
          // ignore listener cleanup failure
        }
      }
    } catch {
      return null
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
  },

  async setAggressiveKeepAlive(enable: boolean): Promise<KeepAliveState> {
    // iOS 不支持前台服务保活，返回友好提示
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      return {
        supported: false,
        active: false,
        source: 'ios',
        reason: 'iOS 不支持前台服务，后台任务由系统调度'
      }
    }
    const native = await getHBUTNativePlugin()
    if (!native?.setForegroundService) {
      return {
        supported: false,
        active: false,
        source: 'capacitor',
        reason: '未注册 HBUTNative 原生插件'
      }
    }
    try {
      const result = await native.setForegroundService({ enabled: !!enable })
      return {
        supported: true,
        active: !!result?.active,
        source: String(result?.source || 'android-foreground-service'),
        reason: String(result?.reason || '')
      }
    } catch (error) {
      return {
        supported: true,
        active: false,
        source: 'android-foreground-service',
        reason: String(error || '前台服务调用失败')
      }
    }
  },

  async getAggressiveKeepAliveState(): Promise<KeepAliveState> {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      return {
        supported: false,
        active: false,
        source: 'ios',
        reason: 'iOS 不支持前台服务，后台任务由系统调度'
      }
    }
    const plugin = await getHBUTNativePlugin()
    if (!plugin?.getForegroundServiceState) {
      return {
        supported: false,
        active: false,
        source: 'capacitor',
        reason: '未注册 HBUTNative 原生插件'
      }
    }
    try {
      const result = await plugin.getForegroundServiceState()
      return {
        supported: true,
        active: !!result?.active,
        source: String(result?.source || 'android-foreground-service'),
        reason: String(result?.reason || '')
      }
    } catch (error) {
      return {
        supported: true,
        active: false,
        source: 'android-foreground-service',
        reason: String(error || '前台服务状态读取失败')
      }
    }
  },

  async openBatteryOptimizationSettings() {
    const plugin = await getHBUTNativePlugin()
    if (plugin?.openBatteryOptimizationSettings) {
      try {
        const result = await plugin.openBatteryOptimizationSettings({})
        return !!result?.ok
      } catch {
        // fallback to app settings
      }
    }
    try {
      const app = await import('@capacitor/app')
      await app.App.openSettings()
      return true
    } catch {
      return false
    }
  }
}
