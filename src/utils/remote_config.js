import { invokeNative as invoke } from '../platform/native'
import { detectRuntime } from '../platform/runtime'
import { DEFAULT_CLOUD_SYNC_ENDPOINT, useAppSettings } from './app_settings'
import { DEFAULT_MODULE_CENTER as DEFAULT_GAME_MODULE_CENTER } from './module_center'
import { isTestAccountSession } from './test_account.js'
import { shouldApplyAppStoreRestrictions } from '../config/app_store_policy'

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
const DEFAULT_FORUM_ENDPOINT = 'https://mini-hbut-testocr1.hf.space/api/forum'
const LOCAL_FORUM_API_BASE_KEY = 'hbu_forum_api_base'
const DEFAULT_CLOUD_SYNC_SECRET_REF = 'kv1-main'
const MODULE_CDN_BASE = 'https://hbut.6661111.xyz/modules'
const DEFAULT_MODULE_CENTER = DEFAULT_GAME_MODULE_CENTER

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
  forum: {
    enabled: true,
    api_base: DEFAULT_FORUM_ENDPOINT
  },
  cloud_sync: {
    enabled: true,
    mode: 'proxy',
    proxy_endpoint: DEFAULT_CLOUD_SYNC_ENDPOINT,
    secret_ref: DEFAULT_CLOUD_SYNC_SECRET_REF,
    timeout_ms: 12000,
    cooldown_seconds: 180
  },
  module_center: {
    channel: DEFAULT_MODULE_CENTER.channel,
    modules: [...DEFAULT_MODULE_CENTER.modules]
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
const CHAOXING_INVITE_CACHE_KEY = 'hbu_chaoxing_invite_code_cache_v1'
/** 内存层缓存：与 localStorage 同步，便于测试/无 storage 环境 */
let chaoxingInviteMemory = ''
const REMOTE_CONFIG_KEYS = [
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
const REMOTE_CONFIG_MEMORY_TTL_MS = 45 * 1000
const REMOTE_CONFIG_FETCH_TIMEOUT_MS = 3000
let remoteConfigMemory = null
let remoteConfigMemoryAt = 0
let remoteConfigInFlight = null

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

const normalizeForumEndpoint = (value) => {
  const text = toString(value).trim()
  if (!text) return DEFAULT_FORUM_ENDPOINT
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  const normalized = withProtocol.replace(/\/+$/, '')
  if (/\/api\/forum$/i.test(normalized)) {
    return normalized
  }
  return `${normalized}/api/forum`
}

const isLocalForumEndpointOverride = (value) => {
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

const getLocalForumEndpointOverride = () => {
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

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timer = null
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage || '请求超时'))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
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

const normalizeModuleCenterChannel = (value) => {
  const normalized = toString(value).trim().toLowerCase()
  return normalized === 'dev' ? 'dev' : 'main'
}

const resolveModuleManifestUrl = (rawUrl, channel, moduleId) => {
  const explicit = toString(rawUrl).trim()
  if (explicit) {
    try {
      return new URL(explicit, `${MODULE_CDN_BASE}/${channel}/`).toString()
    } catch {
      return explicit
    }
  }
  return `${MODULE_CDN_BASE}/${channel}/${moduleId}/manifest.json`
}

const normalizeModuleCenterEntry = (value, index = 0, channel = 'main') => {
  const raw = value && typeof value === 'object' ? value : {}
  const id = firstNonEmpty(raw.id, raw.module_id)
  if (!id) return null

  const view = firstNonEmpty(raw.view, raw.route, id === 'shuake' ? 'more_shuake' : '')
  const kindText = toString(raw.kind || raw.type).trim().toLowerCase()
  const kind = kindText === 'internal' || id === 'shuake' ? 'internal' : 'remote'
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

const resolveModuleCenter = (cfg) => {
  const root = cfg && typeof cfg === 'object' ? cfg : {}
  const moduleCenter =
    root.module_center && typeof root.module_center === 'object' ? root.module_center : {}
  const moreModules =
    root.more_modules && typeof root.more_modules === 'object' ? root.more_modules : {}

  const channel = normalizeModuleCenterChannel(
    firstNonEmpty(
      moduleCenter.channel,
      moreModules.channel,
      root.module_channel,
      root.more_modules_channel,
      DEFAULT_MODULE_CENTER.channel
    )
  )

  const rawModules = toArray(
    moduleCenter.modules ??
      moreModules.modules ??
      (Array.isArray(root.more_modules) ? root.more_modules : [])
  )

  let modules = rawModules
    .map((item, index) => normalizeModuleCenterEntry(item, index, channel))
    .filter(Boolean)

  if (modules.length === 0) {
    modules = DEFAULT_MODULE_CENTER.modules
      .map((item, index) => normalizeModuleCenterEntry(item, index, channel))
      .filter(Boolean)
  }

  const deduped = []
  const seen = new Set()
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
  const forumEndpointOverride = getLocalForumEndpointOverride()

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
    forum: {
      enabled: cfg.forum?.enabled !== false,
      api_base: normalizeForumEndpoint(
        firstNonEmpty(
          forumEndpointOverride,
          cfg.forum?.api_base,
          cfg.forum?.apiBase,
          cfg.forum?.endpoint,
          cfg.forum_api_base,
          DEFAULT_FORUM_ENDPOINT
        )
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
    module_center: resolveModuleCenter(cfg),
    chaoxing_class: normalizeChaoxingClassConfig(cfg.chaoxing_class || cfg.chaoxingClass, {
      // 远程 payload 里有 invite 时写入本地缓存（断网可复用）
      persistInvite: !!(cfg.chaoxing_class || cfg.chaoxingClass)
    }),
    ai_models: toArray(cfg.ai_models),
    config_admin_ids: toArray(cfg.config_admin_ids)
  }
}

/**
 * 合规包 guest/demo：仍返回已拉取的配置，但锁死高风险能力（远程 true 无法打开）。
 * 非合规构建或真实登录：原样返回。
 */
export function applyAppStoreRemoteConfigClamp(config) {
  if (!shouldApplyAppStoreRestrictions() || !config || typeof config !== 'object') return config
  const next = { ...config }
  // 公告 / force_update / OCR HTTPS 端点可保留
  next.module_center = {
    channel: firstNonEmpty(config.module_center?.channel, 'main'),
    modules: []
  }
  next.resource_share = {
    ...(config.resource_share || {}),
    enabled: false
  }
  next.forum = {
    ...(config.forum || {}),
    enabled: false
  }
  next.chaoxing_class = {
    ...(config.chaoxing_class || {}),
    enabled: false
  }
  next.ai_models = []
  next.config_admin_ids = []
  // 禁用 HTTP OCR fallback（仅保留 https）
  const ocr = { ...(config.ocr || {}) }
  const httpsOnly = (list) =>
    toArray(list).filter((u) => /^https:\/\//i.test(String(u || '').trim()))
  ocr.local_fallback_endpoints = httpsOnly(ocr.local_fallback_endpoints)
  ocr.endpoints = httpsOnly(ocr.endpoints).length
    ? httpsOnly(ocr.endpoints)
    : httpsOnly([ocr.endpoint])
  if (ocr.endpoints[0]) ocr.endpoint = ocr.endpoints[0]
  next.ocr = ocr
  // 远程不得强制打开云同步；用户侧另有默认关策略
  next.cloud_sync = {
    ...(config.cloud_sync || {}),
    enabled: false
  }
  return next
}

const readCachedChaoxingInvite = () => {
  if (chaoxingInviteMemory) return chaoxingInviteMemory
  try {
    const fromStore = toString(localStorage.getItem(CHAOXING_INVITE_CACHE_KEY)).trim()
    if (fromStore) chaoxingInviteMemory = fromStore
    return fromStore
  } catch {
    return chaoxingInviteMemory || ''
  }
}

/**
 * 远程成功下发邀请码后写入本地缓存，断网时仍可用上一版邀请码
 * @param {string} code
 */
export function persistChaoxingInviteCode(code) {
  const invite = toString(code).trim()
  if (!invite) return
  chaoxingInviteMemory = invite
  try {
    localStorage.setItem(CHAOXING_INVITE_CACHE_KEY, invite)
  } catch {
    /* ignore */
  }
}

/**
 * 解析当前应使用的邀请码：显式配置 → 本地缓存 → 内置默认
 * @param {unknown} [rawBlock]
 */
export function resolveChaoxingInviteCode(rawBlock) {
  const src = rawBlock && typeof rawBlock === 'object' ? rawBlock : {}
  return (
    firstNonEmpty(
      src.invite_code,
      src.inviteCode,
      src.invite,
      readCachedChaoxingInvite(),
      DEFAULT_CHAOXING_INVITE_CODE
    ) || DEFAULT_CHAOXING_INVITE_CODE
  )
}

/**
 * 归一化学习通资料库配置（#360）
 * 远程只需 invite_code；course/teacher 等可选，默认空（由在线 preview 填充）
 * @param {unknown} raw
 * @param {{ persistInvite?: boolean }} [options]
 */
export function normalizeChaoxingClassConfig(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const invite = resolveChaoxingInviteCode(src)
  if (options.persistInvite && invite) {
    // 仅当 raw 显式带来 invite 时落盘，避免用默认码覆盖已缓存的远程码
    const explicit = firstNonEmpty(src.invite_code, src.inviteCode, src.invite)
    if (explicit) persistChaoxingInviteCode(explicit)
  }
  return {
    enabled: src.enabled !== false,
    invite_code: invite,
    // 可选元数据：有则用，无则空（禁止回落到已废弃的旧班信息）
    course_id: firstNonEmpty(src.course_id, src.courseId),
    clazz_id: firstNonEmpty(src.clazz_id, src.clazzId, src.class_id),
    course_name: firstNonEmpty(src.course_name, src.courseName),
    teacher_name: firstNonEmpty(src.teacher_name, src.teacherName),
    cpi: firstNonEmpty(src.cpi),
    cover_url: firstNonEmpty(src.cover_url, src.coverUrl)
  }
}

/**
 * 读取当前生效的学习通班级配置
 * 优先级：传入 config → 内存/远程快照 → 邀请码本地缓存 → 内置 18853572
 * @param {object} [config] 可选已归一化/原始 remote config
 */
export function getChaoxingClassConfig(config) {
  if (config && typeof config === 'object') {
    const block = config.chaoxing_class || config.chaoxingClass
    if (block && typeof block === 'object') {
      return normalizeChaoxingClassConfig(block)
    }
    return normalizeRemoteConfig(config).chaoxing_class
  }
  const mem = readMemoryConfig()
  if (mem?.chaoxing_class) {
    // 合并本地邀请码缓存：远程快照可能较旧
    const cached = readCachedChaoxingInvite()
    if (cached && cached !== mem.chaoxing_class.invite_code) {
      // 缓存更新时间由 persist 保证；若快照无 invite 而缓存有，用缓存
      if (!mem.chaoxing_class.invite_code) {
        return { ...mem.chaoxing_class, invite_code: cached }
      }
    }
    return mem.chaoxing_class
  }
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY)
    if (raw) {
      return normalizeRemoteConfig(JSON.parse(raw)).chaoxing_class
    }
  } catch {
    /* ignore */
  }
  return normalizeChaoxingClassConfig({ invite_code: resolveChaoxingInviteCode({}) })
}

const saveSnapshot = (config) => {
  remoteConfigMemory = config && typeof config === 'object' ? normalizeRemoteConfig(config) : null
  remoteConfigMemoryAt = remoteConfigMemory ? Date.now() : 0
  try {
    localStorage.setItem(REMOTE_CONFIG_SNAPSHOT_KEY, JSON.stringify(config))
  } catch {
    // ignore
  }
}

const readMemoryConfig = () => {
  if (!remoteConfigMemory) return null
  if (Date.now() - remoteConfigMemoryAt > REMOTE_CONFIG_MEMORY_TTL_MS) {
    remoteConfigMemory = null
    remoteConfigMemoryAt = 0
    return null
  }
  return remoteConfigMemory
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
    const payload = await withTimeout(
      invoke('fetch_remote_config', { url }),
      REMOTE_CONFIG_FETCH_TIMEOUT_MS,
      '远程配置原生请求超时'
    )
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
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let abortTimer = null
  try {
    if (controller) {
      abortTimer = setTimeout(() => controller.abort(), REMOTE_CONFIG_FETCH_TIMEOUT_MS)
    }
    const res = await withTimeout(
      fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller?.signal
      }),
      REMOTE_CONFIG_FETCH_TIMEOUT_MS,
      '远程配置网页请求超时'
    )
    if (!res.ok) {
      throw new Error(`remote config http ${res.status}`)
    }
    return res.json()
  } finally {
    if (abortTimer) clearTimeout(abortTimer)
  }
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

export async function fetchRemoteConfig(options = {}) {
  const forceRefresh = options?.force === true
  // 演示会话：直接用本地默认并按当前会话夹紧（不污染磁盘上的真实配置）
  if (isTestAccountSession()) {
    return applyAppStoreRemoteConfigClamp(normalizeRemoteConfig(DEFAULT_CONFIG))
  }
  if (!isRemoteConfigEnabled()) {
    return applyAppStoreRemoteConfigClamp(buildLocalOnlyConfig())
  }

  if (!forceRefresh) {
    const memory = readMemoryConfig()
    if (memory) {
      // 内存/快照存未夹紧原文；按当前会话（guest/demo vs 真实登录）再夹紧
      return applyAppStoreRemoteConfigClamp(memory)
    }
    if (remoteConfigInFlight) {
      return remoteConfigInFlight
    }
  }

  const task = (async () => {
    try {
      const raw = await fetchFromAnyUrl()
      if (!isLikelyRemoteConfigPayload(raw)) {
        throw new Error('invalid remote config payload')
      }
      // 持久化未夹紧配置，避免 guest 阶段夹紧后污染真实登录会话
      const normalized = normalizeRemoteConfig(raw)
      // 远程返回即视为有效配置（即使公告为空/关闭 OCR），避免被旧快照反向覆盖。
      saveSnapshot(normalized)
      return applyAppStoreRemoteConfigClamp(normalized)
    } catch {
      // ignore
    }

    const snapshot = loadSnapshot()
    if (snapshot) {
      const normalized = normalizeRemoteConfig(snapshot)
      saveSnapshot(normalized)
      return applyAppStoreRemoteConfigClamp(normalized)
    }
    const fallback = normalizeRemoteConfig(DEFAULT_CONFIG)
    saveSnapshot(fallback)
    return applyAppStoreRemoteConfigClamp(fallback)
  })()

  if (forceRefresh) {
    return task
  }
  remoteConfigInFlight = task
  try {
    return await task
  } finally {
    if (remoteConfigInFlight === task) {
      remoteConfigInFlight = null
    }
  }
}


