import type { RuntimePlatform } from './types'

const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  if (w.__TAURI__ || w.__TAURI_INTERNALS__) return true
  const protocol = window.location?.protocol || ''
  const host = window.location?.host || ''
  return protocol === 'tauri:' || host === 'tauri.localhost'
}

const isCapacitorRuntime = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  if (w.Capacitor?.isNativePlatform?.()) return true
  const protocol = window.location?.protocol || ''
  return protocol === 'capacitor:' || protocol === 'ionic:'
}

export const detectRuntime = (): RuntimePlatform => {
  if (isTauriRuntime()) return 'tauri'
  if (isCapacitorRuntime()) return 'capacitor'
  return 'web'
}

