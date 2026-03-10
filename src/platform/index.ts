import { capacitorBridge } from './adapters/capacitor'
import { tauriBridge } from './adapters/tauri'
import { webBridge } from './adapters/web'
import { detectRuntime } from './runtime'
import type {
  NotificationPermissionState,
  NotifyPayload,
  PlatformBridge,
  RuntimePlatform
} from './types'

const pickBridge = (): PlatformBridge => {
  const runtime = detectRuntime()
  if (runtime === 'tauri') return tauriBridge
  if (runtime === 'capacitor') return capacitorBridge
  return webBridge
}

export const getRuntime = (): RuntimePlatform => pickBridge().runtime

export const platformBridge = {
  async openHttp(url: string) {
    return pickBridge().openHttp(url)
  },
  async openUri(target: string) {
    return pickBridge().openUri(target)
  },
  async getNotificationPermission(): Promise<NotificationPermissionState> {
    return pickBridge().getNotificationPermission()
  },
  async requestNotificationPermission(): Promise<NotificationPermissionState> {
    return pickBridge().requestNotificationPermission()
  },
  async ensureNotificationChannel(channelId: string) {
    return pickBridge().ensureNotificationChannel(channelId)
  },
  async sendLocalNotification(payload: NotifyPayload) {
    return pickBridge().sendLocalNotification(payload)
  },
  async keepScreenOn(enable: boolean) {
    return pickBridge().keepScreenOn(enable)
  },
  async shareLinkOrFile(target: string, title?: string) {
    return pickBridge().shareLinkOrFile(target, title)
  },
  async setAggressiveKeepAlive(enable: boolean) {
    return pickBridge().setAggressiveKeepAlive(enable)
  },
  async getAggressiveKeepAliveState() {
    return pickBridge().getAggressiveKeepAliveState()
  },
  async openBatteryOptimizationSettings() {
    return pickBridge().openBatteryOptimizationSettings()
  }
}
