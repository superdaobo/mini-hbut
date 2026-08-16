/**
 * 管理员页面客户端 API（同源 fetch 到 /api/v1/admin/*，issue #625）。
 *  - 统一错误映射：401 → 跳登录；403 step_up_required → 触发重新认证；
 *  - CSRF：从 /me 获取 csrf_token（与双提交 cookie 同值），mutation 一律带 x-csrf-token；
 *  - 禁止 localStorage：登录态只存在于 HttpOnly cookie。
 */
'use client'

import type {
  AdminAppDetailDTO,
  AdminAppSummaryDTO,
  AdminAuditEntryDTO,
  AdminMeDTO,
  AdminOverviewDTO,
  AdminReviewDTO,
  AdminRole,
  ScopeDecisionInput,
} from '@/lib/admin/contract'

export interface MeResult {
  admin: { sub: string; display_name: string; roles: AdminRole[] }
  csrf_token: string
}

/** 错误码 → 中文提示 */
export function adminErrorMessage(code: string): string {
  switch (code) {
    case 'unauthorized':
      return '登录已过期，请重新登录'
    case 'forbidden':
      return '当前账号没有管理员权限'
    case 'step_up_required':
      return '高风险操作需要重新认证（10 分钟内完成过 Mini-HBUT 登录）'
    case 'not_found':
      return '应用或审核记录不存在'
    case 'invalid_request':
      return '提交内容不合法，请检查表单'
    case 'invalid_state':
      return '当前状态不允许该操作'
    case 'revision_mismatch':
      return '应用配置在提交审核后已变化，原审核已作废，请开发者重新提交'
    default:
      return '服务暂时不可用，请稍后重试'
  }
}

export class AdminClientApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'AdminClientApiError'
    this.status = status
    this.code = code
  }
}

/** step-up 过期：清除会话并回到登录（重新走 App Approval，不是前端 confirm） */
async function requireReauth(): Promise<void> {
  try {
    await fetch('/api/v1/admin/session/reauth', { method: 'POST', credentials: 'same-origin' })
  } finally {
    window.location.href = '/login'
  }
}

async function request<T>(path: string, init?: RequestInit & { csrf?: string }): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init?.body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  if (init?.csrf) {
    headers['x-csrf-token'] = init.csrf
  }
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (!res.ok) {
    let code = 'internal'
    let message: string | undefined
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      if (body && typeof body.error === 'string') {
        code = body.error
      }
      if (body && typeof body.message === 'string') {
        message = body.message
      }
    } catch {
      // 非 JSON 错误体
    }
    throw new AdminClientApiError(res.status, code, adminErrorMessage(code))
  }
  return (await res.json()) as T
}

/** 当前管理员 + CSRF（页面挂载时调用）；401 → 跳登录 */
export async function fetchAdminMe(): Promise<MeResult> {
  try {
    return await request<MeResult>('/api/v1/admin/me')
  } catch (err) {
    if (err instanceof AdminClientApiError && err.status === 401) {
      window.location.href = '/login'
      throw err
    }
    throw err
  }
}

export async function fetchOverview(): Promise<AdminOverviewDTO> {
  const data = await request<{ overview: AdminOverviewDTO }>('/api/v1/admin/overview')
  return data.overview
}

export interface AdminAppsQuery {
  status?: string
  client_type?: string
  search?: string
  sensitive_scope?: boolean
}

export async function fetchApps(query: AdminAppsQuery = {}): Promise<{ apps: AdminAppSummaryDTO[]; total: number }> {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.client_type) params.set('client_type', query.client_type)
  if (query.search) params.set('search', query.search)
  if (query.sensitive_scope) params.set('sensitive_scope', '1')
  const qs = params.toString()
  return request<{ apps: AdminAppSummaryDTO[]; total: number }>(`/api/v1/admin/apps${qs ? `?${qs}` : ''}`)
}

export async function fetchApp(id: string): Promise<AdminAppDetailDTO> {
  const data = await request<{ app: AdminAppDetailDTO }>(`/api/v1/admin/apps/${encodeURIComponent(id)}`)
  return data.app
}

export async function fetchReviews(id: string): Promise<AdminReviewDTO[]> {
  const data = await request<{ reviews: AdminReviewDTO[] }>(`/api/v1/admin/apps/${encodeURIComponent(id)}/reviews`)
  return data.reviews
}

/** mutation 统一封装：403 step_up_required → 触发重新认证 */
async function mutate<T>(path: string, body: unknown, csrf: string): Promise<T> {
  try {
    return await request<T>(path, { method: 'POST', body: JSON.stringify(body), csrf })
  } catch (err) {
    if (err instanceof AdminClientApiError && err.code === 'step_up_required') {
      await requireReauth()
    }
    throw err
  }
}

export async function approveReview(
  id: string,
  reviewId: string,
  input: { scope_decisions: ScopeDecisionInput[]; note?: string | null },
  csrf: string,
): Promise<void> {
  await mutate<{ review: unknown }>(
    `/api/v1/admin/apps/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}/approve`,
    input,
    csrf,
  )
}

export async function rejectReview(id: string, reviewId: string, reason: string, csrf: string): Promise<void> {
  await mutate<{ review: unknown }>(
    `/api/v1/admin/apps/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}/reject`,
    { reason },
    csrf,
  )
}

export async function suspendApp(id: string, reason: string, csrf: string): Promise<void> {
  await mutate<{ client: unknown }>(`/api/v1/admin/apps/${encodeURIComponent(id)}/suspend`, { reason }, csrf)
}

export async function unsuspendApp(id: string, reason: string, csrf: string): Promise<void> {
  await mutate<{ client: unknown }>(`/api/v1/admin/apps/${encodeURIComponent(id)}/unsuspend`, { reason }, csrf)
}

export async function revokeApp(id: string, reason: string, csrf: string): Promise<void> {
  await mutate<{ client: unknown }>(`/api/v1/admin/apps/${encodeURIComponent(id)}/revoke`, { reason }, csrf)
}

export async function fetchAudit(opts: { event_type?: string; limit?: number } = {}): Promise<AdminAuditEntryDTO[]> {
  const params = new URLSearchParams()
  if (opts.event_type) params.set('event_type', opts.event_type)
  if (opts.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  const data = await request<{ events: AdminAuditEntryDTO[] }>(`/api/v1/admin/audit${qs ? `?${qs}` : ''}`)
  return data.events
}
