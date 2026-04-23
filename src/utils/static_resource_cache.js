import { getCachedData, setCachedData } from './api.js'

const STATIC_RESOURCE_BASE = 'https://hbut.6661111.xyz/app-resources'
const DORMITORY_MANIFEST_URL = `${STATIC_RESOURCE_BASE}/dormitory/manifest.json`
const DORMITORY_FALLBACK_URL = `${STATIC_RESOURCE_BASE}/dormitory/dormitory_data-20260423.json`
const DORMITORY_CACHE_KEY = 'static_resource:dormitory_data'
const STATIC_RESOURCE_TTL = 30 * 24 * 60 * 60 * 1000

const safeText = (value) => String(value ?? '').trim()

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

const fetchJsonNoStore = async (url) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`拉取静态资源失败：HTTP ${response.status}`)
  }
  return response.json()
}

const fetchTextNoStore = async (url) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`拉取静态资源失败：HTTP ${response.status}`)
  }
  return response.text()
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
    const payloadText = await fetchTextNoStore(resourceUrl)

    const expectedSha = safeText(manifest?.sha256 || manifest?.hash || '')
    if (expectedSha) {
      const actualSha = await sha256Hex(payloadText)
      if (actualSha && actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
        throw new Error('宿舍静态资源校验失败，请稍后重试')
      }
    }

    const payloadData = JSON.parse(payloadText)
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
    return {
      data: nextPayload,
      fromCache: false,
      timestamp: Date.now()
    }
  } catch (error) {
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
