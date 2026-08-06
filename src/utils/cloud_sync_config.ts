/**
 * cloud_sync_config：云同步运行时配置的读取与合并。
 * 优先级：本地模块参数 > 远端配置快照 > 默认值。
 */
import {
  DEFAULT_CLOUD_SYNC_ENDPOINT,
  useAppSettings
} from './app_settings'
import {
  DEFAULT_COOLDOWN_SEC,
  DEFAULT_DOWNLOAD_COOLDOWN_SEC,
  DEFAULT_SECRET_REF,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_UPLOAD_COOLDOWN_SEC,
  REMOTE_CONFIG_SNAPSHOT_KEY,
  clampNumber,
  normalizeProxyEndpoint,
  safeParseJson,
  toSafeText
} from './cloud_sync_storage.js'

export interface CloudSyncRuntimeConfig {
  enabled: boolean
  mode: 'proxy'
  endpoint: string
  proxyEndpoint: string
  secretRef: string
  cooldownSec: number
  uploadCooldownSec: number
  downloadCooldownSec: number
  timeoutMs: number
  useRemoteConfig: boolean
}

const readRemoteCloudSync = (): {
  enabled: boolean
  mode: string
  proxyEndpoint: string
  secretRef: string
  timeoutMs: number
  cooldownSec: number
  uploadCooldownSec: number
  downloadCooldownSec: number
} => {
  const snapshot = safeParseJson<Record<string, unknown>>(localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY), {})
  const cfg = (snapshot?.cloud_sync && typeof snapshot.cloud_sync === 'object'
    ? (snapshot.cloud_sync as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const cooldownSec = clampNumber(
    cfg?.cooldown_seconds || cfg?.cooldownSeconds,
    10,
    3600,
    DEFAULT_COOLDOWN_SEC
  )
  const uploadCooldownSec = clampNumber(
    cfg?.upload_cooldown_seconds || cfg?.uploadCooldownSeconds || cooldownSec,
    120,
    3600,
    DEFAULT_UPLOAD_COOLDOWN_SEC
  )
  const downloadCooldownSec = clampNumber(
    cfg?.download_cooldown_seconds || cfg?.downloadCooldownSeconds || cooldownSec,
    10,
    3600,
    DEFAULT_DOWNLOAD_COOLDOWN_SEC
  )
  return {
    enabled: cfg?.enabled !== false,
    mode: toSafeText(cfg?.mode || snapshot?.cloud_sync_mode || 'proxy') || 'proxy',
    proxyEndpoint: normalizeProxyEndpoint(
      cfg?.proxy_endpoint ||
      cfg?.proxyEndpoint ||
      cfg?.endpoint ||
      snapshot?.cloud_sync_proxy_endpoint ||
      snapshot?.cloud_sync_endpoint
    ),
    secretRef: toSafeText(
      cfg?.secret_ref ||
      cfg?.secretRef ||
      snapshot?.cloud_sync_secret_ref ||
      DEFAULT_SECRET_REF
    ),
    timeoutMs: clampNumber(cfg?.timeout_ms || cfg?.timeoutMs, 3000, 45000, DEFAULT_TIMEOUT_MS),
    cooldownSec,
    uploadCooldownSec,
    downloadCooldownSec
  }
}

export const getCloudSyncRuntimeConfig = (): CloudSyncRuntimeConfig => {
  const backend = (useAppSettings()?.backend || {}) as Record<string, unknown>
  const moduleParams = (backend?.moduleParams || {}) as Record<string, unknown>
  const remote = readRemoteCloudSync()
  const useRemoteConfig = backend?.useRemoteConfig !== false
  const localEndpoint = normalizeProxyEndpoint(backend?.cloudSyncEndpoint)
  const localSecretRef = toSafeText(backend?.cloudSyncSecretRef)
  const defaultEndpoint = normalizeProxyEndpoint(DEFAULT_CLOUD_SYNC_ENDPOINT)

  const proxyEndpoint = useRemoteConfig
    ? (localEndpoint || remote.proxyEndpoint || defaultEndpoint)
    : (localEndpoint || defaultEndpoint)

  const secretRef = useRemoteConfig
    ? (localSecretRef || remote.secretRef || DEFAULT_SECRET_REF)
    : (localSecretRef || DEFAULT_SECRET_REF)

  const cooldownSec = clampNumber(
    moduleParams?.cloudSyncCooldownSec || remote.cooldownSec,
    10,
    3600,
    DEFAULT_COOLDOWN_SEC
  )
  const uploadCooldownSec = clampNumber(
    moduleParams?.cloudSyncUploadCooldownSec || remote.uploadCooldownSec || cooldownSec,
    120,
    3600,
    DEFAULT_UPLOAD_COOLDOWN_SEC
  )
  const downloadCooldownSec = clampNumber(
    moduleParams?.cloudSyncDownloadCooldownSec || remote.downloadCooldownSec || cooldownSec,
    10,
    3600,
    DEFAULT_DOWNLOAD_COOLDOWN_SEC
  )
  const timeoutMs = clampNumber(
    moduleParams?.requestTimeoutMs || remote.timeoutMs,
    3000,
    45000,
    DEFAULT_TIMEOUT_MS
  )
  const enabled = Boolean(proxyEndpoint) && (useRemoteConfig ? (remote.enabled || !!localEndpoint) : true)

  return {
    enabled,
    mode: 'proxy',
    endpoint: proxyEndpoint,
    proxyEndpoint,
    secretRef,
    cooldownSec,
    uploadCooldownSec,
    downloadCooldownSec,
    timeoutMs,
    useRemoteConfig
  }
}
