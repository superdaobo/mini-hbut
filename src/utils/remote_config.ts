/**
 * remote_config：远程配置拉取 / 归一化 / 快照 / OCR 运行时的真实 TypeScript 实现。
 * 常量、端点与模块中心归一化工具收敛在 ./remote_config_defaults.ts。
 */
import { invokeNative as invoke } from '../platform/native'
import { detectRuntime } from '../platform/runtime'
import { DEFAULT_CLOUD_SYNC_ENDPOINT } from './app_settings'
import { isTestAccountSession } from './test_account.js'
import { shouldApplyAppStoreRestrictions } from '../config/app_store_policy'
import {
  CHAOXING_INVITE_CACHE_KEY,
  DEFAULT_CHAOXING_INVITE_CODE,
  DEFAULT_CLOUD_SYNC_CREDENTIAL_REF_ID,
  DEFAULT_CONFIG,
  DEFAULT_FORUM_ENDPOINT,
  DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS,
  DEFAULT_OCR_ENDPOINT,
  DEFAULT_OCR_ENDPOINTS,
  DEFAULT_WEBDAV_ENDPOINT,
  PACKAGE_CONFIG_URL,
  REMOTE_CONFIG_FETCH_TIMEOUT_MS,
  REMOTE_CONFIG_KEYS,
  REMOTE_CONFIG_MEMORY_TTL_MS,
  REMOTE_CONFIG_SNAPSHOT_KEY,
  REMOTE_CONFIG_URLS,
  firstNonEmpty,
  getBackendSettings,
  getLocalForumEndpointOverride,
  getStoredOcrConfig,
  isRemoteConfigEnabled,
  normalizeCloudSyncProxyEndpoint,
  normalizeEndpointList,
  normalizeForumEndpoint,
  normalizeOcrEndpoint,
  persistOcrConfig,
  resolveAnnouncements,
  resolveModuleCenter,
  toArray,
  toText,
  withCacheBust,
  withTimeout
} from './remote_config_defaults.js'

export { DEFAULT_CHAOXING_INVITE_CODE } from './remote_config_defaults.js'

export interface AnnouncementConfig {
  pinned: unknown[]
  ticker: unknown[]
  list: unknown[]
  confirm: unknown[]
}

export interface OcrRuntimeConfig {
  endpoint: string
  endpoints: string[]
  local_fallback_endpoints: string[]
  enabled?: boolean
}

export interface ChaoxingClassConfig {
  enabled?: boolean
  invite_code: string
  [key: string]: unknown
}

export interface RemoteModuleEntry {
  id: string
  order: number
  manifest_url?: string
  [key: string]: unknown
}

export interface RemoteConfig {
  announcements: AnnouncementConfig
  force_update: {
    min_version: string
    message: string
    download_url: string
  }
  ocr: OcrRuntimeConfig
  temp_file_server: Record<string, unknown>
  resource_share: Record<string, unknown>
  forum: Record<string, unknown>
  cloud_sync: Record<string, unknown>
  module_center: {
    channel: string
    modules: RemoteModuleEntry[]
  }
  chaoxing_class: ChaoxingClassConfig
  ai_models: unknown[]
  config_admin_ids: string[]
  [key: string]: unknown
}

export interface RemoteConfigInput extends Record<string, unknown> {
  announcements?: Partial<AnnouncementConfig>
  force_update?: Partial<RemoteConfig['force_update']>
  ocr?: Partial<OcrRuntimeConfig>
  temp_file_server?: Record<string, unknown>
  resource_share?: Record<string, unknown>
  forum?: Record<string, unknown>
  cloud_sync?: Record<string, unknown>
  module_center?: Partial<RemoteConfig['module_center']>
  chaoxing_class?: Partial<ChaoxingClassConfig>
  ai_models?: unknown[]
  config_admin_ids?: string[]
}

export interface RemoteConfigFetchOptions {
  force?: boolean
  emitEvent?: boolean
}

export interface ChaoxingNormalizeOptions {
  persistInvite?: boolean
}

export interface RemoteConfigRefreshResult {
  changed: boolean
  source: string
  config?: RemoteConfig
  error?: string
}

export interface StoredOcrConfig {
  endpoint: string
  endpoints: string[]
  local_fallback_endpoints: string[]
}

/** 快照被远端更新后派发，供 App 重新 apply */
export const REMOTE_CONFIG_UPDATED_EVENT = 'hbu-remote-config-updated'

/** 内存层缓存：与 localStorage 同步，便于测试/无 storage 环境 */
let chaoxingInviteMemory = ''
// 远程配置短时内存缓存：降低登录期重复拉取与并发请求。
let remoteConfigMemory: RemoteConfig | null = null
let remoteConfigMemoryAt = 0
let remoteConfigInFlight: Promise<RemoteConfig> | null = null
let remoteConfigBackgroundInFlight: Promise<unknown> | null = null

const buildLocalOnlyConfig = (): RemoteConfig => {
  const backend = getBackendSettings()
  const normalized = normalizeRemoteConfig(DEFAULT_CONFIG)
  const moduleParams = (backend?.moduleParams || {}) as Record<string, unknown>

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
    secret_ref: firstNonEmpty(backend?.cloudSyncSecretRef, DEFAULT_CLOUD_SYNC_CREDENTIAL_REF_ID),
    timeout_ms: 12000,
    cooldown_seconds: Number(moduleParams.cloudSyncCooldownSec || 180),
    upload_cooldown_seconds: Number(moduleParams.cloudSyncUploadCooldownSec || 120),
    download_cooldown_seconds: Number(moduleParams.cloudSyncDownloadCooldownSec || 10)
  }

  return normalized
}

export function normalizeRemoteConfig(raw: unknown): RemoteConfig {
  const cfg = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const ocrBlock = cfg.ocr && typeof cfg.ocr === 'object'
    ? (cfg.ocr as Record<string, unknown>)
    : {}
  const announcements = resolveAnnouncements(cfg)
  const endpointCandidates = [
    ...toArray(ocrBlock.endpoints),
    ocrBlock.endpoint,
    ocrBlock.url,
    cfg.ocr_endpoint,
    cfg.ocrUrl
  ]
  const normalizedEndpoints = normalizeEndpointList(endpointCandidates)
  const ocrEndpoints =
    normalizedEndpoints.length > 0 ? normalizedEndpoints : [...DEFAULT_OCR_ENDPOINTS]

  const localFallbackCandidates = [
    ...toArray(ocrBlock.local_fallback_endpoints),
    ...toArray(ocrBlock.localFallbackEndpoints),
    ...toArray(cfg.ocr_local_fallback_endpoints)
  ]
  const normalizedLocalFallback = normalizeEndpointList(localFallbackCandidates)
  const localFallbackEndpoints =
    normalizedLocalFallback.length > 0
      ? normalizedLocalFallback
      : [...DEFAULT_LOCAL_OCR_FALLBACK_ENDPOINTS]
  const forumEndpointOverride = getLocalForumEndpointOverride()

  const forceUpdate = cfg.force_update && typeof cfg.force_update === 'object'
    ? (cfg.force_update as Record<string, unknown>)
    : {}
  const tempFileServer = cfg.temp_file_server && typeof cfg.temp_file_server === 'object'
    ? (cfg.temp_file_server as Record<string, unknown>)
    : {}
  const resourceShare = cfg.resource_share && typeof cfg.resource_share === 'object'
    ? (cfg.resource_share as Record<string, unknown>)
    : {}
  const webdav = cfg.webdav && typeof cfg.webdav === 'object'
    ? (cfg.webdav as Record<string, unknown>)
    : {}
  const forum = cfg.forum && typeof cfg.forum === 'object'
    ? (cfg.forum as Record<string, unknown>)
    : {}
  const cloudSync = cfg.cloud_sync && typeof cfg.cloud_sync === 'object'
    ? (cfg.cloud_sync as Record<string, unknown>)
    : {}
  const sync = cfg.sync && typeof cfg.sync === 'object'
    ? (cfg.sync as Record<string, unknown>)
    : {}

  return {
    announcements,
    force_update: {
      min_version: firstNonEmpty(forceUpdate.min_version, forceUpdate.minVersion),
      message: firstNonEmpty(forceUpdate.message),
      download_url: firstNonEmpty(forceUpdate.download_url, forceUpdate.downloadUrl)
    },
    ocr: {
      endpoint: ocrEndpoints[0] || DEFAULT_OCR_ENDPOINT,
      endpoints: ocrEndpoints,
      local_fallback_endpoints: localFallbackEndpoints,
      enabled: ocrBlock.enabled !== false
    },
    temp_file_server: {
      schedule_upload_endpoint: firstNonEmpty(
        tempFileServer.schedule_upload_endpoint,
        tempFileServer.upload_endpoint,
        tempFileServer.endpoint,
        cfg.temp_upload_endpoint
      ),
      enabled: tempFileServer.enabled !== false
    },
    resource_share: {
      enabled: resourceShare.enabled !== false,
      endpoint: firstNonEmpty(
        resourceShare.endpoint,
        webdav.endpoint,
        DEFAULT_WEBDAV_ENDPOINT
      ),
      username: firstNonEmpty(resourceShare.username, webdav.username, 'mini-hbut'),
      password: firstNonEmpty(resourceShare.password, webdav.password, 'mini-hbut'),
      office_preview_proxy: firstNonEmpty(
        resourceShare.office_preview_proxy,
        'https://view.officeapps.live.com/op/view.aspx?src='
      ),
      temp_upload_endpoint: firstNonEmpty(
        resourceShare.temp_upload_endpoint,
        tempFileServer.schedule_upload_endpoint,
        tempFileServer.upload_endpoint
      )
    },
    forum: {
      enabled: forum.enabled !== false,
      api_base: normalizeForumEndpoint(
        firstNonEmpty(
          forumEndpointOverride,
          forum.api_base,
          forum.apiBase,
          forum.endpoint,
          cfg.forum_api_base,
          DEFAULT_FORUM_ENDPOINT
        )
      )
    },
    cloud_sync: {
      enabled: cloudSync.enabled !== false,
      mode: firstNonEmpty(
        cloudSync.mode,
        cfg.cloud_sync_mode,
        sync.mode,
        'proxy'
      ),
      proxy_endpoint: normalizeCloudSyncProxyEndpoint(
        firstNonEmpty(
          cloudSync.proxy_endpoint,
          cloudSync.proxyEndpoint,
          cloudSync.endpoint,
          cfg.cloud_sync_proxy_endpoint,
          cfg.cloud_sync_endpoint,
          sync.proxy_endpoint,
          DEFAULT_CLOUD_SYNC_ENDPOINT
        )
      ),
      secret_ref: firstNonEmpty(
        cloudSync.secret_ref,
        cloudSync.secretRef,
        cfg.cloud_sync_secret_ref,
        sync.secret_ref,
        DEFAULT_CLOUD_SYNC_CREDENTIAL_REF_ID
      ),
      timeout_ms: Number(
        cloudSync.timeout_ms ||
          cloudSync.timeoutMs ||
          sync.timeout_ms ||
          12000
      ),
      cooldown_seconds: Number(
        cloudSync.cooldown_seconds ||
          cloudSync.cooldownSeconds ||
          sync.cooldown_seconds ||
          180
      ),
      upload_cooldown_seconds: Number(
        cloudSync.upload_cooldown_seconds ||
          cloudSync.uploadCooldownSeconds ||
          sync.upload_cooldown_seconds ||
          cloudSync.cooldown_seconds ||
          cloudSync.cooldownSeconds ||
          sync.cooldown_seconds ||
          120
      ),
      download_cooldown_seconds: Number(
        cloudSync.download_cooldown_seconds ||
          cloudSync.downloadCooldownSeconds ||
          sync.download_cooldown_seconds ||
          cloudSync.cooldown_seconds ||
          cloudSync.cooldownSeconds ||
          sync.cooldown_seconds ||
          10
      )
    },
    module_center: resolveModuleCenter(cfg),
    chaoxing_class: normalizeChaoxingClassConfig(cfg.chaoxing_class || cfg.chaoxingClass, {
      // 远程 payload 里有 invite 时写入本地缓存（断网可复用）
      persistInvite: !!(cfg.chaoxing_class || cfg.chaoxingClass)
    }),
    ai_models: toArray(cfg.ai_models),
    config_admin_ids: toArray(cfg.config_admin_ids).map((item) => String(item))
  }
}

/**
 * 合规包 guest/demo：仍返回已拉取的配置，但锁死高风险能力（远程 true 无法打开）。
 * 非合规构建或真实登录：原样返回。
 */
export function applyAppStoreRemoteConfigClamp(config: RemoteConfigInput): RemoteConfig {
  if (!shouldApplyAppStoreRestrictions() || !config || typeof config !== 'object') {
    return config as RemoteConfig
  }
  const next: Record<string, unknown> = { ...config }
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
  const ocr = { ...(config.ocr || {}) } as Record<string, unknown>
  const httpsOnly = (list: unknown): string[] =>
    toArray(list)
      .map((u) => String(u || '').trim())
      .filter((u) => /^https:\/\//i.test(u))
  ocr.local_fallback_endpoints = httpsOnly(ocr.local_fallback_endpoints)
  ocr.endpoints = httpsOnly(ocr.endpoints).length
    ? httpsOnly(ocr.endpoints)
    : httpsOnly([ocr.endpoint])
  if (Array.isArray(ocr.endpoints) && ocr.endpoints[0]) ocr.endpoint = ocr.endpoints[0]
  next.ocr = ocr
  // 远程不得强制打开云同步；用户侧另有默认关策略
  next.cloud_sync = {
    ...(config.cloud_sync || {}),
    enabled: false
  }
  return next as RemoteConfig
}

const readCachedChaoxingInvite = (): string => {
  if (chaoxingInviteMemory) return chaoxingInviteMemory
  try {
    const fromStore = toText(localStorage.getItem(CHAOXING_INVITE_CACHE_KEY)).trim()
    if (fromStore) chaoxingInviteMemory = fromStore
    return fromStore
  } catch {
    return chaoxingInviteMemory || ''
  }
}

/**
 * 远程成功下发邀请码后写入本地缓存，断网时仍可用上一版邀请码
 */
export function persistChaoxingInviteCode(code: unknown): string {
  const invite = toText(code).trim()
  if (!invite) return ''
  chaoxingInviteMemory = invite
  try {
    localStorage.setItem(CHAOXING_INVITE_CACHE_KEY, invite)
  } catch {
    /* ignore */
  }
  return invite
}

/**
 * 解析当前应使用的邀请码：显式配置 → 本地缓存 → 内置默认
 */
export function resolveChaoxingInviteCode(rawBlock: unknown): string {
  const src = rawBlock && typeof rawBlock === 'object' ? (rawBlock as Record<string, unknown>) : {}
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
 */
export function normalizeChaoxingClassConfig(
  raw: unknown,
  options: ChaoxingNormalizeOptions = {}
): ChaoxingClassConfig {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
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
 */
export function getChaoxingClassConfig(config: RemoteConfigInput | null | undefined): ChaoxingClassConfig {
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

/** 规范化配置的稳定指纹，用于判断远端是否相对快照有变动 */
export const remoteConfigFingerprint = (config: RemoteConfigInput): string => {
  try {
    const normalized = normalizeRemoteConfig(config || {})
    return JSON.stringify(normalized)
  } catch {
    return ''
  }
}

const setMemoryConfig = (config: unknown): void => {
  remoteConfigMemory = config && typeof config === 'object' ? normalizeRemoteConfig(config) : null
  remoteConfigMemoryAt = remoteConfigMemory ? Date.now() : 0
}

const saveSnapshot = (
  config: unknown,
  { emitEvent = false, previousFingerprint = null }: {
    emitEvent?: boolean
    previousFingerprint?: string | null
  } = {}
): { saved: boolean; changed: boolean; fingerprint?: string } => {
  const normalized = config && typeof config === 'object' ? normalizeRemoteConfig(config) : null
  setMemoryConfig(normalized)
  if (!normalized) return { saved: false, changed: false }

  const nextFp = remoteConfigFingerprint(normalized)
  const prevFp =
    previousFingerprint != null
      ? previousFingerprint
      : (() => {
          try {
            const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY)
            return raw ? remoteConfigFingerprint(JSON.parse(raw)) : ''
          } catch {
            return ''
          }
        })()
  const changed = nextFp !== prevFp

  if (changed || !prevFp) {
    try {
      localStorage.setItem(REMOTE_CONFIG_SNAPSHOT_KEY, JSON.stringify(normalized))
    } catch {
      // ignore
    }
  }

  if (emitEvent && changed) {
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(
          new CustomEvent(REMOTE_CONFIG_UPDATED_EVENT, {
            detail: { source: 'remote', fingerprint: nextFp }
          })
        )
      }
    } catch {
      // ignore
    }
  }

  return { saved: true, changed, fingerprint: nextFp }
}

const readMemoryConfig = (): RemoteConfig | null => {
  if (!remoteConfigMemory) return null
  if (Date.now() - remoteConfigMemoryAt > REMOTE_CONFIG_MEMORY_TTL_MS) {
    remoteConfigMemory = null
    remoteConfigMemoryAt = 0
    return null
  }
  return remoteConfigMemory
}

const loadSnapshot = (): unknown => {
  try {
    const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 读取已落盘快照（未夹紧）；无则 null */
export const readRemoteConfigSnapshot = (): RemoteConfig | null => {
  const raw = loadSnapshot()
  if (!raw) return null
  return normalizeRemoteConfig(raw)
}

const fetchByInvoke = async (url: string): Promise<unknown> => {
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

const parseRemoteJson = (raw: unknown): Record<string, unknown> | null => {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

const isLikelyRemoteConfigPayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  return REMOTE_CONFIG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key))
}

const fetchByCapacitor = async (url: string): Promise<unknown> => {
  if (detectRuntime() !== 'capacitor') return null
  try {
    const core = await import('@capacitor/core')
    const capHttp =
      core?.CapacitorHttp || (window as unknown as {
        Capacitor?: { Plugins?: { CapacitorHttp?: { request?: (options: unknown) => Promise<{ data?: unknown }> } } }
      })?.Capacitor?.Plugins?.CapacitorHttp
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

const fetchByWeb = async (url: string): Promise<unknown> => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let abortTimer: ReturnType<typeof setTimeout> | null = null
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

const fetchFromUrlList = async (
  baseUrls: readonly string[]
): Promise<{ payload: Record<string, unknown>; sourceUrl: string }> => {
  let lastError = ''
  for (const baseUrl of baseUrls || []) {
    const url = withCacheBust(baseUrl)
    if (!url) continue

    // 本地相对路径只走 web fetch，不走 native invoke
    const isLocalUrl = String(baseUrl).startsWith('/')
    if (!isLocalUrl) {
      const byInvoke = await fetchByInvoke(url)
      if (byInvoke && isLikelyRemoteConfigPayload(byInvoke)) {
        return { payload: byInvoke as Record<string, unknown>, sourceUrl: baseUrl }
      }

      const byCapacitor = await fetchByCapacitor(url)
      if (byCapacitor && isLikelyRemoteConfigPayload(byCapacitor)) {
        return { payload: byCapacitor as Record<string, unknown>, sourceUrl: baseUrl }
      }
    }

    try {
      const byWeb = await fetchByWeb(url)
      if (byWeb && isLikelyRemoteConfigPayload(byWeb)) {
        return { payload: byWeb as Record<string, unknown>, sourceUrl: baseUrl }
      }
    } catch (e) {
      lastError = (e as Error | undefined)?.message || String(e)
    }
  }
  throw new Error(lastError || 'remote config unavailable')
}

/** 仅真远端（不含打包 json） */
const fetchFromRemoteUrls = async (): Promise<{ payload: Record<string, unknown>; sourceUrl: string }> =>
  fetchFromUrlList(REMOTE_CONFIG_URLS)

/** 打包内兜底 */
const fetchFromPackageUrl = async (): Promise<{ payload: Record<string, unknown>; sourceUrl: string }> =>
  fetchFromUrlList([PACKAGE_CONFIG_URL])

/**
 * 拉取真远端；有变动则写快照并派发事件。
 */
export async function refreshRemoteConfigFromNetwork(
  options: RemoteConfigFetchOptions = {}
): Promise<RemoteConfigRefreshResult> {
  const emitEvent = options?.emitEvent !== false
  const snapshot = loadSnapshot()
  const prevFp = snapshot ? remoteConfigFingerprint(snapshot as RemoteConfigInput) : ''

  try {
    const { payload } = await fetchFromRemoteUrls()
    const normalized = normalizeRemoteConfig(payload)
    const { changed } = saveSnapshot(normalized, {
      emitEvent,
      previousFingerprint: prevFp
    })
    return {
      config: applyAppStoreRemoteConfigClamp(normalized),
      changed,
      source: 'remote'
    }
  } catch {
    // 远端失败：保留快照，绝不让打包 json 覆盖
    if (snapshot) {
      const normalized = normalizeRemoteConfig(snapshot)
      setMemoryConfig(normalized)
      return {
        config: applyAppStoreRemoteConfigClamp(normalized),
        changed: false,
        source: 'snapshot'
      }
    }
    return { config: undefined, changed: false, source: 'none' }
  }
}

const scheduleBackgroundRemoteRefresh = (): Promise<unknown> | null => {
  if (remoteConfigBackgroundInFlight) return remoteConfigBackgroundInFlight
  if (isTestAccountSession()) return null
  if (!isRemoteConfigEnabled()) return null

  remoteConfigBackgroundInFlight = refreshRemoteConfigFromNetwork({ emitEvent: true })
    .catch(() => null)
    .finally(() => {
      remoteConfigBackgroundInFlight = null
    })
  return remoteConfigBackgroundInFlight
}

export const applyOcrRuntimeConfig = async (
  configLike: unknown
): Promise<{ endpoints: string[]; localFallbackEndpoints: string[] }> => {
  const cfg = configLike && typeof configLike === 'object'
    ? (configLike as { ocr?: Record<string, unknown> })
    : {}
  const ocrBlock = cfg.ocr && typeof cfg.ocr === 'object' ? cfg.ocr : {}
  const enabled = ocrBlock.enabled !== false
  const ocrPayload = enabled ? ocrBlock : null
  const persisted = persistOcrConfig({
    endpoints: enabled
      ? (ocrPayload?.endpoints as unknown[] | undefined) || (ocrPayload?.endpoint ? [ocrPayload.endpoint] : [])
      : [],
    local_fallback_endpoints: enabled
      ? (ocrPayload?.local_fallback_endpoints as unknown[] | undefined) || []
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

export async function fetchRemoteConfig(
  options: RemoteConfigFetchOptions = {}
): Promise<RemoteConfig> {
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
      // 短时内存命中：后台仍可静默刷新远端
      scheduleBackgroundRemoteRefresh()
      return applyAppStoreRemoteConfigClamp(memory)
    }
    if (remoteConfigInFlight) {
      return remoteConfigInFlight
    }

    // 冷启动优先：先返回上次远端快照，再后台拉真远端覆盖
    const snapshot = loadSnapshot()
    if (snapshot) {
      const normalized = normalizeRemoteConfig(snapshot)
      setMemoryConfig(normalized)
      scheduleBackgroundRemoteRefresh()
      return applyAppStoreRemoteConfigClamp(normalized)
    }
  }

  const task = (async (): Promise<RemoteConfig> => {
    // force 或无快照：必须等网络
    try {
      const { payload } = await fetchFromRemoteUrls()
      const normalized = normalizeRemoteConfig(payload)
      const prev = loadSnapshot()
      saveSnapshot(normalized, {
        emitEvent: false,
        previousFingerprint: prev ? remoteConfigFingerprint(prev as RemoteConfigInput) : ''
      })
      return applyAppStoreRemoteConfigClamp(normalized)
    } catch {
      // 真远端失败
    }

    const snapshot = loadSnapshot()
    if (snapshot) {
      const normalized = normalizeRemoteConfig(snapshot)
      setMemoryConfig(normalized)
      return applyAppStoreRemoteConfigClamp(normalized)
    }

    // 零次安装兜底：打包 json → 代码 DEFAULT（可写入快照作为起点）
    try {
      const { payload } = await fetchFromPackageUrl()
      const normalized = normalizeRemoteConfig(payload)
      saveSnapshot(normalized, { emitEvent: false, previousFingerprint: '' })
      return applyAppStoreRemoteConfigClamp(normalized)
    } catch {
      // ignore
    }

    const fallback = normalizeRemoteConfig(DEFAULT_CONFIG)
    saveSnapshot(fallback, { emitEvent: false, previousFingerprint: '' })
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

export {
  isRemoteConfigEnabled,
  getStoredOcrConfig
}
