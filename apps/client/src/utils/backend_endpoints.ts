/**
 * backend_endpoints：后端端点组（backend groups）纯函数层。
 *
 * 契约：docs/architecture/backend-endpoints-contract.md（v1，2026-10-02 冻结）
 * 关键决策：
 * - 「组」= 一个后端域名 + 通道路径映射；组内所有通道同源，故障转移以组为单位；
 * - 顺序即优先级；仅接受 HTTPS（loopback 例外）；去重保序；非法项丢弃并计数；
 * - 本文件是叶子模块：不得 import 任何业务模块，保证在任意层可安全引用。
 */

/** 参与组模型派生的后端通道（WebDAV 等独立地址不在此列，见契约 §5） */
export type BackendChannel =
  | 'cloud_sync'
  | 'game_rank'
  | 'game_platform'
  | 'ocr'
  | 'temp_upload'
  | 'forum'

export const BACKEND_CHANNELS: readonly BackendChannel[] = Object.freeze([
  'cloud_sync',
  'game_rank',
  'game_platform',
  'ocr',
  'temp_upload',
  'forum'
] as const)

/** 全局默认通道路径（契约 §3.2；组内同名键可覆盖） */
export const DEFAULT_BACKEND_CHANNEL_PATHS: Readonly<Record<BackendChannel, string>> = Object.freeze({
  cloud_sync: '/api/cloud-sync',
  game_rank: '/api/game-rank',
  game_platform: '/api/game-platform/v1',
  ocr: '/api/ocr/recognize',
  temp_upload: '/api/temp/upload',
  forum: '/api/forum'
})

/** 主域（本地内置默认；契约 §9 生产域白名单） */
export const PRIMARY_BACKEND_ORIGIN = 'https://mini.hbut.site'
/** 唯一兜底域（契约 §9） */
export const FALLBACK_BACKEND_ORIGIN = 'https://mini-hbut-ocr-service.hf.space'

export interface BackendGroup {
  id: string
  base: string
  enabled: boolean
  paths: Partial<Record<BackendChannel, string>>
}

/** 本地内置默认组：主 + 唯一兜底（契约 §10） */
export const DEFAULT_BACKEND_GROUPS: readonly BackendGroup[] = Object.freeze([
  Object.freeze({ id: 'mini', base: PRIMARY_BACKEND_ORIGIN, enabled: true, paths: {} }),
  Object.freeze({ id: 'hf-prod', base: FALLBACK_BACKEND_ORIGIN, enabled: true, paths: {} })
])

export interface BackendFailoverConfig {
  enabled: boolean
  failureTtlSeconds: number
  maxAttemptsPerRequest: number
  probeTimeoutMs: number
}

export const DEFAULT_BACKEND_FAILOVER: Readonly<BackendFailoverConfig> = Object.freeze({
  enabled: true,
  failureTtlSeconds: 300,
  maxAttemptsPerRequest: 2,
  probeTimeoutMs: 3000
})

export interface BackendConfig {
  groups: BackendGroup[]
  paths: Record<BackendChannel, string>
  failover: BackendFailoverConfig
}

/** 组 id 规则（契约 §3.1） */
const GROUP_ID_PATTERN = /^[a-z0-9_-]{1,32}$/
/** 允许明文 http 的 loopback 主机（契约 §9 归一化规则） */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const safeText = (value: unknown): string => String(value ?? '').trim()

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

const dedupe = (list: string[]): string[] => [...new Set(list)]

/** URL 是否满足「HTTPS 优先」约束（HTTPS 或 loopback http；契约 §3.1） */
export const isSecureBackendUrl = (value: unknown): boolean => {
  const text = safeText(value)
  if (!text) return false
  try {
    const url = new URL(text)
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * 归一化组基址：补协议（默认 https）→ 校验 → 去尾斜杠。
 * 非 HTTPS 且非 loopback（或解析失败）返回空串（调用方丢弃）。
 */
export const normalizeBackendBase = (value: unknown): string => {
  const text = safeText(value)
  if (!text) return ''
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  const trimmed = withProtocol.replace(/\/+$/, '')
  return isSecureBackendUrl(trimmed) ? trimmed : ''
}

/** 归一化单个通道路径：必须以 `/` 开头；空/非法回落到 fallback */
export const normalizeChannelPath = (value: unknown, fallback: string): string => {
  const text = safeText(value)
  if (!text) return fallback
  const withSlash = text.startsWith('/') ? text : `/${text}`
  const trimmed = withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
  return trimmed || fallback
}

/** 归一化组内路径覆盖表（只保留合法通道键） */
const normalizeGroupPaths = (raw: unknown): Partial<Record<BackendChannel, string>> => {
  const block = isRecord(raw) ? raw : {}
  const paths: Partial<Record<BackendChannel, string>> = {}
  for (const channel of BACKEND_CHANNELS) {
    const value = safeText(block[channel])
    if (value) paths[channel] = normalizeChannelPath(value, DEFAULT_BACKEND_CHANNEL_PATHS[channel])
  }
  return paths
}

export interface NormalizeBackendGroupsResult {
  groups: BackendGroup[]
  /** 被丢弃的非法项数量（供日志/诊断使用，不静默） */
  dropped: number
}

/** 归一化组列表：顺序保留、id 去重、非法丢弃、enabled:false 保留（契约 §3.1） */
export const normalizeBackendGroups = (raw: unknown): NormalizeBackendGroupsResult => {
  const list = Array.isArray(raw) ? raw : []
  const groups: BackendGroup[] = []
  const seen = new Set<string>()
  let dropped = 0
  for (const item of list) {
    if (!isRecord(item)) {
      dropped += 1
      continue
    }
    const id = safeText(item.id).toLowerCase()
    const base = normalizeBackendBase(item.base ?? item.url ?? item.origin)
    if (!GROUP_ID_PATTERN.test(id) || !base || seen.has(id)) {
      dropped += 1
      continue
    }
    seen.add(id)
    groups.push({
      id,
      base,
      enabled: item.enabled !== false,
      paths: normalizeGroupPaths(item.paths)
    })
  }
  return { groups, dropped }
}

/** 归一化全局路径表（缺失/非法回落默认；契约 §3.2） */
export const normalizeBackendPaths = (raw: unknown): Record<BackendChannel, string> => {
  const block = isRecord(raw) ? raw : {}
  const paths = { ...DEFAULT_BACKEND_CHANNEL_PATHS } as Record<BackendChannel, string>
  for (const channel of BACKEND_CHANNELS) {
    const value = safeText(block[channel])
    if (value) paths[channel] = normalizeChannelPath(value, DEFAULT_BACKEND_CHANNEL_PATHS[channel])
  }
  return paths
}

/** 归一化故障转移参数（钳制到契约 §3.3 区间） */
export const normalizeBackendFailover = (raw: unknown): BackendFailoverConfig => {
  const block = isRecord(raw) ? raw : {}
  return {
    enabled: block.enabled !== false,
    failureTtlSeconds: clampNumber(
      block.failure_ttl_seconds ?? block.failureTtlSeconds,
      30,
      3600,
      DEFAULT_BACKEND_FAILOVER.failureTtlSeconds
    ),
    maxAttemptsPerRequest: clampNumber(
      block.max_attempts_per_request ?? block.maxAttemptsPerRequest,
      1,
      8,
      DEFAULT_BACKEND_FAILOVER.maxAttemptsPerRequest
    ),
    probeTimeoutMs: clampNumber(
      block.probe_timeout_ms ?? block.probeTimeoutMs,
      1000,
      10000,
      DEFAULT_BACKEND_FAILOVER.probeTimeoutMs
    )
  }
}

/** 归一化 `backend` 配置块（groups + paths + failover） */
export const normalizeBackendConfig = (raw: unknown): BackendConfig => {
  const block = isRecord(raw) ? raw : {}
  return {
    groups: normalizeBackendGroups(block.groups).groups,
    paths: normalizeBackendPaths(block.paths),
    failover: normalizeBackendFailover(block.failover)
  }
}

/**
 * 派生某通道的完整 URL：`base + path`（契约 §5，禁止字符串替换式派生）。
 * 组内 paths 优先于全局 paths；两者都缺失时回落内置默认路径。
 */
export const deriveChannelUrl = (
  group: Pick<BackendGroup, 'base' | 'paths'> | null | undefined,
  channel: BackendChannel,
  globalPaths: Record<BackendChannel, string> = DEFAULT_BACKEND_CHANNEL_PATHS
): string => {
  const base = normalizeBackendBase(group?.base)
  if (!base) return ''
  const groupPath = safeText(group?.paths?.[channel])
  const path = normalizeChannelPath(
    groupPath || safeText(globalPaths?.[channel]),
    DEFAULT_BACKEND_CHANNEL_PATHS[channel]
  )
  return `${base}${path}`
}

export interface ChannelEndpoint {
  /** 来源组 id；通道级显式覆盖固定为 `'override'`（不参与组冷却） */
  groupId: string
  /** 完整 URL（已归一化、去重） */
  url: string
}

export interface ChannelEndpointResolution {
  /** 有序端点列表（第 0 项为主，其余为兜底）；已去重去空 */
  endpoints: ChannelEndpoint[]
  /** 命中来源：通道级覆盖 / 组模型 / 内置默认（契约 §4） */
  source: 'override' | 'groups' | 'default'
}

const toUrlList = (value: unknown, normalizeUrl: (input: unknown) => string): string[] => {
  const items = Array.isArray(value) ? value : [value]
  const urls: string[] = []
  for (const item of items) {
    const url = normalizeUrl(item)
    if (url) urls.push(url)
  }
  return urls
}

const dedupeEndpoints = (list: ChannelEndpoint[]): ChannelEndpoint[] => {
  const seen = new Set<string>()
  const result: ChannelEndpoint[] = []
  for (const item of list) {
    if (!item.url || seen.has(item.url)) continue
    seen.add(item.url)
    result.push(item)
  }
  return result
}

/**
 * 解析某通道的端点列表（主 + 兜底），优先级见契约 §4：
 *   ① 通道级显式覆盖（override/overrideFallbacks，单值或数组）
 *   ② backend.groups（includeGroups=false 时跳过）
 *   ③ 内置默认组
 *
 * `normalizeUrl` 允许调用方沿用各自通道的既有归一化（如 OCR 自动补 `/api/ocr/recognize`），
 * 缺省使用 `normalizeBackendBase`（仅做基址校验）。
 */
export const buildChannelEndpointList = (input: {
  channel: BackendChannel
  override?: unknown
  overrideFallbacks?: unknown
  backend?: unknown
  includeGroups?: boolean
  normalizeUrl?: (value: unknown) => string
}): ChannelEndpointResolution => {
  const normalizeUrl = input.normalizeUrl || normalizeBackendBase
  const overrides = dedupe([
    ...toUrlList(input.override, normalizeUrl),
    ...toUrlList(input.overrideFallbacks, normalizeUrl)
  ])
  if (overrides.length > 0) {
    return {
      endpoints: overrides.map((url) => ({ groupId: 'override', url })),
      source: 'override'
    }
  }

  if (input.includeGroups !== false) {
    const config = normalizeBackendConfig(input.backend)
    const fromGroups = config.groups
      .filter((group) => group.enabled)
      .map((group) => ({
        groupId: group.id,
        url: deriveChannelUrl(group, input.channel, config.paths)
      }))
    const endpoints = dedupeEndpoints(fromGroups)
    if (endpoints.length > 0) {
      return { endpoints, source: 'groups' }
    }
  }

  const defaults = DEFAULT_BACKEND_GROUPS.filter((group) => group.enabled).map((group) => ({
    groupId: group.id,
    url: deriveChannelUrl(group, input.channel, DEFAULT_BACKEND_CHANNEL_PATHS)
  }))
  return { endpoints: dedupeEndpoints(defaults), source: 'default' }
}
