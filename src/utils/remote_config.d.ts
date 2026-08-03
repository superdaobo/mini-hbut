// 测试 fixture：remote_config 模块类型声明（与 remote_config.js 导出对齐）
export interface RemoteConfigModuleEntry {
  id: string
  name?: string
  order?: number
  kind?: string
  [key: string]: unknown
}

export interface RemoteConfigModuleCenter {
  channel: string
  modules: RemoteConfigModuleEntry[]
  [key: string]: unknown
}

export interface RemoteConfigChaoxingClass {
  invite_code: string
  course_id?: string
  course_name?: string
  enabled?: boolean
  [key: string]: unknown
}

export interface RemoteConfigAnnouncement {
  id?: string
  title?: string
  summary?: string
  content?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RemoteConfigTicker {
  ticker: RemoteConfigAnnouncement[]
  [key: string]: unknown
}

export interface RemoteConfigOcr {
  endpoints?: string[]
  local_fallback_endpoints: string[]
  enabled?: boolean
  [key: string]: unknown
}

export interface RemoteConfig {
  module_center: RemoteConfigModuleCenter
  chaoxing_class: RemoteConfigChaoxingClass
  forum: { enabled?: boolean; api_base?: string; [key: string]: unknown }
  resource_share: { enabled?: boolean; endpoint?: string; [key: string]: unknown }
  cloud_sync: { enabled?: boolean; [key: string]: unknown }
  announcements: RemoteConfigTicker
  ocr: RemoteConfigOcr
  ai_models?: unknown[]
  config_admin_ids?: unknown[]
  inviteCode?: string
  [key: string]: unknown
}

export interface OcrRuntimePayload {
  endpoints: string[]
  localFallbackEndpoints: string[]
}

export const REMOTE_CONFIG_UPDATED_EVENT: string
export const DEFAULT_CHAOXING_INVITE_CODE: string
export function isRemoteConfigEnabled(): boolean
export function getStoredOcrConfig(): Record<string, unknown> | null
export function normalizeRemoteConfig(raw: unknown): RemoteConfig
export function applyAppStoreRemoteConfigClamp(config: RemoteConfig): RemoteConfig
export function persistChaoxingInviteCode(code: string): void
export function resolveChaoxingInviteCode(rawBlock: unknown): string
export function normalizeChaoxingClassConfig(raw: unknown, options?: { persistInvite?: boolean }): RemoteConfigChaoxingClass
export function getChaoxingClassConfig(config: Partial<RemoteConfig>): RemoteConfigChaoxingClass
export function remoteConfigFingerprint(config: unknown): string
export function readRemoteConfigSnapshot(): RemoteConfig | null
export function refreshRemoteConfigFromNetwork(options?: Record<string, unknown>): Promise<{
  config: RemoteConfig | null
  changed: boolean
  source: string
}>
export function applyOcrRuntimeConfig(configLike: RemoteConfig | null): Promise<OcrRuntimePayload>
export function fetchRemoteConfig(options?: Record<string, unknown>): Promise<RemoteConfig>
