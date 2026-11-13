// src/features/identity/consent/appConsentApi.ts
//
// Epic #1243（G3-03 / mini-hbut#1256）：学生侧逐类授权管理的 API 客户端。
//
// 对应服务端（OCR-services `modules/identity_app_consents/routes.py`）：
//   GET  /identity/app-consents?app_id=
//   POST /identity/app-consents/grant    {app_id, domains[]}
//   POST /identity/app-consents/revoke   {app_id, domains[]} | {app_id, all:true}
//
// 设计纪律：
// - **不抛异常**：网络/超时/非 2xx 一律转成 `{ok:false, code}`，由 UI 决定文案；
// - **不猜成功**：只有 2xx 且 `success===true` 才算成功（否则按 code 处理）；
// - **双词汇表映射**：UI 用 Identity scope（`student.grades.read`），
//   服务端用数据域（`grades`）。映射表在这里**显式**写死，禁止隐式转换（契约 §3.2）。
// - 传输层可注入，便于穷举测试，不需要真实网络。

/** OCR 侧可管理的数据域（与 `CONSENT_MANAGED_DOMAINS` 一致） */
export type ConsentDomain = 'profile' | 'schedule' | 'grades' | 'exams' | 'rank'

export type ConsentState = 'granted' | 'revoked' | 'never' | 'stale'

export interface ConsentDomainState {
  domain: ConsentDomain
  state: ConsentState
  consentRevision: number
}

export interface ConsentSnapshot {
  ok: boolean
  /** 稳定机器码：`ok` / `identity_required` / `app_not_whitelisted` / `service_unavailable` / … */
  code: string
  policyVersion: number
  domains: ConsentDomainState[]
}

export interface ConsentMutationResult {
  ok: boolean
  code: string
  /** 授予成功时的 domains */
  granted: ConsentDomain[]
  /** 撤销成功时实际撤销的行数 */
  revoked: number
  consentRevision: number
  /** 服务端显式声明「学号 SSO 不受影响」（撤销时） */
  identitySsoUnaffected: boolean
}

/**
 * Identity scope → 数据域（**冻结映射**，与契约 §3.2 一致）。
 *
 * 只映射「额外学业域」；`cloud_sync`/`forum`/`game` 不在此端点管理范围。
 */
export const SCOPE_TO_CONSENT_DOMAIN: Readonly<Record<string, ConsentDomain>> = Object.freeze({
  'student.profile.read': 'profile',
  'student.timetable.read': 'schedule',
  'student.grades.read': 'grades',
  'student.exams.read': 'exams',
  'student.rank.read': 'rank'
})

/** 把 UI 的 scope id 列表映射成数据域列表（保序、去重、丢弃未知项）。 */
export const toConsentDomains = (scopeIds: readonly string[]): ConsentDomain[] => {
  const out: ConsentDomain[] = []
  for (const id of Array.isArray(scopeIds) ? scopeIds : []) {
    const domain = SCOPE_TO_CONSENT_DOMAIN[String(id || '').trim()]
    if (domain && !out.includes(domain)) out.push(domain)
  }
  return out
}

export interface ConsentTransportRequest {
  path: string
  method: 'GET' | 'POST'
  body?: unknown
}

export interface ConsentTransportResponse {
  status: number
  json: unknown
}

export type ConsentTransport = (request: ConsentTransportRequest) => Promise<ConsentTransportResponse>

export interface ConsentApiDeps {
  transport?: ConsentTransport
  /** API 前缀（默认空 = 同源；生产由调用方注入 API_BASE） */
  baseUrl?: string
}

const safeText = (value: unknown): string => String(value ?? '').trim()

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const defaultTransport: ConsentTransport = async ({ path, method, body }) => {
  const response = await fetch(path, {
    method,
    headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  let json: unknown = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, json }
}

const buildPath = (deps: ConsentApiDeps, suffix: string): string => {
  const base = safeText(deps.baseUrl)
  return `${base.replace(/\/$/, '')}${suffix}`
}

const errorCodeOf = (status: number, json: unknown): string => {
  if (isPlainObject(json)) {
    const code = safeText(json.code)
    if (code) return code
  }
  if (status === 401) return 'identity_required'
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'service_unavailable'
  return 'request_failed'
}

const normalizeDomainState = (raw: unknown): ConsentDomainState | null => {
  if (!isPlainObject(raw)) return null
  const domain = safeText(raw.domain) as ConsentDomain
  const state = safeText(raw.state) as ConsentState
  if (!domain || !state) return null
  const revision = Number(raw.consent_revision)
  return {
    domain,
    state,
    consentRevision: Number.isInteger(revision) && revision >= 0 ? revision : 0
  }
}

/** 拉取某应用的逐域授权状态。**不抛**：失败返回 `ok:false` + 机器码。 */
export const fetchAppConsents = async (
  appId: string,
  deps: ConsentApiDeps = {}
): Promise<ConsentSnapshot> => {
  const id = safeText(appId)
  if (!id) return { ok: false, code: 'app_id_required', policyVersion: 0, domains: [] }
  const transport = deps.transport || defaultTransport
  try {
    const { status, json } = await transport({
      path: buildPath(deps, `/identity/app-consents?app_id=${encodeURIComponent(id)}`),
      method: 'GET'
    })
    if (status < 200 || status >= 300 || !isPlainObject(json) || json.success !== true) {
      return { ok: false, code: errorCodeOf(status, json), policyVersion: 0, domains: [] }
    }
    const domains = (Array.isArray(json.domains) ? json.domains : [])
      .map(normalizeDomainState)
      .filter((item): item is ConsentDomainState => item !== null)
    const policyVersion = Number(json.policy_version)
    return {
      ok: true,
      code: 'ok',
      policyVersion: Number.isInteger(policyVersion) ? policyVersion : 0,
      domains
    }
  } catch {
    return { ok: false, code: 'service_unavailable', policyVersion: 0, domains: [] }
  }
}

const mutationResult = (
  status: number,
  json: unknown,
  fallbackCode: string
): ConsentMutationResult => {
  const base: ConsentMutationResult = {
    ok: false,
    code: fallbackCode,
    granted: [],
    revoked: 0,
    consentRevision: 0,
    identitySsoUnaffected: false
  }
  // 本地校验失败（没有发请求）：保留调用方给的机器码，不要被 errorCodeOf 覆盖成 request_failed
  if (json === null || json === undefined) return base
  if (!isPlainObject(json) || status < 200 || status >= 300 || json.success !== true) {
    return { ...base, code: errorCodeOf(status, json) }
  }
  const revision = Number(json.consent_revision)
  const revoked = Number(json.revoked)
  return {
    ok: true,
    code: 'ok',
    granted: (Array.isArray(json.granted) ? json.granted : [])
      .map((item) => safeText(item) as ConsentDomain)
      .filter((item) => Boolean(item)),
    revoked: Number.isInteger(revoked) && revoked >= 0 ? revoked : 0,
    consentRevision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
    identitySsoUnaffected: json.identity_sso_unaffected === true
  }
}

/** 授予指定数据域（服务端会再校验「是否在该应用审核范围内」）。**不抛**。 */
export const grantAppConsents = async (
  appId: string,
  domains: readonly ConsentDomain[],
  deps: ConsentApiDeps = {}
): Promise<ConsentMutationResult> => {
  const id = safeText(appId)
  const list = (Array.isArray(domains) ? domains : []).map((item) => safeText(item)).filter(Boolean)
  if (!id) return mutationResult(400, null, 'app_id_required')
  if (!list.length) return mutationResult(400, null, 'domains_required')
  const transport = deps.transport || defaultTransport
  try {
    const { status, json } = await transport({
      path: buildPath(deps, '/identity/app-consents/grant'),
      method: 'POST',
      body: { app_id: id, domains: list }
    })
    return mutationResult(status, json, 'request_failed')
  } catch {
    return mutationResult(503, null, 'service_unavailable')
  }
}

/**
 * 撤销指定数据域，或 `all=true` 一键撤销该应用全部额外数据域。**不抛**。
 *
 * 服务端响应会带 `identity_sso_unaffected: true`——撤销不影响学号登录（Epic 要求）。
 */
export const revokeAppConsents = async (
  appId: string,
  options: { domains?: readonly ConsentDomain[]; all?: boolean },
  deps: ConsentApiDeps = {}
): Promise<ConsentMutationResult> => {
  const id = safeText(appId)
  if (!id) return mutationResult(400, null, 'app_id_required')
  const all = options?.all === true
  const list = (Array.isArray(options?.domains) ? options.domains : [])
    .map((item) => safeText(item))
    .filter(Boolean)
  if (!all && !list.length) return mutationResult(400, null, 'domains_required')
  const transport = deps.transport || defaultTransport
  try {
    const { status, json } = await transport({
      path: buildPath(deps, '/identity/app-consents/revoke'),
      method: 'POST',
      body: all ? { app_id: id, all: true } : { app_id: id, domains: list }
    })
    return mutationResult(status, json, 'request_failed')
  } catch {
    return mutationResult(503, null, 'service_unavailable')
  }
}
