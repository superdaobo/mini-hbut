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

const tryOpenWithRustFallback = async (target: string) => {
  const core = await import('@tauri-apps/api/core')
  try {
    await core.invoke('open_external_url', { url: target })
    return true
  } catch {
    return false
  }
}

export const tauriBridge: PlatformBridge = {
  runtime: 'tauri',

  async openHttp(url: string) {
    return this.openUri(url)
  },

  async openUri(target: string) {
    try {
      const shell = await import('@tauri-apps/plugin-shell')
      await shell.open(target)
      return true
    } catch {
      const encodedTarget = encodeURI(target)
      if (encodedTarget !== target) {
        try {
          const shell = await import('@tauri-apps/plugin-shell')
          await shell.open(encodedTarget)
          return true
        } catch {
          // continue fallback
        }
      }
      if (await tryOpenWithRustFallback(target)) return true
      if (encodedTarget !== target) return tryOpenWithRustFallback(encodedTarget)
      return false
    }
  },

  async requestNotificationPermission() {
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      const state = await mod.requestPermission()
      return normalizePermission(String(state))
    } catch {
      return 'denied'
    }
  },

  async sendLocalNotification(payload: NotifyPayload) {
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      await mod.sendNotification({
        id: payload.id,
        title: payload.title,
        body: payload.body
      })
      return true
    } catch {
      return false
    }
  },

  async keepScreenOn(enable: boolean) {
    try {
      const mod = await import('tauri-plugin-keep-screen-on-api')
      if (typeof mod.keepScreenOn === 'function') {
        await mod.keepScreenOn(enable)
        return true
      }
      return false
    } catch {
      return false
    }
  },

  async shareLinkOrFile(target: string, title?: string) {
    // Tauri 下先走外部打开，和当前产品行为保持一致。
    if (title) void title
    return this.openUri(target)
  }
}

