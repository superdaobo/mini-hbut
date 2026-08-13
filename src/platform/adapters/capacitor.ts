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
import { isIOSLike } from '../runtime'

// ---- 后台检查能力：Capacitor 迁移期降级（#609 / #616）----
// #616：旧 BackgroundFetch 路径（src/utils/background_fetch.ts）与
// KeepAliveForegroundService 已整体退役；Capacitor 壳不再提供移动后台调度，
// 正式移动后台由 Tauri 插件（Android WorkManager / iOS BGAppRefresh）承担。
// kind 仅标记来源，status 保持 unavailable，绝不伪造 ready。

const buildBackgroundCheckState = (): BackgroundCheckState => ({
  supported: true,
  enabled: false,
  scheduler: { kind: 'capacitor-background-fetch', status: 'unavailable' },
  auth: { status: 'unknown' },
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastResult: 'unknown',
  reason: 'Capacitor 壳已退役 BackgroundFetch（#616）：移动后台检查请使用 Tauri 构建（WorkManager/BGAppRefresh）',
  updatedAt: new Date().toISOString()
})

const getWindow = () => (typeof window === 'undefined' ? undefined : (window as any))
const getCapacitor = () => getWindow()?.Capacitor
const getPlugin = <T = any>(name: string): T | undefined =>
  getCapacitor()?.Plugins?.[name] as T | undefined
let hbutNativeProxy: any | null = null

const getRegisteredPlugin = async <T = any>(name: string): Promise<{ plugin?: T }> => {
  const globalPlugin = getPlugin<T>(name)
  if (globalPlugin) return { plugin: globalPlugin }
  try {
    const mod = await import('@capacitor/core')
    if (typeof mod.registerPlugin !== 'function') return {}
    if (name === 'HBUTNative') {
      hbutNativeProxy ||= mod.registerPlugin('HBUTNative')
      return { plugin: hbutNativeProxy as T }
    }
  } catch {
    // ignore
  }
  return {}
}

const getHBUTNativePlugin = async () => (await getRegisteredPlugin<any>('HBUTNative')).plugin

const getLocalNotifications = async () => {
  try {
    const mod = await import('@capacitor/local-notifications')
    if (mod?.LocalNotifications) return { plugin: mod.LocalNotifications as any }
  } catch {
    // fallback to global plugin proxy
  }
  return { plugin: getPlugin<any>('LocalNotifications') }
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
    const { plugin: localNotifications } = await getLocalNotifications()
    if (!localNotifications?.checkPermissions) return 'prompt'
    try {
      const result = await localNotifications.checkPermissions()
      return normalizePermission(result?.display)
    } catch {
      return 'prompt'
    }
  },

  async requestNotificationPermission() {
    const { plugin: localNotifications } = await getLocalNotifications()
    if (!localNotifications?.requestPermissions) return 'prompt'
    try {
      const result = await localNotifications.requestPermissions()
      return normalizePermission(result?.display)
    } catch {
      return 'denied'
    }
  },

  async ensureNotificationChannel(channelId: string) {
    const { plugin: localNotifications } = await getLocalNotifications()
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
    const { plugin: localNotifications } = await getLocalNotifications()
    if (!localNotifications?.schedule) return false
    try {
      const id = payload.id ?? Math.floor(Date.now() % 2147483000)
      const isIOS = isIOSLike()
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
    const { plugin: localNotifications } = await getLocalNotifications()
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
      const t = String(target || '').trim()
      const titleText = title || 'Mini-HBUT'
      // 本地文件：走 files[]（iOS/Android 系统分享面板），勿当 url 打开
      const isLocalFile =
        /^file:\/\//i.test(t) ||
        (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('/')) &&
          !/^https?:\/\//i.test(t)
      try {
        if (isLocalFile) {
          const fileUrl = t.startsWith('file:')
            ? t
            : t.startsWith('/')
              ? `file://${t}`
              : `file:///${t.replace(/\\/g, '/')}`
          await share.share({
            title: titleText,
            dialogTitle: titleText || '保存或分享课件',
            files: [fileUrl],
            url: fileUrl
          })
          return true
        }
        await share.share({
          title: titleText,
          text: titleText,
          url: t,
          dialogTitle: titleText
        })
        return true
      } catch {
        // fallback
      }
    }
    return this.openUri(target)
  },

  async setAggressiveKeepAlive(_enable: boolean): Promise<KeepAliveState> {
    // #616：KeepAliveForegroundService 已退役（#608 红线 5），Capacitor 壳不再
    // 提供前台服务保活；返回 unsupported，避免设置页误显示“保活成功”。
    return {
      supported: false,
      active: false,
      source: 'capacitor',
      reason: '前台服务保活已退役（#616）：后台检查由 Tauri 构建的 WorkManager/BGAppRefresh 提供'
    }
  },

  async getAggressiveKeepAliveState(): Promise<KeepAliveState> {
    return {
      supported: false,
      active: false,
      source: 'capacitor',
      reason: '前台服务保活已退役（#616）'
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
      const openSettings = (app.App as { openSettings?: () => Promise<void> }).openSettings
      if (typeof openSettings === 'function') {
        await openSettings()
        return true
      }
      return false
    } catch {
      return false
    }
  },

  async openNotificationSettings() {
    const plugin = await getHBUTNativePlugin()
    if (plugin?.openNotificationSettings) {
      try {
        const result = await plugin.openNotificationSettings({})
        return !!result?.ok
      } catch {
        // fallback to app settings
      }
    }
    try {
      const app = await import('@capacitor/app')
      const openSettings = (app.App as { openSettings?: () => Promise<void> }).openSettings
      if (typeof openSettings === 'function') {
        await openSettings()
        return true
      }
      return false
    } catch {
      return false
    }
  },

  // ---- 后台检查能力（#609 契约）：迁移期降级，不伪造 ready ----

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
