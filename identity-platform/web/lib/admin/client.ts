/**
 * Admin API 消费层（Web BFF → Core，issue #625）。
 *
 * - 桩模式（IDENTITY_CORE_STUB=1 / IDENTITY_OIDC_STUB=1）：内存桩（stub-store），
 *   语义与 Core 合同一致（RBAC/self-review/快照/幂等全在桩内实现并被测试固化）；
 * - 真实模式：调用 Core 的 {coreBaseUrl}/api/v1/admin/*，以服务端持有的会话 sub
 *   经 x-admin-subject header 传身份，x-admin-auth-time 传会话 iat（step-up）；
 * - fail closed：两者都不是 → 抛错；
 * - BFF↔Core 传输认证由 #626 统一补充（本层预留 header 契约）。
 */
import { AdminApiError, mapAdminErrorCode, type AdminRole, type AdminAppDetailDTO } from './contract'
import { coreBaseUrl } from '@/lib/core-client/index'
import { getStubAdminStore } from './stub-store'
import type { AdminStore } from './store'
import { serviceTokenHeaders } from '@/lib/security/service-token'

export type EnvLike = Record<string, string | undefined>

/** 会话推导的 sub（BFF → Core 身份；Web 永不接受浏览器输入的 sub） */
export const ADMIN_SUBJECT_HEADER = 'x-admin-subject'
/** 会话 iat（= 认证时刻，epoch 秒）；高风险动作 Core 校验窗口 */
export const ADMIN_AUTH_TIME_HEADER = 'x-admin-auth-time'

/** 桩模式开关（与 developer-api 同源） */
export function isAdminStubMode(env: EnvLike = process.env): boolean {
  return env.IDENTITY_CORE_STUB === '1' || env.IDENTITY_OIDC_STUB === '1'
}

/** 真实 Core 客户端（服务端 fetch；错误码映射与契约一致） */
export function createAdminApiHttpClient(baseUrl: string, fetchImpl: typeof fetch = fetch): AdminStore {
  async function request<T>(
    method: string,
    path: string,
    sub: string,
    body?: unknown,
    authTimeSec?: number,
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      [ADMIN_SUBJECT_HEADER]: sub,
      // #626：BFF → Core 服务令牌（IDENTITY_SERVICE_TOKEN），Core 校验缺失/伪造 401
      ...serviceTokenHeaders(),
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    if (authTimeSec !== undefined) {
      headers[ADMIN_AUTH_TIME_HEADER] = String(authTimeSec)
    }
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    if (!res.ok) {
      let code: AdminApiError['code'] = 'internal'
      let message: string | undefined
      try {
        const parsed = (await res.json()) as { error?: string; message?: string }
        if (parsed) {
          code = mapAdminErrorCode(parsed.error)
          if (typeof parsed.message === 'string') {
            message = parsed.message
          }
        }
      } catch {
        // 非 JSON 错误体：保持 internal，不向客户端回显
      }
      throw new AdminApiError(res.status, code, message)
    }
    return (await res.json()) as T
  }

  const appPath = (appId: string): string => `/api/v1/admin/apps/${encodeURIComponent(appId)}`

  return {
    me: (sub) => request('GET', '/api/v1/admin/me', sub),
    overview: (sub) => request('GET', '/api/v1/admin/overview', sub),
    listApps: (sub, filter = {}) => {
      const params = new URLSearchParams()
      if (filter.status) params.set('status', filter.status)
      if (filter.client_type) params.set('client_type', filter.client_type)
      if (filter.search) params.set('search', filter.search)
      if (filter.developer) params.set('developer', filter.developer)
      if (filter.sensitive_scope) params.set('sensitive_scope', '1')
      const qs = params.toString()
      return request('GET', `/api/v1/admin/apps${qs ? `?${qs}` : ''}`, sub)
    },
    getApp: async (sub, appId) => {
      // Core 返回 { app: AdminAppDetailDTO }（一层）
      const data = await request<{ app: AdminAppDetailDTO }>('GET', appPath(appId), sub)
      return data.app
    },
    listReviews: (sub, appId) => request('GET', `${appPath(appId)}/reviews`, sub),
    approveReview: (sub, appId, reviewId, input, authTimeSec) =>
      request('POST', `${appPath(appId)}/reviews/${encodeURIComponent(reviewId)}/approve`, sub, input, authTimeSec),
    rejectReview: (sub, appId, reviewId, input, authTimeSec) =>
      request('POST', `${appPath(appId)}/reviews/${encodeURIComponent(reviewId)}/reject`, sub, input, authTimeSec),
    suspendClient: (sub, appId, reason, authTimeSec) =>
      request('POST', `${appPath(appId)}/suspend`, sub, { reason }, authTimeSec),
    unsuspendClient: (sub, appId, reason, authTimeSec) =>
      request('POST', `${appPath(appId)}/unsuspend`, sub, { reason }, authTimeSec),
    revokeClient: (sub, appId, reason, authTimeSec) =>
      request('POST', `${appPath(appId)}/revoke`, sub, { reason }, authTimeSec),
    listAudit: (sub, opts = {}) => {
      const params = new URLSearchParams()
      if (opts.event_type) params.set('event_type', opts.event_type)
      if (opts.before) params.set('before', opts.before)
      if (opts.limit) params.set('limit', String(opts.limit))
      const qs = params.toString()
      return request('GET', `/api/v1/admin/audit${qs ? `?${qs}` : ''}`, sub)
    },
  }
}

/** 按环境选择 Admin Store（fail closed） */
export function getAdminApi(env: EnvLike = process.env): AdminStore {
  if (isAdminStubMode(env)) {
    return getStubAdminStore()
  }
  return createAdminApiHttpClient(coreBaseUrl(env))
}

export type { AdminRole }
