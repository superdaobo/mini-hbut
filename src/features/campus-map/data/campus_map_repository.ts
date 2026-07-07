import { getCachedData, setCachedData } from '../../../utils/api.js'
import { invokeNative, isTauriRuntime } from '../../../platform/native'
import type { CampusMapBundle } from '../types'
import {
  CAMPUS_MAP_CACHE_KEY,
  CAMPUS_MAP_CACHE_TTL_MS,
  CAMPUS_MAP_CONFIG_BASE,
  CAMPUS_MAP_FETCH_TIMEOUT_MS,
  CAMPUS_MAP_MANIFEST_URL
} from '../constants'
import {
  CampusMapSchemaError,
  parseCampusBuildingsPayload,
  parseCampusMapConfig,
  parseCampusMapManifest
} from './schema'
import fallbackBuildings from '../fixtures/buildings.json'
import fallbackConfig from '../fixtures/config.json'
import fallbackManifest from '../fixtures/manifest.json'

const safeText = (value: unknown) => String(value ?? '').trim()

const withCacheBust = (url: string) => {
  const text = safeText(url)
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

const toAbsoluteUrl = (value: string, base: string) => {
  const raw = safeText(value)
  if (!raw) return ''
  try {
    return new URL(raw, base).toString()
  } catch {
    return raw
  }
}

const withTimeout = async <T>(promise: Promise<T>, ms = CAMPUS_MAP_FETCH_TIMEOUT_MS) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('campus-map-fetch-timeout')), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

const fetchJsonNoStore = async (url: string) => {
  const requestUrl = withCacheBust(url)
  if (isTauriRuntime()) {
    return withTimeout(invokeNative('fetch_remote_json', { url: requestUrl }) as Promise<unknown>)
  }
  const response = await withTimeout(
    fetch(requestUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const readBundleCache = () => getCachedData(CAMPUS_MAP_CACHE_KEY, CAMPUS_MAP_CACHE_TTL_MS)

const buildFallbackBundle = (reason: string): CampusMapBundle => ({
  manifest: parseCampusMapManifest(fallbackManifest),
  config: parseCampusMapConfig(fallbackConfig),
  buildings: parseCampusBuildingsPayload(fallbackBuildings),
  fromCache: false,
  offline: true,
  ...(reason ? { degradedReason: reason } : {})
})

export interface FetchCampusMapOptions {
  forceRefresh?: boolean
}

export const fetchCampusMapDataset = async ({
  forceRefresh = false
}: FetchCampusMapOptions = {}): Promise<CampusMapBundle> => {
  const cached = readBundleCache()
  if (!forceRefresh && cached?.data?.buildings?.length) {
    return {
      ...(cached.data as CampusMapBundle),
      fromCache: true,
      offline: Boolean((cached.data as CampusMapBundle).offline)
    }
  }

  try {
    const manifestRaw = await fetchJsonNoStore(CAMPUS_MAP_MANIFEST_URL)
    const manifest = parseCampusMapManifest(manifestRaw)
    const manifestBase = CAMPUS_MAP_MANIFEST_URL.replace(/\/[^/]+$/, '/')
    const buildingsUrl = toAbsoluteUrl(manifest.buildings_url, manifestBase)
    const configUrl = toAbsoluteUrl(manifest.config_url, manifestBase)

    const [buildingsRaw, configRaw] = await Promise.all([
      fetchJsonNoStore(buildingsUrl),
      fetchJsonNoStore(configUrl)
    ])

    const bundle: CampusMapBundle = {
      manifest,
      config: parseCampusMapConfig(configRaw),
      buildings: parseCampusBuildingsPayload(buildingsRaw),
      fromCache: false,
      offline: false
    }

    setCachedData(CAMPUS_MAP_CACHE_KEY, bundle)
    return bundle
  } catch (error) {
    const message =
      error instanceof CampusMapSchemaError
        ? error.message
        : (error as Error)?.message || '校园地图数据加载失败'

    if (cached?.data?.buildings?.length) {
      return {
        ...(cached.data as CampusMapBundle),
        fromCache: true,
        offline: true,
        degradedReason: message
      }
    }

    return {
      ...buildFallbackBundle(message),
      degradedReason: message
    }
  }
}

export const getCampusMapConfigBaseUrl = () => CAMPUS_MAP_CONFIG_BASE
