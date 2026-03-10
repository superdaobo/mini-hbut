import type { RuntimePlatform } from './types'

const hasNativeCapacitor = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  const cap = w.Capacitor
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

const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false
  if (hasNativeCapacitor()) return false
  const w = window as any
  const hasTauriApi = !!w.__TAURI__
  const hasInternalMarker = !!w.__TAURI_INTERNALS__
  const protocol = window.location?.protocol || ''
  const host = window.location?.host || ''
  if (protocol === 'tauri:' || host === 'tauri.localhost') return true
  // 仅依赖 __TAURI_INTERNALS__ 容易在混合容器中误判，这里要求同时具备 Tauri API 或 tauri 专属 host。
  return hasTauriApi && hasInternalMarker
}

const isCapacitorRuntime = () => {
  if (typeof window === 'undefined') return false
  if (hasNativeCapacitor()) return true
  const protocol = window.location?.protocol || ''
  return protocol === 'capacitor:' || protocol === 'ionic:'
}

export const detectRuntime = (): RuntimePlatform => {
  if (isCapacitorRuntime()) return 'capacitor'
  if (isTauriRuntime()) return 'tauri'
  return 'web'
}
