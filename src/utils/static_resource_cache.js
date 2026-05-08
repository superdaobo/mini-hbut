import { getCachedData, setCachedData } from './api.js'
import { invokeNative, isTauriRuntime } from '../platform/native'

const STATIC_RESOURCE_BASE = 'https://hbut.6661111.xyz/app-resources'
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/superdaobo/mini-hbut-config/main/app-resources'
const GITHUB_PROXY_BASE = 'https://gh-proxy.com/https://raw.githubusercontent.com/superdaobo/mini-hbut-config/main/app-resources'
const DORMITORY_MANIFEST_URL = `${STATIC_RESOURCE_BASE}/dormitory/manifest.json`
const DORMITORY_FALLBACK_URL = `${STATIC_RESOURCE_BASE}/dormitory/dormitory_data-20260423.json`
const DORMITORY_CACHE_KEY = 'static_resource:dormitory_data'
const STATIC_RESOURCE_TTL = 30 * 24 * 60 * 60 * 1000
const STATIC_RESOURCE_TIMEOUT_MS = 10000

const safeText = (value) => String(value ?? '').trim()

const withCacheBust = (url) => {
  const text = safeText(url)
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

const toAbsoluteUrl = (value, base) => {
  const raw = safeText(value)
  if (!raw) return ''
  try {
    return new URL(raw, base).toString()
  } catch {
    return raw
  }
}

const withOfflineMeta = (data, timestamp) => {
  if (!data || typeof data !== 'object') {
    return {
      success: true,
      data,
      offline: true,
      sync_time: new Date(timestamp).toISOString()
    }
  }
  return {
    ...data,
    offline: true,
    sync_time: data.sync_time || new Date(timestamp).toISOString()
  }
}

/**
 * 将主站 URL 转换为 GitHub 代理 URL（用于兜底）
 * 仅对 hbut.6661111.xyz/app-resources/ 路径生效
 */
const toProxyUrls = (url) => {
  const raw = safeText(url).split('?')[0] // 去掉 cache bust 参数
  const suffix = raw.replace(STATIC_RESOURCE_BASE, '')
  if (!suffix || suffix === raw) return [] // 非主站 URL，不做代理
  return [
    `${GITHUB_RAW_BASE}${suffix}`,
    `${GITHUB_PROXY_BASE}${suffix}`
  ]
}

const fetchJsonNoStore = async (url) => {
  const requestUrl = withCacheBust(url)

  if (isTauriRuntime()) {
    // Tauri 环境：通过原生命令 fetch，支持主站 + GitHub + gh-proxy 三级兜底
    const nativeUrls = [requestUrl, ...toProxyUrls(url).map(withCacheBust)]
    let lastNativeError = null
    for (const tryUrl of nativeUrls) {
      try {
        return await withTimeout(
          invokeNative('fetch_remote_json', { url: tryUrl }),
          STATIC_RESOURCE_TIMEOUT_MS
        )
      } catch (error) {
        lastNativeError = error
        console.warn('[StaticResource] 原生 fetch 失败，尝试下一个源', {
          url: tryUrl,
          error: String(error?.message || error || '')
        })
      }
    }
    // 所有原生源都失败，尝试浏览器 fetch（可能在某些 Tauri 配置下可用）
    console.warn('[StaticResource] 所有原生源失败，尝试浏览器 fetch 兜底')
  }

  // 非 Tauri 环境 或 Tauri 原生全部失败后的浏览器 fetch 兜底
  // 主站 → GitHub raw → gh-proxy 三级兜底
  const urlsToTry = [requestUrl, ...toProxyUrls(url).map(withCacheBust)]
  let lastError = null

  for (const tryUrl of urlsToTry) {
    try {
      const response = await withTimeout(
        fetch(tryUrl, {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        }),
        STATIC_RESOURCE_TIMEOUT_MS
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch (parseErr) {
        throw new Error(`解析静态资源失败：${parseErr?.message || 'unknown'}`)
      }
    } catch (error) {
      lastError = error
      console.warn('[StaticResource] fetch 失败，尝试下一个源', {
        url: tryUrl,
        error: String(error?.message || error || '')
      })
    }
  }

  throw lastError || new Error('所有静态资源源均不可用')
}

const fetchTextNoStore = async (url) => {
  const urlsToTry = [withCacheBust(url), ...toProxyUrls(url).map(withCacheBust)]
  let lastError = null

  for (const tryUrl of urlsToTry) {
    try {
      const response = await withTimeout(
        fetch(tryUrl, {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        }),
        STATIC_RESOURCE_TIMEOUT_MS
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      lastError = error
      console.warn('[StaticResource] fetchText 失败，尝试下一个源', {
        url: tryUrl,
        error: String(error?.message || error || '')
      })
    }
  }

  throw lastError || new Error('所有静态资源源均不可用')
}

const withTimeout = async (promise, ms = STATIC_RESOURCE_TIMEOUT_MS) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('static-resource-timeout')), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

const sha256Hex = async (text) => {
  if (!globalThis.crypto?.subtle) return ''
  const bytes = new TextEncoder().encode(String(text || ''))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

const readDormitoryCache = () => getCachedData(DORMITORY_CACHE_KEY, STATIC_RESOURCE_TTL)

export const getDormitoryManifestUrl = () => DORMITORY_MANIFEST_URL

export const fetchDormitoryDataset = async ({ forceRefresh = false } = {}) => {
  const cached = readDormitoryCache()

  try {
    const manifest = await fetchJsonNoStore(DORMITORY_MANIFEST_URL)
    const manifestVersion = safeText(manifest?.version || manifest?.resource_version || '')

    if (
      !forceRefresh &&
      cached?.data?.data &&
      manifestVersion &&
      safeText(cached.data.version) === manifestVersion
    ) {
      return {
        data: cached.data,
        fromCache: true,
        timestamp: cached.timestamp
      }
    }

    const resourceUrl = toAbsoluteUrl(
      manifest?.url || manifest?.resource_url || DORMITORY_FALLBACK_URL,
      DORMITORY_MANIFEST_URL
    ) || DORMITORY_FALLBACK_URL
    let payloadData = null
    const expectedSha = safeText(manifest?.sha256 || manifest?.hash || '')

    if (isTauriRuntime()) {
      payloadData = await fetchJsonNoStore(resourceUrl)
    } else {
      const payloadText = await fetchTextNoStore(resourceUrl)
      if (expectedSha) {
        const actualSha = await sha256Hex(payloadText)
        if (actualSha && actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
          throw new Error('宿舍静态资源校验失败，请稍后重试')
        }
      }
      payloadData = JSON.parse(payloadText)
    }

    const nextPayload = {
      success: true,
      data: Array.isArray(payloadData) ? payloadData : [],
      version: manifestVersion || safeText(cached?.data?.version || 'legacy'),
      sync_time: new Date().toISOString(),
      manifest_url: DORMITORY_MANIFEST_URL,
      source_url: resourceUrl,
      sha256: expectedSha
    }

    setCachedData(DORMITORY_CACHE_KEY, nextPayload)
    console.info('[StaticResource] 宿舍数据加载成功', {
      fromCache: false,
      version: nextPayload.version,
      count: nextPayload.data.length,
      source: isTauriRuntime() ? 'native-json' : 'web-fetch'
    })
    return {
      data: nextPayload,
      fromCache: false,
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('[StaticResource] 宿舍数据加载失败', {
      error: String(error?.message || error || ''),
      hasCache: !!cached?.data
    })
    if (cached?.data) {
      return {
        data: withOfflineMeta(cached.data, cached.timestamp),
        fromCache: true,
        timestamp: cached.timestamp,
        stale: true
      }
    }
    throw error
  }
}
