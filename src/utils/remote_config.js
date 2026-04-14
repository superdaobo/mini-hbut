import { invokeNative as invoke } from '../platform/native'
import { detectRuntime } from '../platform/runtime'
import { DEFAULT_CLOUD_SYNC_ENDPOINT, useAppSettings } from './app_settings'

const CONFIG_URLS = [
  'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json',
  'https://gh-proxy.com/https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json',
  '/remote_config.json'
]

const REMOTE_CONFIG_SNAPSHOT_KEY = 'hbu_remote_config_snapshot'
const OCR_REMOTE_ENDPOINTS_KEY = 'hbu_ocr_remote_endpoints'
const OCR_LOCAL_FALLBACK_ENDPOINTS_KEY = 'hbu_ocr_local_fallback_endpoints'
const OCR_PRIMARY_ENDPOINT_KEY = 'hbu_ocr_endpoint'
const DEFAULT_OCR_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/ocr/recognize'
const DEFAULT_OCR_ENDPOINTS = [DEFAULT_OCR_ENDPOINT]
const DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS = [
  'http://1.94.167.18:5080/api/ocr/recognize',
  'https://mini-hbut-testocr1.hf.space/api/ocr/recognize'
]
const DEFAULT_WEBDAV_ENDPOINT = 'https://mini-hbut-chaoxing-webdav.hf.space'
const DEFAULT_CLOUD_SYNC_SECRET_REF = 'kv1-main'

const DEFAULT_CONFIG = {
  announcements: {
    pinned: [],
    ticker: [],
    list: [],
    confirm: []
  },
  force_update: {
    min_version: '',
    message: '',
    download_url: ''
  },
  ocr: {
    endpoint: DEFAULT_OCR_ENDPOINT,
    endpoints: [...DEFAULT_OCR_ENDPOINTS],
    local_fallback_endpoints: [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS],
    enabled: true
  },
  temp_file_server: {
    schedule_upload_endpoint: '',
    enabled: true
  },
  resource_share: {
    enabled: true,
    endpoint: DEFAULT_WEBDAV_ENDPOINT,
    username: 'mini-hbut',
    password: 'mini-hbut',
    office_preview_proxy: 'https://view.officeapps.live.com/op/view.aspx?src=',
    temp_upload_endpoint: ''
  },
  cloud_sync: {
    enabled: true,
    mode: 'proxy',
    proxy_endpoint: DEFAULT_CLOUD_SYNC_ENDPOINT,
    secret_ref: DEFAULT_CLOUD_SYNC_SECRET_REF,
    timeout_ms: 12000,
    cooldown_seconds: 180
  },
  ai_models: [],
  config_admin_ids: []
}
const REMOTE_CONFIG_KEYS = [
  'announcements',
  'announcement',
  'notices',
  'force_update',
  'ocr',
  'temp_file_server',
  'resource_share',
  'cloud_sync',
  'ai_models',
  'config_admin_ids'
]

const toArray = (value) => (Array.isArray(value) ? value : [])
const toString = (value) => (value == null ? '' : String(value))
const firstNonEmpty = (...values) => {
  for (const value of values) {
    const text = toString(value).trim()
    if (text) return text
  }
  return ''
}

const normalizeCloudSyncProxyEndpoint = (value) => {
  const text = toString(value).trim()
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/cloud-sync$/i.test(normalized)) {
    return normalized
  }
  return `${normalized}/api/cloud-sync`
}

const normalizeOcrEndpoint = (value) => {
  const text = toString(value).trim()
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `http://${text}`
  return withProtocol.includes('/api/ocr/recognize')
    ? withProtocol
    : `${withProtocol.replace(/\/+$/, '')}/api/ocr/recognize`
}

const normalizeEndpointList = (value) => {
  const array = toArray(value)
  const seen = new Set()
  const result = []
  for (const item of array) {
    const endpoint = normalizeOcrEndpoint(item)
    if (!endpoint || seen.has(endpoint)) continue
    seen.add(endpoint)
    result.push(endpoint)
  }
  return result
}

const getBackendSettings = () => {
  try {
    const settings = useAppSettings()
    return settings?.backend || {}
  } catch {
    return {}
  }
}

export const isRemoteConfigEnabled = () => getBackendSettings()?.useRemoteConfig !== false

const buildLocalOnlyConfig = () => {
  const backend = getBackendSettings()
  const normalized = normalizeRemoteConfig(DEFAULT_CONFIG)

  const localOcrEndpoint = normalizeOcrEndpoint(backend?.ocrEndpoint) || DEFAULT_OCR_ENDPOINT
  const ocrEndpoints = [localOcrEndpoint]
  const primaryEndpoint = localOcrEndpoint

  normalized.ocr.endpoint = primaryEndpoint
  normalized.ocr.endpoints = ocrEndpoints
  normalized.ocr.local_fallback_endpoints = [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS]
  normalized.ocr.enabled = true

  const tempUploadEndpoint = firstNonEmpty(backend?.tempUploadEndpoint)
  normalized.temp_file_server.schedule_upload_endpoint = tempUploadEndpoint
  normalized.temp_file_server.enabled = true
  normalized.resource_share.temp_upload_endpoint = tempUploadEndpoint
  normalized.cloud_sync = {
    enabled: true,
    mode: 'proxy',
    proxy_endpoint: normalizeCloudSyncProxyEndpoint(
      firstNonEmpty(backend?.cloudSyncEndpoint, DEFAULT_CLOUD_SYNC_ENDPOINT)
    ),
    secret_ref: firstNonEmpty(backend?.cloudSyncSecretRef, DEFAULT_CLOUD_SYNC_SECRET_REF),
    timeout_ms: 12000,
    cooldown_seconds: Number(backend?.moduleParams?.cloudSyncCooldownSec || 180),
    upload_cooldown_seconds: Number(backend?.moduleParams?.cloudSyncUploadCooldownSec || 120),
    download_cooldown_seconds: Number(backend?.moduleParams?.cloudSyncDownloadCooldownSec || 10)
  }

  return normalized
}

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const persistOcrConfig = (ocr) => {
  const endpoints = normalizeEndpointList(ocr?.endpoints)
  const localFallbackEndpoints = normalizeEndpointList(ocr?.local_fallback_endpoints)
  const primary = endpoints[0] || ''
  try {
    localStorage.setItem(OCR_REMOTE_ENDPOINTS_KEY, JSON.stringify(endpoints))
    localStorage.setItem(OCR_LOCAL_FALLBACK_ENDPOINTS_KEY, JSON.stringify(localFallbackEndpoints))
    if (primary) {
      localStorage.setItem(OCR_PRIMARY_ENDPOINT_KEY, primary)
    } else {
      localStorage.removeItem(OCR_PRIMARY_ENDPOINT_KEY)
    }
  } catch {
    // ignore
  }
  return { endpoints, localFallbackEndpoints, primary }
}

export const getStoredOcrConfig = () => {
  const endpoints = normalizeEndpointList(
    safeJsonParse(localStorage.getItem(OCR_REMOTE_ENDPOINTS_KEY) || '[]', [])
  )
  const localFallbackEndpoints = normalizeEndpointList(
    safeJsonParse(localStorage.getItem(OCR_LOCAL_FALLBACK_ENDPOINTS_KEY) || '[]', [])
  )
  const primary = normalizeOcrEndpoint(localStorage.getItem(OCR_PRIMARY_ENDPOINT_KEY) || '')
  return {
    endpoints: endpoints.length > 0 ? endpoints : [...DEFAULT_OCR_ENDPOINTS],
    local_fallback_endpoints:
      localFallbackEndpoints.length > 0
        ? localFallbackEndpoints
        : [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS],
    endpoint: primary || endpoints[0] || DEFAULT_OCR_ENDPOINT
  }
}

const withCacheBust = (url) => {
  const text = String(url || '').trim()
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

const resolveAnnouncements = (cfg) => {
  const root = cfg && typeof cfg === 'object' ? cfg : {}
  const obj = root.announcements || root.announcement || root.notices || {}
  return {
    pinned: toArray(obj.pinned || obj.pin || root.pinned),
    ticker: toArray(obj.ticker || obj.scroll || obj.marquee || root.ticker),
    list: toArray(obj.list || obj.items || root.notice_list || root.list),
    confirm: toArray(obj.confirm || obj.required || root.confirm)
  }
}

export function normalizeRemoteConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const announcements = resolveAnnouncements(cfg)
  const endpointCandidates = [
    ...toArray(cfg.ocr?.endpoints),
    cfg.ocr?.endpoint,
    cfg.ocr?.url,
    cfg.ocr_endpoint,
    cfg.ocrUrl
  ]
  const normalizedEndpoints = normalizeEndpointList(endpointCandidates)
  const ocrEndpoints =
    normalizedEndpoints.length > 0 ? normalizedEndpoints : [...DEFAULT_OCR_ENDPOINTS]

  const localFallbackCandidates = [
    ...toArray(cfg.ocr?.local_fallback_endpoints),
    ...toArray(cfg.ocr?.localFallbackEndpoints),
    ...toArray(cfg.ocr_local_fallback_endpoints)
  ]
  const normalizedLocalFallback = normalizeEndpointList(localFallbackCandidates)
  const localFallbackEndpoints =
    normalizedLocalFallback.length > 0
      ? normalizedLocalFallback
      : [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS]

  return {
    announcements,
    force_update: {
      min_version: firstNonEmpty(cfg.force_update?.min_version, cfg.force_update?.minVersion),
      message: firstNonEmpty(cfg.force_update?.message),
      download_url: firstNonEmpty(cfg.force_update?.download_url, cfg.force_update?.downloadUrl)
    },
    ocr: {
      endpoint: ocrEndpoints[0] || DEFAULT_OCR_ENDPOINT,
      endpoints: ocrEndpoints,
      local_fallback_endpoints: localFallbackEndpoints,
      enabled: cfg.ocr?.enabled !== false
    },
    temp_file_server: {
      schedule_upload_endpoint: firstNonEmpty(
        cfg.temp_file_server?.schedule_upload_endpoint,
        cfg.temp_file_server?.upload_endpoint,
        cfg.temp_file_server?.endpoint,
        cfg.temp_upload_endpoint
      ),
      enabled: cfg.temp_file_server?.enabled !== false
    },
    resource_share: {
      enabled: cfg.resource_share?.enabled !== false,
      endpoint: firstNonEmpty(
        cfg.resource_share?.endpoint,
        cfg.webdav?.endpoint,
        DEFAULT_WEBDAV_ENDPOINT
      ),
      username: firstNonEmpty(cfg.resource_share?.username, cfg.webdav?.username, 'mini-hbut'),
      password: firstNonEmpty(cfg.resource_share?.password, cfg.webdav?.password, 'mini-hbut'),
      office_preview_proxy: firstNonEmpty(
        cfg.resource_share?.office_preview_proxy,
        'https://view.officeapps.live.com/op/view.aspx?src='
      ),
      temp_upload_endpoint: firstNonEmpty(
        cfg.resource_share?.temp_upload_endpoint,
        cfg.temp_file_server?.schedule_upload_endpoint,
        cfg.temp_file_server?.upload_endpoint
      )
    },
    cloud_sync: {
      enabled: cfg.cloud_sync?.enabled !== false,
      mode: firstNonEmpty(
        cfg.cloud_sync?.mode,
        cfg.cloud_sync_mode,
        cfg.sync?.mode,
        'proxy'
      ),
      proxy_endpoint: normalizeCloudSyncProxyEndpoint(
        firstNonEmpty(
          cfg.cloud_sync?.proxy_endpoint,
          cfg.cloud_sync?.proxyEndpoint,
          cfg.cloud_sync?.endpoint,
          cfg.cloud_sync_proxy_endpoint,
          cfg.cloud_sync_endpoint,
          cfg.sync?.proxy_endpoint,
          DEFAULT_CLOUD_SYNC_ENDPOINT
        )
      ),
      secret_ref: firstNonEmpty(
        cfg.cloud_sync?.secret_ref,
        cfg.cloud_sync?.secretRef,
        cfg.cloud_sync_secret_ref,
        cfg.sync?.secret_ref,
        DEFAULT_CLOUD_SYNC_SECRET_REF
      ),
      timeout_ms: Number(
        cfg.cloud_sync?.timeout_ms ||
          cfg.cloud_sync?.timeoutMs ||
          cfg.sync?.timeout_ms ||
          12000
      ),
      cooldown_seconds: Number(
        cfg.cloud_sync?.cooldown_seconds ||
          cfg.cloud_sync?.cooldownSeconds ||
          cfg.sync?.cooldown_seconds ||
          180
      ),
      upload_cooldown_seconds: Number(
        cfg.cloud_sync?.upload_cooldown_seconds ||
          cfg.cloud_sync?.uploadCooldownSeconds ||
          cfg.sync?.upload_cooldown_seconds ||
          cfg.cloud_sync?.cooldown_seconds ||
          cfg.cloud_sync?.cooldownSeconds ||
          cfg.sync?.cooldown_seconds ||
          120
      ),
      download_cooldown_seconds: Number(
        cfg.cloud_sync?.download_cooldown_seconds ||
          cfg.cloud_sync?.downloadCooldownSeconds ||
          cfg.sync?.download_cooldown_seconds ||
          cfg.cloud_sync?.cooldown_seconds ||
          cfg.cloud_sync?.cooldownSeconds ||
          cfg.sync?.cooldown_seconds ||
          10
      )
    },
    ai_models: toArray(cfg.ai_models),
    config_admin_ids: toArray(cfg.config_admin_ids)
  }
}

const saveSnapshot = (config) => {
  try {
    localStorage.setItem(REMOTE_CONFIG_SNAPSHOT_KEY, JSON.stringify(config))
  } catch {
    // ignore
  }
}

const loadSnapshot = () => {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const fetchByInvoke = async (url) => {
  try {
    const payload = await invoke('fetch_remote_config', { url })
    if (payload && typeof payload === 'object') return payload
  } catch {
    // ignore
  }
  return null
}

const parseRemoteJson = (raw) => {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

const isLikelyRemoteConfigPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  return REMOTE_CONFIG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key))
}

const fetchByCapacitor = async (url) => {
  if (detectRuntime() !== 'capacitor') return null
  try {
    const core = await import('@capacitor/core')
    const capHttp = core?.CapacitorHttp || window?.Capacitor?.Plugins?.CapacitorHttp
    if (!capHttp?.request) return null
    const result = await capHttp.request({
      method: 'GET',
      url,
      headers: { Accept: 'application/json' },
      connectTimeout: 8000,
      readTimeout: 8000
    })
    return parseRemoteJson(result?.data)
  } catch {
    return null
  }
}

const fetchByWeb = async (url) => {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(`remote config http ${res.status}`)
  }
  return res.json()
}

const fetchFromAnyUrl = async () => {
  let lastError = ''
  for (const baseUrl of CONFIG_URLS) {
    const url = withCacheBust(baseUrl)
    if (!url) continue

    // 本地相对路径只走 web fetch，不走 native invoke
    const isLocalUrl = baseUrl.startsWith('/')
    if (!isLocalUrl) {
      const byInvoke = await fetchByInvoke(url)
      if (byInvoke) return byInvoke

      const byCapacitor = await fetchByCapacitor(url)
      if (byCapacitor) return byCapacitor
    }

    try {
      const byWeb = await fetchByWeb(url)
      if (byWeb && typeof byWeb === 'object') return byWeb
    } catch (e) {
      lastError = e?.message || String(e)
    }
  }
  throw new Error(lastError || 'remote config unavailable')
}

export const applyOcrRuntimeConfig = async (configLike) => {
  const enabled = configLike?.ocr?.enabled !== false
  const ocrPayload = enabled ? configLike?.ocr : null
  const persisted = persistOcrConfig({
    endpoints: enabled ? ocrPayload?.endpoints || [ocrPayload?.endpoint] : [],
    local_fallback_endpoints: enabled
      ? ocrPayload?.local_fallback_endpoints || []
      : [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS]
  })

  const runtimePayload = {
    endpoints: enabled ? persisted.endpoints : [],
    localFallbackEndpoints: persisted.localFallbackEndpoints
  }

  try {
    await invoke('set_ocr_runtime_config', {
      endpoints: runtimePayload.endpoints,
      local_fallback_endpoints: runtimePayload.localFallbackEndpoints,
      localFallbackEndpoints: runtimePayload.localFallbackEndpoints
    })
  } catch {
    // 兼容旧版本后端：至少下发主端点，fallback 由后端默认配置接管
    try {
      await invoke('set_ocr_endpoint', { endpoint: enabled ? persisted.primary : '' })
    } catch {
      // ignore
    }
  }

  return runtimePayload
}

export async function fetchRemoteConfig() {
  if (!isRemoteConfigEnabled()) {
    return buildLocalOnlyConfig()
  }

  try {
    const raw = await fetchFromAnyUrl()
    if (!isLikelyRemoteConfigPayload(raw)) {
      throw new Error('invalid remote config payload')
    }
    const normalized = normalizeRemoteConfig(raw)
    // 远程返回即视为有效配置（即使公告为空/关闭 OCR），避免被旧快照反向覆盖。
    saveSnapshot(normalized)
    return normalized
  } catch {
    // ignore
  }

  const snapshot = loadSnapshot()
  if (snapshot) {
    return normalizeRemoteConfig(snapshot)
  }
  return { ...DEFAULT_CONFIG }
}


