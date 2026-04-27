import { Capacitor as CapacitorCore } from '@capacitor/core'
import type { RuntimePlatform } from './types'

const hasNativeCapacitor = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  const cap = w.Capacitor || CapacitorCore
  if (!cap) return false
  try {
    if (typeof cap.isNativePlatform === 'function') {
      return !!cap.isNativePlatform()
    }
  } catch {
    // ignore
  }
  try {
    if (typeof cap.getPlatform === 'function') {
      const platform = String(cap.getPlatform() || '').toLowerCase()
      if (platform && platform !== 'web') return true
    }
  } catch {
    // ignore
  }
  const raw = String(cap.platform || '').toLowerCase()
  return !!raw && raw !== 'web'
}

const isLoopbackHost = (host: string) =>
  host === 'localhost' ||
  host.startsWith('localhost:') ||
  host === '127.0.0.1' ||
  host.startsWith('127.0.0.1:')

const isMobileUserAgent = () => {
  const ua = String(globalThis?.navigator?.userAgent || '')
  return /(android|iphone|ipad|ipod)/i.test(ua)
}

const looksLikePackagedCapacitorHost = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  const protocol = String(window.location?.protocol || '').toLowerCase()
  const host = String(window.location?.host || '').toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') return false
  if (!isLoopbackHost(host)) return false
  if (!isMobileUserAgent()) return false
  const ua = String(globalThis?.navigator?.userAgent || '')
  const hasWebViewMarker = /;\s*wv\)/i.test(ua)
  const hasCapacitorBridge = !!w.Capacitor
  return hasCapacitorBridge || hasWebViewMarker
}

const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false
  if (hasNativeCapacitor()) return false
  const w = window as any
  const hasTauriApi = !!w.__TAURI__
  const hasInternalMarker = !!w.__TAURI_INTERNALS__
  const hasInternalInvoke = typeof w.__TAURI_INTERNALS__?.invoke === 'function'
  const protocol = window.location?.protocol || ''
  const host = window.location?.host || ''
  if (protocol === 'tauri:' || host === 'tauri.localhost') return true
  // 安卓/iOS 的 loopback WebView（含 dev live reload）一律不判定为 Tauri。
  if (looksLikePackagedCapacitorHost()) return false
  // Tauri v2 默认不注入 window.__TAURI__，但 __TAURI_INTERNALS__.invoke 通常可用。
  if (hasInternalInvoke) return true
  return hasTauriApi && hasInternalMarker
}

const isCapacitorRuntime = () => {
  if (typeof window === 'undefined') return false
  if (hasNativeCapacitor()) return true
  if (looksLikePackagedCapacitorHost()) return true
  const protocol = window.location?.protocol || ''
  return protocol === 'capacitor:' || protocol === 'ionic:'
}

export const detectRuntime = (): RuntimePlatform => {
  if (isCapacitorRuntime()) return 'capacitor'
  if (isTauriRuntime()) return 'tauri'
  return 'web'
}
