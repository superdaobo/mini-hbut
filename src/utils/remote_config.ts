// @ts-expect-error Runtime implementation is isolated behind this typed facade.
import * as runtime from './remote_config.runtime.js'

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

export const REMOTE_CONFIG_UPDATED_EVENT: string = runtime.REMOTE_CONFIG_UPDATED_EVENT
export const DEFAULT_CHAOXING_INVITE_CODE: string = runtime.DEFAULT_CHAOXING_INVITE_CODE
export const isRemoteConfigEnabled = runtime.isRemoteConfigEnabled as () => boolean
export const getStoredOcrConfig = runtime.getStoredOcrConfig as () => StoredOcrConfig
export const normalizeRemoteConfig = runtime.normalizeRemoteConfig as (raw: unknown) => RemoteConfig
export const applyAppStoreRemoteConfigClamp = runtime.applyAppStoreRemoteConfigClamp as (
  config: RemoteConfigInput
) => RemoteConfig
export const persistChaoxingInviteCode = runtime.persistChaoxingInviteCode as (
  code: unknown
) => string
export const resolveChaoxingInviteCode = runtime.resolveChaoxingInviteCode as (
  rawBlock: unknown
) => string
export const normalizeChaoxingClassConfig = runtime.normalizeChaoxingClassConfig as (
  raw: unknown,
  options?: ChaoxingNormalizeOptions
) => ChaoxingClassConfig
export const getChaoxingClassConfig = runtime.getChaoxingClassConfig as (
  config: RemoteConfigInput
) => ChaoxingClassConfig
export const remoteConfigFingerprint = runtime.remoteConfigFingerprint as (
  config: RemoteConfigInput
) => string
export const readRemoteConfigSnapshot = runtime.readRemoteConfigSnapshot as () => RemoteConfig | null
export const refreshRemoteConfigFromNetwork = runtime.refreshRemoteConfigFromNetwork as (
  options?: RemoteConfigFetchOptions
) => Promise<RemoteConfigRefreshResult>
export const applyOcrRuntimeConfig = runtime.applyOcrRuntimeConfig as (
  configLike: unknown
) => Promise<StoredOcrConfig>
export const fetchRemoteConfig = runtime.fetchRemoteConfig as (
  options?: RemoteConfigFetchOptions
) => Promise<RemoteConfig>
