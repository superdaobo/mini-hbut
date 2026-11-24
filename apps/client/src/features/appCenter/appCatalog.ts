// src/features/appCenter/appCatalog.ts
//
// Epic #1243（G2-04 / mini-hbut#1253）：应用中心的数据层。
//
// 职责边界（刻意收窄）：
// - **只做**「目录 → 归一化 → 能否内嵌 / 能否学号 SSO」的纯判定 + 一个拉取函数；
// - **不做**授权判定：`status=active` 只表示审核通过；某学生某类数据能否读，
//   仍由资源服务器按「白名单 ∩ 用户同意 ∩ 令牌」逐次判定（契约 §4/§6）；
// - **不信任远端配置**：目录只来自服务端 `GET /api/app-catalog/v1/apps`
//   （由同一份 manifest 派生），`remote_config` 只能引用、不能提升权限。
//
// 为什么要有这一层：目录是**公开**数据，但客户端必须自己再校验一遍（服务端被投毒、
// 代理篡改、缓存过期都会让脏数据进来）。归一化时**丢弃未知字段**，绝不把
// `client_secret` 之类的字段留在内存里（防后续误用/误打日志）。

export interface AppCatalogEntry {
  /** 应用 ID（= Casdoor client_id） */
  clientId: string
  label: string
  owner: string
  /** `active` = 审核通过；其它值一律不给 SSO */
  status: string
  /** 该应用可申请的数据域 → 操作名（只读展示；真实授权在服务端） */
  dataDomains: Record<string, string[]>
  /** 允许内嵌承载该应用的 HTTPS origin（精确匹配；空 = 不允许内嵌） */
  allowedOrigins: string[]
  /** 隐私说明地址（空 = 未提供，UI 应显示「未提供隐私说明」） */
  privacyUrl: string
  reviewVersion: number
}

export type AppCatalogSource = 'remote' | 'empty' | 'error'

export interface AppCatalogSnapshot {
  manifestVersion: number
  apps: AppCatalogEntry[]
  fetchedAt: number
  /** `empty` = 服务端明确返回空目录；`error` = 拉取/解析失败（两者 UI 文案不同） */
  source: AppCatalogSource
}

export type EmbedDenyReason =
  | 'app_not_active'
  | 'no_origin_configured'
  | 'origin_not_allowed'
  | 'origin_invalid'

export interface EmbedDecision {
  ok: boolean
  reason: EmbedDenyReason | ''
}

const safeText = (value: unknown): string => String(value ?? '').trim()

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** 只接受 `https://host[:port]` 形式的**裸 origin**（与清单校验同口径）。 */
export const isBareHttpsOrigin = (value: unknown): boolean => {
  const text = safeText(value)
  if (!text || text !== String(value ?? '') || text.includes('*')) return false
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  if (url.pathname !== '/' || url.search || url.hash) return false
  // `new URL()` 会把 host 小写化，故大小写检查看原始文本的 authority 部分
  const authority = text.slice('https://'.length)
  if (authority !== authority.toLowerCase()) return false
  return true
}

const normalizeEntry = (raw: unknown): AppCatalogEntry | null => {
  if (!isPlainObject(raw)) return null
  const clientId = safeText(raw.client_id)
  if (!clientId) return null

  const dataDomains: Record<string, string[]> = {}
  if (isPlainObject(raw.data_domains)) {
    for (const [domain, ops] of Object.entries(raw.data_domains)) {
      if (Array.isArray(ops)) {
        dataDomains[safeText(domain)] = ops.map((op) => safeText(op)).filter(Boolean)
      }
    }
  }

  const allowedOrigins = (Array.isArray(raw.allowed_origins) ? raw.allowed_origins : [])
    .map((origin) => safeText(origin))
    .filter((origin) => isBareHttpsOrigin(origin))

  const reviewVersionRaw = Number(raw.review_version)
  const reviewVersion =
    Number.isInteger(reviewVersionRaw) && reviewVersionRaw > 0 ? reviewVersionRaw : 1

  return {
    clientId,
    label: safeText(raw.label),
    owner: safeText(raw.owner),
    status: safeText(raw.status),
    dataDomains,
    allowedOrigins,
    privacyUrl: safeText(raw.privacy_url),
    reviewVersion
  }
}

/**
 * 把服务端目录归一化成客户端模型。
 *
 * - 丢弃缺 `client_id` 的条目、丢弃非法 origin、丢弃未知字段（**不保留**任何额外键）；
 * - 非对象/缺 `apps` → 空数组（fail closed：没有已审核应用）。
 */
export const normalizeCatalog = (raw: unknown): AppCatalogEntry[] => {
  if (!isPlainObject(raw)) return []
  const apps = raw.apps
  if (!Array.isArray(apps)) return []
  const out: AppCatalogEntry[] = []
  for (const item of apps) {
    const entry = normalizeEntry(item)
    if (entry) out.push(entry)
  }
  return out
}

/** 能否用真实学号做无感 SSO：只有审核通过（`active`）的应用可以。 */
export const canSso = (entry: AppCatalogEntry | null | undefined): boolean =>
  !!entry && entry.status === 'active'

/**
 * 能否在宿主里内嵌该应用。
 *
 * 规则（冻结）：必须 `active` + `allowed_origins` 非空 + 目标 origin **精确匹配**。
 * 空 `allowed_origins` 的语义是「明确不允许内嵌」，不是「不限制」。
 */
export const canEmbed = (
  entry: AppCatalogEntry | null | undefined,
  targetOrigin: string
): EmbedDecision => {
  if (!entry || entry.status !== 'active') return { ok: false, reason: 'app_not_active' }
  if (!entry.allowedOrigins.length) return { ok: false, reason: 'no_origin_configured' }
  const origin = safeText(targetOrigin)
  if (!origin || !isBareHttpsOrigin(origin)) return { ok: false, reason: 'origin_invalid' }
  if (!entry.allowedOrigins.includes(origin)) return { ok: false, reason: 'origin_not_allowed' }
  return { ok: true, reason: '' }
}

/** 按 `clientId` 找应用（大小写敏感：client_id 是精确标识）。 */
export const findApp = (
  apps: AppCatalogEntry[],
  clientId: string
): AppCatalogEntry | null => {
  const id = safeText(clientId)
  if (!id) return null
  return apps.find((entry) => entry.clientId === id) || null
}

export interface LoadAppCatalogDeps {
  /** 拉取 JSON（默认用全局 fetch + 超时）；抛错/超时由本函数吞掉并返回 error 快照 */
  fetchJson?: (url: string) => Promise<unknown>
  /** 目录端点 URL（默认 `${API_BASE}/api/app-catalog/v1/apps`） */
  url?: string
  /** 注入时钟（测试用） */
  now?: () => number
}

/**
 * 拉取应用目录。
 *
 * **永不抛**：失败返回 `{apps: [], source: 'error'}`（UI 显示「暂时无法加载应用列表」），
 * 空目录返回 `source: 'empty'`（UI 显示「暂无已审核应用」）——两者必须可区分，
 * 否则用户会把「服务挂了」看成「我们没上架应用」。
 */
export const loadAppCatalog = async (
  deps: LoadAppCatalogDeps = {}
): Promise<AppCatalogSnapshot> => {
  const now = deps.now || (() => Date.now())
  const fetchedAt = now()
  const url = deps.url || '/api/app-catalog/v1/apps'
  try {
    const raw = deps.fetchJson
      ? await deps.fetchJson(url)
      : await defaultFetchJson(url)
    const apps = normalizeCatalog(raw)
    const manifestVersion = isPlainObject(raw) ? Number(raw.manifest_version) || 0 : 0
    return {
      manifestVersion,
      apps,
      fetchedAt,
      source: apps.length ? 'remote' : 'empty'
    }
  } catch {
    return { manifestVersion: 0, apps: [], fetchedAt, source: 'error' }
  }
}

/** 默认拉取：8s 超时 + 只接受 2xx；非 2xx 视为失败（fail closed）。 */
const defaultFetchJson = async (url: string): Promise<unknown> => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), 8000) : null
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {})
    })
    if (!response.ok) throw new Error(`app-catalog ${response.status}`)
    return await response.json()
  } finally {
    if (timer) clearTimeout(timer)
  }
}
