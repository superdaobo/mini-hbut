/**
 * remote_config 常量与归一化工具模块：远端 URL、存储 key、默认配置
 * 以及端点/模块中心的纯归一化函数。业务编排在 ./remote_config.ts。
 */
import { DEFAULT_CLOUD_SYNC_ENDPOINT, useAppSettings } from './app_settings'
import { DEFAULT_MODULE_CENTER as DEFAULT_GAME_MODULE_CENTER } from './module_center'

/** 真·远端源（GitCode + 代理）；成功且内容变化才写本地快照 */
export const REMOTE_CONFIG_URLS = [
  'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json',
  'https://gh-proxy.com/https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json'
]
/** 打包进应用的兜底 json：仅无快照且远端全失败时使用，不得覆盖已有快照 */
export const PACKAGE_CONFIG_URL = '/remote_config.json'
/** 兼容旧引用：远端优先，最后才是打包 */
export const CONFIG_URLS = [...REMOTE_CONFIG_URLS, PACKAGE_CONFIG_URL]

export const REMOTE_CONFIG_SNAPSHOT_KEY = 'hbu_remote_config_snapshot'
export const OCR_REMOTE_ENDPOINTS_KEY = 'hbu_ocr_remote_endpoints'
export const OCR_LOCAL_FALLBACK_ENDPOINTS_KEY = 'hbu_ocr_local_fallback_endpoints'
export const OCR_PRIMARY_ENDPOINT_KEY = 'hbu_ocr_endpoint'
export const DEFAULT_OCR_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/ocr/recognize'
export const DEFAULT_OCR_ENDPOINTS = [DEFAULT_OCR_ENDPOINT]
export const DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS = [
  'http://1.94.167.18:5080/api/ocr/recognize',
  'https://mini-hbut-testocr1.hf.space/api/ocr/recognize'
]
export const DEFAULT_WEBDAV_ENDPOINT = 'https://mini-hbut-chaoxing-webdav.hf.space'
export const DEFAULT_FORUM_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/forum'
export const LOCAL_FORUM_API_BASE_KEY = 'hbu_forum_api_base'
// 云同步使用的服务端密钥「引用 ID」（指向服务端 KV 中哪把密钥，如 kv1-main），
// 本身不是密钥。CodeQL 因字段名含 secret 而误报 js/clear-text-storage，见 docs/security/codeql-triage-js.md
export const DEFAULT_CLOUD_SYNC_CREDENTIAL_REF_ID = 'kv1-main'
export const MODULE_CDN_BASE = 'https://hbut.6661111.xyz/modules'

export const DEFAULT_CONFIG: Record<string, unknown> = {
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
  forum: {
    enabled: true,
    api_base: DEFAULT_FORUM_ENDPOINT
  },
  cloud_sync: {
    enabled: true,
    mode: 'proxy',
    proxy_endpoint: DEFAULT_CLOUD_SYNC_ENDPOINT,
    secret_ref: DEFAULT_CLOUD_SYNC_CREDENTIAL_REF_ID,
    timeout_ms: 12000,
    cooldown_seconds: 180
  },
  module_center: {
    channel: DEFAULT_GAME_MODULE_CENTER.channel,
    modules: [...DEFAULT_GAME_MODULE_CENTER.modules]
  },
  // #360 学习通资料库：远程只需 invite_code；课程名/教师/ID 由邀请码在线解析
  chaoxing_class: {
    enabled: true,
    invite_code: '18853572'
  },
  ai_models: [],
  config_admin_ids: []
}

/** 内置默认邀请码（远程不可达时的最终兜底） */
export const DEFAULT_CHAOXING_INVITE_CODE = '18853572'
/** 成功拉取远程后落盘的邀请码缓存（离线/拉取失败时优先于内置默认） */
export const CHAOXING_INVITE_CACHE_KEY = 'hbu_chaoxing_invite_code_cache_v1'

export const REMOTE_CONFIG_KEYS = [
  'announcements',
  'announcement',
  'notices',
  'force_update',
  'ocr',
  'temp_file_server',
  'resource_share',
  'forum',
  'cloud_sync',
  'module_center',
  'more_modules',
  'chaoxing_class',
  'ai_models',
  'config_admin_ids'
]
// 远程配置短时内存缓存：降低登录期重复拉取与并发请求。
export const REMOTE_CONFIG_MEMORY_TTL_MS = 45 * 1000
export const REMOTE_CONFIG_FETCH_TIMEOUT_MS = 3000

export const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
export const toText = (value: unknown): string => (value == null ? '' : String(value))
export const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    const text = toText(value).trim()
    if (text) return text
  }
  return ''
}

export const normalizeCloudSyncProxyEndpoint = (value: unknown): string => {
  const text = toText(value).trim()
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/cloud-sync$/i.test(normalized)) {
    return normalized
  }
  return `${normalized}/api/cloud-sync`
}

export const normalizeOcrEndpoint = (value: unknown): string => {
  const text = toText(value).trim()
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `http://${text}`
  return withProtocol.includes('/api/ocr/recognize')
    ? withProtocol
    : `${withProtocol.replace(/\/+$/, '')}/api/ocr/recognize`
}

export const normalizeForumEndpoint = (value: unknown): string => {
  const text = toText(value).trim()
  if (!text) return DEFAULT_FORUM_ENDPOINT
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/forum$/i.test(normalized)) {
    return normalized
  }
  return `${normalized}/api/forum`
}

export const isLocalForumEndpointOverride = (value: unknown): string => {
  const endpoint = normalizeForumEndpoint(value)
  if (!endpoint) return ''
  try {
    const url = new URL(endpoint)
    const host = url.hostname.toLowerCase()
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    return isLoopback ? endpoint : ''
  } catch {
    return ''
  }
}

export const getLocalForumEndpointOverride = (): string => {
  let fromQuery = ''
  try {
    const search = globalThis.window?.location?.search || ''
    const params = new URLSearchParams(search)
    fromQuery = isLocalForumEndpointOverride(
      firstNonEmpty(params.get('forumApiBase'), params.get('forum_api_base'))
    )
  } catch {
    fromQuery = ''
  }

  let fromStorage = ''
  try {
    fromStorage = isLocalForumEndpointOverride(
      firstNonEmpty(globalThis.localStorage?.getItem(LOCAL_FORUM_API_BASE_KEY))
    )
  } catch {
    fromStorage = ''
  }

  return firstNonEmpty(fromQuery, fromStorage)
}

export const normalizeEndpointList = (value: unknown): string[] => {
  const array = toArray(value)
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of array) {
    const endpoint = normalizeOcrEndpoint(item)
    if (!endpoint || seen.has(endpoint)) continue
    seen.add(endpoint)
    result.push(endpoint)
  }
  return result
}

export const getBackendSettings = (): Record<string, unknown> => {
  try {
    const settings = useAppSettings()
    return (settings?.backend || {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

export const isRemoteConfigEnabled = (): boolean =>
  (getBackendSettings()?.useRemoteConfig as boolean | undefined) !== false

export const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const withCacheBust = (url: unknown): string => {
  const text = toText(url).trim()
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage || '请求超时'))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const resolveAnnouncements = (cfg: unknown): {
  pinned: unknown[]
  ticker: unknown[]
  list: unknown[]
  confirm: unknown[]
} => {
  const root = cfg && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {}
  const obj =
    root.announcements && typeof root.announcements === 'object'
      ? (root.announcements as Record<string, unknown>)
      : (root.announcement && typeof root.announcement === 'object'
          ? (root.announcement as Record<string, unknown>)
          : (root.notices && typeof root.notices === 'object'
              ? (root.notices as Record<string, unknown>)
              : {}))
  return {
    pinned: toArray(obj.pinned || obj.pin || root.pinned),
    ticker: toArray(obj.ticker || obj.scroll || obj.marquee || root.ticker),
    list: toArray(obj.list || obj.items || root.notice_list || root.list),
    confirm: toArray(obj.confirm || obj.required || root.confirm)
  }
}

export const normalizeModuleCenterChannel = (value: unknown): string => {
  const normalized = toText(value).trim().toLowerCase()
  return normalized === 'dev' ? 'dev' : 'main'
}

export const resolveModuleManifestUrl = (
  rawUrl: unknown,
  channel: string,
  moduleId: string
): string => {
  const explicit = toText(rawUrl).trim()
  if (explicit) {
    try {
      return new URL(explicit, `${MODULE_CDN_BASE}/${channel}/`).toString()
    } catch {
      return explicit
    }
  }
  return `${MODULE_CDN_BASE}/${channel}/${moduleId}/manifest.json`
}

export interface NormalizedModuleEntry {
  id: string
  name: string
  icon: string
  description: string
  key_required: boolean
  kind: 'internal' | 'remote'
  view: string
  order: number
  manifest_url: string
  [key: string]: unknown
}

export const normalizeModuleCenterEntry = (
  value: unknown,
  index = 0,
  channel = 'main'
): NormalizedModuleEntry | null => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const id = firstNonEmpty(raw.id, raw.module_id)
  if (!id) return null

  const view = firstNonEmpty(raw.view, raw.route, id === 'shuake' ? 'more_shuake' : '')
  const kindText = toText(raw.kind || raw.type).trim().toLowerCase()
  const kind: 'internal' | 'remote' = kindText === 'internal' || id === 'shuake' ? 'internal' : 'remote'
  const order = Number(raw.order)

  return {
    id,
    name: firstNonEmpty(raw.name, raw.module_name, raw.title, id),
    icon: firstNonEmpty(raw.icon, id === 'shuake' ? '🔐' : kind === 'remote' ? '📦' : '🧩'),
    description: firstNonEmpty(raw.description, raw.desc),
    key_required: id === 'shuake' || raw.key_required === true || raw.keyRequired === true,
    kind,
    view,
    order: Number.isFinite(order) ? order : index + 1,
    manifest_url:
      kind === 'remote'
        ? resolveModuleManifestUrl(firstNonEmpty(raw.manifest_url, raw.manifestUrl), channel, id)
        : ''
  }
}

export interface ResolvedModuleCenter {
  channel: string
  modules: NormalizedModuleEntry[]
}

export const resolveModuleCenter = (cfg: unknown): ResolvedModuleCenter => {
  const root = cfg && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {}
  const moduleCenter =
    root.module_center && typeof root.module_center === 'object'
      ? (root.module_center as Record<string, unknown>)
      : {}
  const moreModules =
    root.more_modules && typeof root.more_modules === 'object'
      ? (root.more_modules as Record<string, unknown>)
      : {}

  const channel = normalizeModuleCenterChannel(
    firstNonEmpty(
      moduleCenter.channel,
      moreModules.channel,
      root.module_channel,
      root.more_modules_channel,
      DEFAULT_GAME_MODULE_CENTER.channel
    )
  )

  const rawModules = toArray(
    moduleCenter.modules ??
      moreModules.modules ??
      (Array.isArray(root.more_modules) ? root.more_modules : [])
  )

  let modules = rawModules
    .map((item, index) => normalizeModuleCenterEntry(item, index, channel))
    .filter((item): item is NormalizedModuleEntry => item !== null)

  if (modules.length === 0) {
    modules = DEFAULT_GAME_MODULE_CENTER.modules
      .map((item, index) => normalizeModuleCenterEntry(item, index, channel))
      .filter((item): item is NormalizedModuleEntry => item !== null)
  }

  const deduped: NormalizedModuleEntry[] = []
  const seen = new Set<string>()
  for (const item of modules) {
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    deduped.push(item)
  }

  return {
    channel,
    modules: deduped
  }
}

export const persistOcrConfig = (ocr: {
  endpoints?: unknown
  local_fallback_endpoints?: unknown
}): { endpoints: string[]; localFallbackEndpoints: string[]; primary: string } => {
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

export const getStoredOcrConfig = (): {
  endpoints: string[]
  local_fallback_endpoints: string[]
  endpoint: string
} => {
  const endpoints = normalizeEndpointList(
    safeJsonParse<unknown[]>(localStorage.getItem(OCR_REMOTE_ENDPOINTS_KEY) || '[]', [])
  )
  const localFallbackEndpoints = normalizeEndpointList(
    safeJsonParse<unknown[]>(localStorage.getItem(OCR_LOCAL_FALLBACK_ENDPOINTS_KEY) || '[]', [])
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
