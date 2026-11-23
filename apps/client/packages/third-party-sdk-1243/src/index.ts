/**
 * `@mini-hbut/third-party-sdk-1243` —— 第三方接入的最小 SDK（Epic #1243 · G5-03 / #1267）。
 *
 * 这份代码就是**可运行的示例**：第三方后端照抄即可，不用猜契约。
 *
 * 覆盖的三步：
 *   1. `exchangeLaunchCode` —— 用一次性 code 换身份断言（拿到 `sid`）
 *   2. `fetchDomain`        —— 读某一类数据（`schedule`/`grades`/…）
 *   3. `formatLastSynced`   —— 只展示「最后同步时间」（**没有**数据过期判断）
 *
 * 三条纪律（写进类型与注释，别绕过）：
 *   - **不要把 `sid` 当长期令牌**：它是身份断言，应用会话由你自己的后端建；
 *   - **不要自行请求学校教务**：那会暴露学生 Cookie，且绕过审核；
 *   - **不要按数据年龄告警**：30 天前的数据也是有效数据，只展示 `last_synced_at`。
 */

/** 一次性启动票据的兑换结果（身份断言，**不含**宿主令牌/Cookie） */
export interface LaunchAssertion {
  sid: string
  appId: string
  aud: string
  expiresIn: number
  deviceId: string
}

/** 分类数据的响应（`meta.last_synced_at` 是唯一的「时间」字段） */
export interface DomainResponse<T = unknown> {
  data: T | null
  meta: {
    domain: string
    data_version: number
    last_synced_at: string
    reason?: string
  }
}

/** 稳定错误码（与服务端契约 §6.3 一致） */
export type ApiErrorCode =
  | 'identity_required'
  | 'app_not_approved'
  | 'consent_required'
  | 'consent_revoked'
  | 'consent_policy_stale'
  | 'code_used'
  | 'code_expired'
  | 'app_mismatch'
  | 'aud_mismatch'
  | 'rate_limited'
  | 'service_unavailable'
  | 'request_failed'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly retryAfterSeconds: number

  constructor(code: ApiErrorCode, status: number, retryAfterSeconds = 0) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** 可注入的 fetch（便于测试与替换为带超时的实现） */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ status: number; json: () => Promise<unknown>; headers?: { get(name: string): string | null } }>

export interface SdkOptions {
  /** OCR 服务基址，例如 `https://ocr.example.com`（不要带结尾斜杠） */
  baseUrl: string
  /** 注入 fetch（默认用全局 fetch） */
  fetchImpl?: FetchLike
}

const trimBase = (baseUrl: string): string => String(baseUrl || '').replace(/\/+$/, '')

const toCode = (status: number, payload: unknown): ApiErrorCode => {
  if (payload && typeof payload === 'object') {
    const error = (payload as Record<string, unknown>).error
    if (error && typeof error === 'object') {
      const code = String((error as Record<string, unknown>).code ?? '').trim()
      if (code) return code as ApiErrorCode
    }
  }
  if (status === 401) return 'identity_required'
  if (status === 403) return 'app_not_approved'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'service_unavailable'
  return 'request_failed'
}

const defaultFetch: FetchLike = (input, init) =>
  (globalThis as unknown as { fetch: FetchLike }).fetch(input, init)

const requestJson = async (
  options: SdkOptions,
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: unknown }
): Promise<unknown> => {
  const doFetch = options.fetchImpl || defaultFetch
  const response = await doFetch(`${trimBase(options.baseUrl)}${path}`, {
    method: init.method,
    headers: {
      accept: 'application/json',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {})
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {})
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (response.status < 200 || response.status >= 300) {
    const retry = Number(response.headers?.get('retry-after') ?? 0) || 0
    throw new ApiError(toCode(response.status, payload), response.status, retry)
  }
  return payload
}

/**
 * 第 1 步：用一次性 code 换身份断言。
 *
 * `code` 只有 60 秒、只能用一次；兑换时 `app_id` 必须与签发时一致。
 * 失败会抛 `ApiError`（`code_used` 同时覆盖「不存在」与「已用过」，这是刻意的）。
 */
export const exchangeLaunchCode = async (
  options: SdkOptions,
  input: { code: string; appId: string; audience?: string }
): Promise<LaunchAssertion> => {
  if (!String(input.code || '').trim()) throw new ApiError('code_used', 400)
  if (!String(input.appId || '').trim()) throw new ApiError('request_failed', 400)
  const payload = (await requestJson(options, '/api/app-launch/v1/exchange', {
    method: 'POST',
    body: { code: input.code, app_id: input.appId, ...(input.audience ? { audience: input.audience } : {}) }
  })) as Record<string, unknown> | null
  const sid = String(payload?.sid ?? '').trim()
  if (!sid) throw new ApiError('request_failed', 200)
  return {
    sid,
    appId: String(payload?.app_id ?? ''),
    aud: String(payload?.aud ?? ''),
    expiresIn: Number(payload?.expires_in ?? 0) || 0,
    deviceId: String(payload?.device_id ?? '')
  }
}

/**
 * 第 2 步：读某一类数据。
 *
 * `token` 是**你自己的应用令牌**（不是宿主令牌、也不是 sid）。
 * 无快照时返回 `data: null` + `meta.reason='snapshot_missing'`（**不是错误**，更不是 410）。
 */
export const fetchDomain = async <T = unknown>(
  options: SdkOptions,
  input: { token: string; domain: string; semester?: string }
): Promise<DomainResponse<T>> => {
  const domain = String(input.domain || '').trim()
  if (!domain) throw new ApiError('request_failed', 400)
  const query = input.semester ? `?semester=${encodeURIComponent(input.semester)}` : ''
  const payload = (await requestJson(options, `/api/app-data/v1/${domain}${query}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${input.token}` }
  })) as DomainResponse<T> | null
  if (!payload || typeof payload !== 'object') throw new ApiError('request_failed', 200)
  return payload
}

/**
 * 第 3 步：把 `last_synced_at` 格式化成人类可读时间。
 *
 * **只**输出「最后同步：YYYY-MM-DD HH:mm」。空/非法 → 「从未同步」。
 * 这里**没有**、也不应该有任何「过期/太久没更新」的判断（Epic 已废止）。
 */
export const formatLastSynced = (iso: string | null | undefined): string => {
  const text = String(iso ?? '').trim()
  if (!text) return '从未同步'
  const ms = Date.parse(text)
  if (Number.isNaN(ms)) return '从未同步'
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `最后同步：${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 面向用户的可读错误文案（示例用；你的产品可以自己写）。 */
export const describeError = (error: unknown): string => {
  const code = error instanceof ApiError ? error.code : 'request_failed'
  switch (code) {
    case 'identity_required':
      return '需要重新获取应用令牌'
    case 'app_not_approved':
      return '应用尚未通过审核'
    case 'consent_required':
      return '学生还没有授权这个数据类别'
    case 'consent_revoked':
      return '学生已撤销授权，请停止使用并删除缓存'
    case 'consent_policy_stale':
      return '授权策略已更新，需要学生重新确认'
    case 'code_used':
      return '启动票据无效或已被使用'
    case 'code_expired':
      return '启动票据已过期，请重新发起'
    case 'app_mismatch':
      return '票据与当前应用不匹配'
    case 'rate_limited':
      return '请求过于频繁，请按 Retry-After 退避'
    case 'service_unavailable':
      return '服务暂时不可用，请稍后重试（不要用本地伪造数据代替）'
    default:
      return '请求失败'
  }
}
