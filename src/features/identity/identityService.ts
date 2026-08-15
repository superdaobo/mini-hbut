// src/features/identity/identityService.ts
//
// #623：Identity Core API 客户端（纯 TS，无 Vue 依赖，可单测）。
//
// 对接端点（#622 冻结合同，见 identity-platform/core/docs/contract.md）：
//   GET  /api/v1/requests/:id                       Handoff（sanitized 详情）
//   POST /api/v1/app/devices/enrollment-challenges  Handoff（一次性 enrollment challenge）
//   POST /api/v1/app/auth-requests/:id/approve      Handoff + Ed25519 签名（签名由 Rust 完成）
//   POST /api/v1/app/auth-requests/:id/deny         Handoff（best-effort；#622 冻结 Core 尚无该路由）
//
// 安全边界：
//   - handoff 只作为内存中的请求头使用，绝不落日志/存储/错误信息；
//   - 私钥永远不进入 JS：approve 的签名由 Rust identity_sign_auth_request 完成，
//     本模块只提交 { device_id, issued_at, nonce, signature, canonical_version }；
//   - 测试账号（test_account）一律拒绝 enroll/approve（防御纵深，Core production 亦有校验）；
//   - 所有错误映射为用户可读中文，内部 code 仅作脱敏日志。

import type {
  IdentityApproveResult,
  IdentityRequestDetail,
  IdentitySignedApproval,
  IdentityUserSafeErrorCode
} from './types'
import { IdentityServiceError } from './types'
import { invokeNative, isTauriRuntime } from '../../platform/native'

/** Core 生产域名（已上线：id.湖北工业大学.com，Vercel Production；本地/Preview 可用 localStorage 覆盖） */
export const IDENTITY_CORE_BASE_URL_DEFAULT = 'https://id.xn--vhq74jc2fzpchter27a.com'

/**
 * 身份链路诊断上报（测试/调试用）：把前端 fetch 的关键节点推到本地 HTTP Bridge
 * （/debug/logs/push 无需令牌，仅 debug 构建存在），便于通过 bridge 日志定位
 * "网络不可用/无法连接身份服务"类问题。失败静默（不影响主流程）。
 */
export const reportIdentityDiag = (event: string, details?: Record<string, unknown>): void => {
  try {
    void fetch('http://127.0.0.1:4399/debug/logs/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: 'identity-diag', level: 'info', message: event, details }),
      signal: AbortSignal.timeout(1500)
    }).catch(() => undefined)
  } catch {
    /* 诊断上报失败不影响主流程 */
  }
}

/** 本地覆盖键（dev/preview 用；仅 URL 非敏感） */
export const IDENTITY_CORE_BASE_URL_KEY = 'hbu_identity_core_base_url'

/** Web BFF 生产域名（auth.湖北工业大学.com）：详情/状态/resume 走 BFF（Core 的 requests 受 service-token 保护，#626） */
export const IDENTITY_BFF_BASE_URL_DEFAULT = 'https://auth.xn--vhq74jc2fzpchter27a.com'

/** BFF 本地覆盖键（测试用） */
export const IDENTITY_BFF_BASE_URL_KEY = 'hbu_identity_bff_base_url'

/** 请求超时（ms）：授权相关请求不允许无限等待 */
export const IDENTITY_REQUEST_TIMEOUT_MS = 8000

/** 终端动作（deny/cancel）网络超时：失败不影响本地终态（服务器 TTL 自然兜底） */
export const IDENTITY_TERMINAL_ACTION_TIMEOUT_MS = 3000

/** 测试/演示账号守卫（#617 信任边界：不能创建/审批 Production identity） */
export const isTestAccountBlocked = (): boolean => {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('hbu_test_account_session') === '1'
    )
  } catch {    return false
  }
}

/** 解析 Core base URL：仅接受 http(s) 绝对地址；非法回退默认占位 */
export const getIdentityBffBaseUrl = (): string => {
  try {
    const override = localStorage.getItem(IDENTITY_BFF_BASE_URL_KEY)
    if (override) {
      const url = new URL(override.trim())
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.toString().replace(/\/+$/, '')
      }
    }
  } catch {
    /* 覆盖值非法时回退默认 */
  }
  return IDENTITY_BFF_BASE_URL_DEFAULT
}

export const getIdentityCoreBaseUrl = (): string => {
  try {
    const override = localStorage.getItem(IDENTITY_CORE_BASE_URL_KEY)
    if (override) {
      const url = new URL(override.trim())
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.toString().replace(/\/+$/, '')
      }
    }
  } catch {
    // 本地配置非法：回退默认
  }
  return IDENTITY_CORE_BASE_URL_DEFAULT
}

const safeHeaders = (headers: Record<string, string>): Record<string, string> => headers

/**
 * 统一请求执行：带超时；任何网络/解析失败都转换为 IdentityServiceError。
 * handoff 只出现在内存中的请求头，不进入任何日志。
 */
const requestJson = async (
  url: string,
  options: { method: string; headers: Record<string, string>; body?: unknown; timeoutMs: number },
  origin?: 'core' | 'bff'
): Promise<{ status: number; data: unknown }> => {
  // Tauri 环境：身份请求走 Rust 网络栈（identity_core_fetch）。
  // 原因：WebView fetch 在部分 Windows 环境被系统网络策略阻断（仅 localhost 可达），
  // 而 Rust reqwest 与 App 其他业务同栈（#623 架构修正，测试链路验证）。
  if (isTauriRuntime()) {
    try {
      const parsed = new URL(url)
      const output = await invokeNative<{ status: number; body: string }>('identity_core_fetch', {
        input: {
          method: options.method,
          origin: origin ?? 'core',
          path: parsed.pathname + parsed.search,
          headers: safeHeaders(options.headers),
          body: options.body
        }
      })
      let data: unknown = null
      if (output.body) {
        try {
          data = JSON.parse(output.body)
        } catch {
          data = null
        }
      }
      return { status: output.status, data }
    } catch (err) {
      reportIdentityDiag('network_error', {
        url: String(url).slice(0, 120),
        error: String((err as Error)?.message || 'identity_core_fetch failed').slice(0, 200)
      })
      throw createServiceError(
        'network_unavailable',
        '网络不可用，无法连接身份服务，请稍后重试',
        String((err as Error)?.message || 'identity_core_fetch failed')
      )
    }
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: safeHeaders(options.headers),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    })
    let data: unknown = null
    const text = await response.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    return { status: response.status, data }
  } catch (err) {
    // 网络不可用 / 超时：统一用户可读文案，不泄露内部错误
    reportIdentityDiag('network_error', {
      url: String(url).slice(0, 120),
      error: String((err as Error)?.message || 'fetch failed').slice(0, 200),
      cause: String(((err as { cause?: unknown })?.cause) || '').slice(0, 200)
    })
    throw createServiceError(
      'network_unavailable',
      '网络不可用，无法连接身份服务，请稍后重试',
      String((err as Error)?.message || 'fetch failed')
    )
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Core 错误响应两种形态（#622 app API 与 #630 requests API）：
 *   { error: { code, message } }   —— message 已由服务端脱敏为简体中文
 *   { error: <code> }              —— 纯 code，message 由本层映射
 */
const parseErrorPayload = (
  data: unknown,
  fallback: { status: number; message: string }
): { code: string; message: string } => {
  const err = (data as { error?: unknown })?.error
  if (err && typeof err === 'object') {
    const code = String((err as { code?: unknown })?.code || '')
    const message = String((err as { message?: unknown })?.message || '').trim()
    return { code: code || `HTTP_${fallback.status}`, message: message || fallback.message }
  }
  if (typeof err === 'string') {
    return { code: err, message: fallback.message }
  }
  return { code: `HTTP_${fallback.status}`, message: fallback.message }
}

/** 服务端业务错误码 → 用户可读错误码（内部 code 仅用于脱敏日志） */
const mapServerCode = (code: string): IdentityUserSafeErrorCode => {
  switch (code.toUpperCase()) {
    case 'AUTH_REQUEST_EXPIRED':
    case 'EXPIRED':
      return 'request_expired'
    case 'AUTH_REQUEST_NOT_FOUND':
    case 'NOT_FOUND':
      return 'request_not_found'
    case 'CLIENT_NOT_FOUND':
    case 'CLIENT_UNAVAILABLE':
      return 'client_unavailable'
    case 'INVALID_HANDOFF':
      return 'invalid_handoff'
    case 'DEVICE_NOT_ACTIVE':
    case 'DEVICE_AUTH_FAILED':
      return 'device_revoked'
    case 'SIGNATURE_INVALID':
    case 'STALE_ISSUED_AT':
      return 'signature_rejected'
    case 'TEST_ACCOUNT_REJECTED':
      return 'test_account_blocked'
    case 'CHALLENGE_INVALID':
      return 'device_not_bound'
    case 'LINK_REQUIRED':
    case 'AUTH_REQUEST_ALREADY_APPROVED':
    case 'AUTH_REQUEST_INVALID_TRANSITION':
      // 已被其他设备处理 / 状态不允许：对用户而言请求已不可操作
      return 'request_not_found'
    default:
      return 'unknown'
  }
}

/** 状态码兜底映射（响应体无法解析时） */
const mapStatusFallback = (status: number): IdentityUserSafeErrorCode => {
  if (status === 401) return 'invalid_handoff'
  if (status === 403) return 'device_revoked'
  if (status === 404) return 'request_not_found'
  if (status === 410) return 'request_expired'
  if (status === 422) return 'client_unavailable'
  if (status === 409) return 'request_not_found'
  return 'unknown'
}

const DEFAULT_MESSAGES: Record<IdentityUserSafeErrorCode, string> = {
  request_expired: '应用请求已过期，请从网页重新发起',
  request_not_found: '请求不存在或已完成',
  client_unavailable: '应用已被暂停，无法继续授权',
  invalid_handoff: '接力凭据无效，请从网页重新发起授权',
  network_unavailable: '网络不可用，无法连接身份服务，请稍后重试',
  device_not_bound: '当前设备尚未绑定到身份服务',
  device_revoked: '当前设备已被撤销，无法继续授权',
  session_revalidation_required: '学校登录需要重新验证，请重新登录后再试',
  secure_storage_unavailable: '本机安全存储不可用，无法完成授权',
  signature_rejected: '服务器无法验证签名，请重试或重新发起授权',
  signing_material_missing: '授权签名材料不完整，请更新 App 后重试',
  test_account_blocked: '测试账号不能用于正式身份服务',
  unknown: '授权处理失败，请稍后重试'
}

/** 构造带用户可读文案的业务错误（内部 code 可作脱敏日志） */
export const createServiceError = (
  code: IdentityUserSafeErrorCode,
  message?: string,
  internalDetail?: string
): IdentityServiceError =>
  new IdentityServiceError(code, message || DEFAULT_MESSAGES[code], internalDetail)

/** 根据响应解析并抛出统一错误 */
const throwMappedError = (
  status: number,
  data: unknown,
  context: string
): never => {
  const payload = parseErrorPayload(data, {
    status,
    message: DEFAULT_MESSAGES[mapStatusFallback(status)]
  })
  const code = mapServerCode(payload.code)
  // 服务端 message 已脱敏可直接展示；否则用本地默认文案
  const message = payload.message || DEFAULT_MESSAGES[code]
  throw createServiceError(code, message, `${context} -> HTTP ${status} ${payload.code}`)
}

const buildHandoffHeaders = (handoff: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  'x-identity-handoff': handoff
})

const buildAuthorizationHandoffHeaders = (handoff: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Handoff ${handoff}`
})

/**
 * GET /api/v1/requests/:id —— 拉取 sanitized 请求详情。
 * 只信任服务端返回的清洗数据；deep link 中的任何展示资料一律忽略。
 */
export const fetchRequestDetail = async (input: {
  baseUrl: string
  requestId: string
  handoff: string
}): Promise<IdentityRequestDetail> => {
  const { baseUrl, requestId, handoff } = input
  reportIdentityDiag('detail_start', { baseUrl, requestId })
  try {
    // 详情走 BFF（Core 的 /api/v1/requests 受 service-token 保护，#626；BFF 负责转发）
    const { status, data } = await requestJson(
      `${baseUrl}/api/auth/requests/${requestId}`,
      {
        method: 'GET',
        headers: buildHandoffHeaders(handoff),
        timeoutMs: IDENTITY_REQUEST_TIMEOUT_MS
      },
      'bff'
    )
    reportIdentityDiag('detail_status', { status })
    if (status !== 200) {
      throwMappedError(status, data, 'fetchRequestDetail')
    }
    const detail = data as IdentityRequestDetail
    if (!detail || typeof detail !== 'object' || !detail.request_id || !detail.client) {
      throw createServiceError('unknown', '身份服务返回了无效数据', 'fetchRequestDetail malformed payload')
    }
    reportIdentityDiag('detail_ok', { requestId: detail.request_id, client: detail.client?.name })
    return {
    request_id: String(detail.request_id),
    expires_at: String(detail.expires_at || ''),
    client: {
      name: String(detail.client?.name || ''),
      homepage_host: String(detail.client?.homepage_host || ''),
      developer_display_name: String(detail.client?.developer_display_name || ''),
      review_status: String(detail.client?.review_status || ''),
      is_test: detail.client?.is_test === true
    },
    scopes: Array.isArray(detail.scopes)
      ? detail.scopes
          .filter((s) => s && typeof s === 'object' && typeof s.id === 'string')
          .map((s) => ({
            id: String(s.id),
            label: String(s.label || ''),
            risk: s.risk === 'sensitive' ? 'sensitive' : 'basic'
          }))
      : [],
    // 宽容解析：未来 Core 下发签名材料（issue #623 示例 JSON 含 challenge）
    challenge: typeof detail.challenge === 'string' ? detail.challenge : undefined,
    client_id: typeof detail.client_id === 'string' ? detail.client_id : undefined
  }
  } catch (err) {
    reportIdentityDiag('detail_failed', {
      requestId,
      error: String((err as Error)?.message || '').slice(0, 200)
    })
    throw err
  }
}

/**
 * POST /api/v1/app/devices/enrollment-challenges —— 获取一次性设备绑定 challenge。
 * 以当前授权请求的 handoff 作为凭据（#622 防匿名无限创建）。
 * 测试账号拒绝调用（前端防御纵深；Core production 亦有 TEST_ACCOUNT_REJECTED）。
 */
export const fetchEnrollmentChallenge = async (input: {
  baseUrl: string
  handoff: string
}): Promise<{ challenge: string; expires_at: string }> => {
  if (isTestAccountBlocked()) {
    throw createServiceError('test_account_blocked', DEFAULT_MESSAGES.test_account_blocked)
  }
  const { baseUrl, handoff } = input
  const { status, data } = await requestJson(`${baseUrl}/api/v1/app/devices/enrollment-challenges`, {
    method: 'POST',
    headers: buildAuthorizationHandoffHeaders(handoff),
    body: { purpose: 'device_enrollment' },
    timeoutMs: IDENTITY_REQUEST_TIMEOUT_MS
  })
  if (status !== 200) {
    throwMappedError(status, data, 'fetchEnrollmentChallenge')
  }
  const challenge = (data as { challenge?: unknown })?.challenge
  if (typeof challenge !== 'string' || !challenge) {
    throw createServiceError('device_not_bound', '设备绑定失败，请重试', 'enrollment challenge malformed')
  }
  return {
    challenge,
    expires_at: String((data as { expires_at?: unknown })?.expires_at || '')
  }
}

/**
 * POST /api/v1/app/auth-requests/:request_id/approve —— 提交设备签名审批。
 * 私钥不进入 JS：signature 由 Rust identity_sign_auth_request 产出。
 */
export const submitApprove = async (input: {
  baseUrl: string
  requestId: string
  handoff: string
  approval: IdentitySignedApproval
}): Promise<IdentityApproveResult> => {
  if (isTestAccountBlocked()) {
    throw createServiceError('test_account_blocked', DEFAULT_MESSAGES.test_account_blocked)
  }
  const { baseUrl, requestId, handoff, approval } = input
  const body = {
    device_id: approval.device_id,
    issued_at: approval.issued_at,
    nonce: approval.nonce,
    signature: approval.signature,
    canonical_version: approval.canonical_version
  }
  const { status, data } = await requestJson(
    `${baseUrl}/api/v1/app/auth-requests/${requestId}/approve`,
    {
      method: 'POST',
      headers: buildAuthorizationHandoffHeaders(handoff),
      body,
      timeoutMs: IDENTITY_REQUEST_TIMEOUT_MS
    }
  )
  if (status !== 200) {
    throwMappedError(status, data, 'submitApprove')
  }
  const result = data as IdentityApproveResult
  return {
    request_id: String(result?.request_id || requestId),
    status: String(result?.status || ''),
    approved_at: result?.approved_at ?? null,
    already_approved: !!result?.already_approved
  }
}

/**
 * 终端动作（deny / cancel）——best-effort：
 *   - 冻结 Core（#622）尚无 deny/cancel 路由（404/405），此时仅本地终态，
 *     服务器端请求将在 TTL 内自然过期（issue #623「Deny/Close」允许该兜底）；
 *   - 未来 Core 补充路由后自动生效（不改变前端语义）。
 * 网络失败不抛错（本地终态不依赖服务器结果），只返回是否送达服务器。
 */
export const submitTerminalAction = async (input: {
  baseUrl: string
  requestId: string
  handoff: string
  action: 'deny' | 'cancel'
}): Promise<boolean> => {
  const { baseUrl, requestId, handoff, action } = input
  try {
    const { status } = await requestJson(
      `${baseUrl}/api/v1/app/auth-requests/${requestId}/${action}`,
      {
        method: 'POST',
        headers: buildAuthorizationHandoffHeaders(handoff),
        body: {},
        timeoutMs: IDENTITY_TERMINAL_ACTION_TIMEOUT_MS
      }
    )
    // 404/405 = 路由不存在（冻结 Core）：按“未送达服务器”处理，不视为错误
    return status === 200 || status === 204
  } catch {
    return false
  }
}
