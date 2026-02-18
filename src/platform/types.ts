export type RuntimePlatform = 'tauri' | 'capacitor' | 'web'

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt'

export interface NotifyPayload {
  title: string
  body?: string
  id?: number
  channelId?: string
}

/**
 * 平台桥接统一接口
 *
 * 前端业务层统一依赖这里，避免直接散落调用 Tauri / Capacitor API。
 * 迁移阶段先覆盖高频能力：外链、通知、常亮、分享。
 */
export interface PlatformBridge {
  runtime: RuntimePlatform
  openHttp(url: string): Promise<boolean>
  openUri(target: string): Promise<boolean>
  getNotificationPermission(): Promise<NotificationPermissionState>
  requestNotificationPermission(): Promise<NotificationPermissionState>
  ensureNotificationChannel(channelId: string): Promise<boolean>
  sendLocalNotification(payload: NotifyPayload): Promise<boolean>
  keepScreenOn(enable: boolean): Promise<boolean>
  shareLinkOrFile(target: string, title?: string): Promise<boolean>
}
