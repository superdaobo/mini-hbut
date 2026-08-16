/**
 * App Store / TestFlight 合规包的更新检查：
 * - 仅查询苹果公开 Lookup（商店正式版）
 * - 不引导 GitHub/CDN IPA 旁加载
 * - TestFlight 测试包更新仍由系统 TestFlight 负责
 */

import { allowsInAppGithubUpdater } from '../config/app_store_policy'
import { openExternal, openExternalRaw } from './external_link'
import { compareVersions } from './updater.js'

export const APPLE_BUNDLE_ID = 'com.hbut.mini'
/** App Store Connect「Apple ID」；与 Bundle ID 不同，用于打开商店 / TestFlight 深链 */
export const DEFAULT_APPLE_APP_ID = '6787857278'
const SKIPPED_APPLE_VERSION_KEY = 'hbu_skipped_apple_store_version'
const DEFAULT_LOOKUP_URLS = [
  `https://itunes.apple.com/lookup?bundleId=${APPLE_BUNDLE_ID}&country=cn`,
  `https://itunes.apple.com/lookup?bundleId=${APPLE_BUNDLE_ID}`
]

export type AppleStoreUpdateResult = {
  mode: 'apple_storefront'
  hasUpdate: boolean
  currentVersion: string
  storeVersion: string
  trackId: string
  trackViewUrl: string
  /** lookup 无结果 / 网络失败等 */
  error?: boolean
  message?: string
  /** 商店尚无该 bundle（未上架或查不到） */
  notOnStore?: boolean
}

const stripVersion = (value: unknown) => String(value || '').trim().replace(/^v/i, '')

export function getConfiguredAppleAppId(): string {
  try {
    const fromEnv = String(
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_APPLE_APP_ID || ''
    ).trim()
    if (fromEnv) return fromEnv.replace(/^id/i, '')
  } catch {
    // ignore
  }
  return DEFAULT_APPLE_APP_ID
}

export function getSkippedAppleStoreVersion(): string {
  try {
    return String(globalThis.localStorage?.getItem(SKIPPED_APPLE_VERSION_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function setSkippedAppleStoreVersion(version: string): void {
  const text = stripVersion(version)
  if (!text) return
  try {
    globalThis.localStorage?.setItem(SKIPPED_APPLE_VERSION_KEY, text)
  } catch {
    // ignore
  }
}

export function buildAppStoreOpenUrls(options: {
  trackId?: string
  trackViewUrl?: string
  appId?: string
} = {}): string[] {
  const trackViewUrl = String(options.trackViewUrl || '').trim()
  const id = String(options.trackId || options.appId || getConfiguredAppleAppId() || '')
    .trim()
    .replace(/^id/i, '')
  const urls: string[] = []
  if (trackViewUrl) urls.push(trackViewUrl)
  if (id) {
    urls.push(`itms-apps://apps.apple.com/app/id${id}`)
    urls.push(`https://apps.apple.com/app/id${id}`)
  }
  return [...new Set(urls.filter(Boolean))]
}

export function buildTestFlightOpenUrls(appId?: string): string[] {
  const id = String(appId || getConfiguredAppleAppId() || '')
    .trim()
    .replace(/^id/i, '')
  const urls: string[] = []
  if (id) {
    urls.push(`itms-beta://beta.itunes.apple.com/v1/app/${id}`)
    urls.push(`https://beta.itunes.apple.com/v1/app/${id}`)
  }
  urls.push('itms-beta://')
  return [...new Set(urls.filter(Boolean))]
}

export async function openAppStoreUpdatePage(options: {
  trackId?: string
  trackViewUrl?: string
  appId?: string
} = {}): Promise<boolean> {
  for (const url of buildAppStoreOpenUrls(options)) {
    if (/^https?:\/\//i.test(url)) {
      if (await openExternal(url)) return true
    } else if (await openExternalRaw(url)) {
      return true
    }
  }
  return false
}

export async function openTestFlightApp(appId?: string): Promise<boolean> {
  for (const url of buildTestFlightOpenUrls(appId)) {
    if (/^https?:\/\//i.test(url)) {
      if (await openExternal(url)) return true
    } else if (await openExternalRaw(url)) {
      return true
    }
  }
  return false
}

type LookupPayload = {
  resultCount?: number
  results?: Array<{
    version?: string
    trackId?: number | string
    trackViewUrl?: string
  }>
}

async function fetchLookupJson(url: string, timeoutMs = 8000): Promise<LookupPayload | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return null
    return (await res.json()) as LookupPayload
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 查询 App Store 正式版相对当前安装是否有更新。
 * 注意：不反映 TestFlight 内部 build。
 */
export async function checkAppleStoreUpdate(
  currentVersion: string,
  options: { lookupUrls?: string[] } = {}
): Promise<AppleStoreUpdateResult> {
  const current = stripVersion(currentVersion) || '0.0.0'
  const base: AppleStoreUpdateResult = {
    mode: 'apple_storefront',
    hasUpdate: false,
    currentVersion: current,
    storeVersion: '',
    trackId: getConfiguredAppleAppId(),
    trackViewUrl: ''
  }

  // 非合规包不应走此路径；调用方应判断 allowsInAppGithubUpdater
  if (allowsInAppGithubUpdater()) {
    return {
      ...base,
      error: true,
      message: '当前构建应使用 GitHub/CDN 内部更新'
    }
  }

  const urls = (options.lookupUrls || DEFAULT_LOOKUP_URLS).filter(Boolean)
  let lastError = '无法连接 App Store 查询服务'

  for (const url of urls) {
    const payload = await fetchLookupJson(url)
    if (!payload) {
      lastError = '无法连接 App Store 查询服务'
      continue
    }

    const count = Number(payload.resultCount || 0)
    const row = Array.isArray(payload.results) ? payload.results[0] : null
    if (!count || !row) {
      return {
        ...base,
        notOnStore: true,
        hasUpdate: false,
        message: 'App Store 暂无此应用的正式版记录。若使用 TestFlight，请打开 TestFlight 查看测试更新。'
      }
    }

    const storeVersion = stripVersion(row.version)
    const trackId = String(row.trackId || base.trackId || '').trim()
    const trackViewUrl = String(row.trackViewUrl || '').trim()
    const hasUpdate = Boolean(storeVersion && compareVersions(storeVersion, current) > 0)

    return {
      mode: 'apple_storefront',
      hasUpdate,
      currentVersion: current,
      storeVersion,
      trackId,
      trackViewUrl,
      message: hasUpdate
        ? `App Store 最新 v${storeVersion}，当前 v${current}。请通过 App Store 更新。`
        : storeVersion
          ? `已是 App Store 最新正式版（v${storeVersion}）。TestFlight 测试包请在 TestFlight 中查看。`
          : '已是最新正式版。TestFlight 测试包请在 TestFlight 中查看。'
    }
  }

  return {
    ...base,
    error: true,
    message: lastError
  }
}
