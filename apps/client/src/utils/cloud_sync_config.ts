/**
 * cloud_sync_config：云同步运行时配置的读取与合并。
 *
 * 端点优先级（契约 docs/architecture/backend-endpoints-contract.md §4）：
 *   ① 通道级显式覆盖（远程 `cloud_sync.proxy_endpoint`；远程不可用时为本地设置）
 *   ② `backend.groups`（远程组模型；组内所有通道同源）
 *   ③ 本地设置（`app_settings.backend.cloudSyncEndpoint`）
 *   ④ 内置默认（mini.hbut.site 主 + hf.space 唯一兜底）
 *
 * 「兼容镜像」判定：远程显式端点与组派生首项完全相同时，视为配置仓按兼容策略
 * 写入的旧字段镜像，此时忽略显式值、走组模型，以保留兜底能力（否则旧字段会
 * 压住 groups，退化为单端点）。
 *
 * 环境隔离：非 release 构建强制环境端点（testocr1），不启用组模型与故障转移。
 */
import { useAppSettings } from './app_settings'
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
import { STATISTICS_CLOUD_SYNC_ENDPOINT, isStatisticsServiceUrlCompatible } from './statistics_environment'
import {
  buildChannelEndpointList,
  normalizeBackendFailover,
  type BackendFailoverConfig,
  type ChannelEndpoint
} from './backend_endpoints'

export interface CloudSyncRuntimeConfig {
  enabled: boolean
  mode: 'proxy'
  /** 主端点（= endpoints[0].url；无候选时为空串） */
  endpoint: string
  proxyEndpoint: string
  /** 候选端点（主 + 兜底；携带 failoverKey 供组级冷却） */
  endpoints: ChannelEndpoint[]
  /** 故障转移参数（冷却 TTL / 单请求最大尝试数） */
  failover: BackendFailoverConfig
  secretRef: string
  cooldownSec: number
  uploadCooldownSec: number
  downloadCooldownSec: number
  timeoutMs: number
  useRemoteConfig: boolean
}

interface RemoteCloudSync {
  enabled: boolean
  mode: string
  proxyEndpoint: string
  fallbackEndpoints: string[]
  backend: unknown
  hasGroups: boolean
  secretRef: string
  timeoutMs: number
  cooldownSec: number
  uploadCooldownSec: number
  downloadCooldownSec: number
}

const toTextList = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : []
  return list.map((item) => toSafeText(item)).filter(Boolean)
}

const readRemoteCloudSync = (): RemoteCloudSync => {
  const snapshot = safeParseJson<Record<string, unknown>>(
    localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY),
    {}
  )
  const cfg = (snapshot?.cloud_sync && typeof snapshot.cloud_sync === 'object'
    ? (snapshot.cloud_sync as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const backendBlock =
    snapshot?.backend && typeof snapshot.backend === 'object'
      ? (snapshot.backend as Record<string, unknown>)
      : {}
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
    fallbackEndpoints: toTextList(
      cfg?.fallback_endpoints || cfg?.fallbackEndpoints || snapshot?.cloud_sync_fallback_endpoints
    ),
    backend: snapshot?.backend,
    hasGroups: Array.isArray(backendBlock.groups) && backendBlock.groups.length > 0,
    secretRef: toSafeText(
      cfg?.secret_ref || cfg?.secretRef || snapshot?.cloud_sync_secret_ref || DEFAULT_SECRET_REF
    ),
    timeoutMs: clampNumber(cfg?.timeout_ms || cfg?.timeoutMs, 3000, 45000, DEFAULT_TIMEOUT_MS),
    cooldownSec,
    uploadCooldownSec,
    downloadCooldownSec
  }
}

/** 归一化 + 环境隔离过滤（release 拒绝测试域；dev 拒绝生产 hf.space 域） */
const normalizeCompatibleEndpoint = (value: unknown): string => {
  const normalized = normalizeProxyEndpoint(value)
  return normalized && isStatisticsServiceUrlCompatible(normalized) ? normalized : ''
}

/** 解析候选端点（契约 §4），返回已按环境隔离过滤的有序列表 */
const resolveCloudSyncEndpoints = (input: {
  useRemoteConfig: boolean
  isProductionBuild: boolean
  remote: RemoteCloudSync
  localEndpoint: string
  environmentEndpoint: string
}): { endpoints: ChannelEndpoint[]; failover: BackendFailoverConfig } => {
  const { useRemoteConfig, isProductionBuild, remote, localEndpoint, environmentEndpoint } = input

  if (!isProductionBuild) {
    // 非 release：强制环境隔离端点（保持既有行为；本地设置优先）
    const single = localEndpoint || environmentEndpoint
    return {
      endpoints: single ? [{ groupId: 'environment', failoverKey: single, url: single }] : [],
      failover: normalizeBackendFailover(undefined)
    }
  }

  const remoteEndpoint = normalizeCompatibleEndpoint(remote.proxyEndpoint)
  const remoteFallbacks = remote.fallbackEndpoints
    .map((item) => normalizeCompatibleEndpoint(item))
    .filter(Boolean)
  const hasRemoteExplicit = !!remoteEndpoint
  const hasRemoteGroups = useRemoteConfig && remote.hasGroups
  const remoteActive = useRemoteConfig && (hasRemoteExplicit || hasRemoteGroups)

  // 兼容镜像：远程显式端点 == 组派生首项 → 忽略显式值，走组模型
  let overrideEndpoint = remoteEndpoint
  let overrideFallbacks = remoteFallbacks
  if (hasRemoteExplicit && hasRemoteGroups) {
    const groupsProbe = buildChannelEndpointList({
      channel: 'cloud_sync',
      backend: remote.backend,
      includeGroups: true
    })
    if (groupsProbe.endpoints[0]?.url === remoteEndpoint) {
      overrideEndpoint = ''
      overrideFallbacks = []
    }
  }

  const resolution = remoteActive
    ? buildChannelEndpointList({
        channel: 'cloud_sync',
        override: overrideEndpoint,
        overrideFallbacks,
        backend: remote.backend,
        includeGroups: true,
        normalizeUrl: normalizeCompatibleEndpoint
      })
    : buildChannelEndpointList({
        // 远程不可用：仅本地显式设置做覆盖；否则回落内置默认组（mini 主 + hf 兜底）
        channel: 'cloud_sync',
        override: localEndpoint,
        normalizeUrl: normalizeCompatibleEndpoint
      })

  const endpoints = resolution.endpoints.filter((item) =>
    isStatisticsServiceUrlCompatible(item.url)
  )
  const failover = normalizeBackendFailover(
    hasRemoteGroups ? (remote.backend as Record<string, unknown>)?.failover : undefined
  )
  return { endpoints, failover }
}

export const getCloudSyncRuntimeConfig = (): CloudSyncRuntimeConfig => {
  const backend = (useAppSettings()?.backend || {}) as Record<string, unknown>
  const moduleParams = (backend?.moduleParams || {}) as Record<string, unknown>
  const remote = readRemoteCloudSync()
  const useRemoteConfig = backend?.useRemoteConfig !== false
  const localEndpoint = normalizeCompatibleEndpoint(backend?.cloudSyncEndpoint)
  const environmentEndpoint = normalizeCompatibleEndpoint(STATISTICS_CLOUD_SYNC_ENDPOINT)
  const isProductionBuild = import.meta.env.VITE_BUILD_PROFILE === 'release'

  const { endpoints, failover } = resolveCloudSyncEndpoints({
    useRemoteConfig,
    isProductionBuild,
    remote,
    localEndpoint,
    environmentEndpoint
  })
  const proxyEndpoint = endpoints[0]?.url || ''

  const localSecretRef = toSafeText(backend?.cloudSyncSecretRef)
  const secretRef = useRemoteConfig
    ? localSecretRef || remote.secretRef || DEFAULT_SECRET_REF
    : localSecretRef || DEFAULT_SECRET_REF

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
  const enabled = Boolean(proxyEndpoint) && (useRemoteConfig ? remote.enabled || !!localEndpoint : true)

  return {
    enabled,
    mode: 'proxy',
    endpoint: proxyEndpoint,
    proxyEndpoint,
    endpoints,
    failover,
    secretRef,
    cooldownSec,
    uploadCooldownSec,
    downloadCooldownSec,
    timeoutMs,
    useRemoteConfig
  }
}
