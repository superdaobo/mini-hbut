/**
 * 客户端 API 助手（同源 fetch 到 /api/v1/developer/*）。
 *  - 统一错误映射：401 → 跳登录；其余错误码 → 中文提示；
 *  - CSRF：从 /me 获取 csrf_token（与双提交 cookie 同值），mutation 一律带
 *    x-csrf-token header；
 *  - 禁止 localStorage：登录态/令牌只存在于 HttpOnly cookie，本模块不落任何存储。
 */
'use client'

import type {
  CreateAppInput,
  DeveloperAppDetailDTO,
  DeveloperAppSummaryDTO,
  DeveloperDTO,
} from '@/lib/developer/contract'
import type { RedirectUriKind } from '@/lib/developer/contract'

export interface MeResult {
  developer: DeveloperDTO
  csrf_token: string
}

/** 错误码 → 中文提示（与服务端 DeveloperApiErrorCode 对应） */
export function errorMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'unauthorized':
      return '登录已过期，请重新登录'
    case 'forbidden':
      return '没有权限执行该操作（会话校验失败或账号被暂停）'
    case 'not_found':
      return '应用不存在或不属于当前账号'
    case 'invalid_request':
      return fallback ?? '提交的内容不合法，请检查表单'
    case 'invalid_state':
      return fallback ?? '当前状态不允许该操作'
    default:
      return '服务暂时不可用，请稍后重试'
  }
}

export class ClientApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ClientApiError'
    this.status = status
    this.code = code
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
  // #708：存在未消费的 Turnstile 令牌则自动附带（消费后置空，防重放）
  const tt = consumeTurnstileToken()
  if (tt) {
    headers['x-turnstile-token'] = tt
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
    throw new ClientApiError(res.status, code, errorMessage(code, message))
  }
  return (await res.json()) as T
}

/** 当前开发者 + CSRF（页面挂载时调用；401 直接跳登录） */
export async function fetchMe(): Promise<MeResult> {
  try {
    return await request<MeResult>('/api/v1/developer/me')
  } catch (err) {
    if (err instanceof ClientApiError && err.status === 401) {
      window.location.href = '/login'
      throw err
    }
    throw err
  }
}

export async function fetchApps(): Promise<DeveloperAppSummaryDTO[]> {
  const data = await request<{ apps: DeveloperAppSummaryDTO[] }>('/api/v1/developer/apps')
  return data.apps
}

export async function fetchApp(id: string): Promise<DeveloperAppDetailDTO> {
  const data = await request<{ app: DeveloperAppDetailDTO }>(`/api/v1/developer/apps/${encodeURIComponent(id)}`)
  return data.app
}

import { consumeTurnstileToken } from '@/lib/developer/turnstile-client'

export async function createApp(input: CreateAppInput, csrf: string): Promise<{ id: string; client_id: string; client_secret: string | null }> {
  return request<{ id: string; client_id: string; client_secret: string | null }>(
    '/api/v1/developer/apps',
    { method: 'POST', body: JSON.stringify(input), csrf },
  )
}

export async function updateApp(
  id: string,
  input: Partial<Pick<DeveloperAppDetailDTO, 'name' | 'description' | 'homepage_url' | 'privacy_policy_url' | 'contact'>>,
  csrf: string,
): Promise<DeveloperAppDetailDTO> {
  const data = await request<{ app: DeveloperAppDetailDTO }>(`/api/v1/developer/apps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    csrf,
  })
  return data.app
}

export async function deleteApp(id: string, csrf: string): Promise<void> {
  await request<{ deleted: boolean }>(`/api/v1/developer/apps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    csrf,
  })
}

export async function addRedirectUri(
  id: string,
  uri: string,
  kind: RedirectUriKind,
  csrf: string,
): Promise<DeveloperAppDetailDTO> {
  const data = await request<{ app: DeveloperAppDetailDTO }>(
    `/api/v1/developer/apps/${encodeURIComponent(id)}/redirect-uris`,
    { method: 'POST', body: JSON.stringify({ uri, kind }), csrf },
  )
  return data.app
}

export async function removeRedirectUri(id: string, rid: string, csrf: string): Promise<DeveloperAppDetailDTO> {
  const data = await request<{ app: DeveloperAppDetailDTO }>(
    `/api/v1/developer/apps/${encodeURIComponent(id)}/redirect-uris/${encodeURIComponent(rid)}`,
    { method: 'DELETE', csrf },
  )
  return data.app
}

export interface ScopePutInput {
  scope: string
  justification: string | null
}

export async function putScopes(id: string, scopes: ScopePutInput[], csrf: string): Promise<DeveloperAppDetailDTO> {
  const data = await request<{ app: DeveloperAppDetailDTO }>(
    `/api/v1/developer/apps/${encodeURIComponent(id)}/scopes`,
    { method: 'PUT', body: JSON.stringify({ scopes }), csrf },
  )
  return data.app
}

/** 单条 scope（GET /scopes 返回项；justification 对应 core 的 review_note） */
export interface ScopeEntry {
  scope: string
  status: 'requested' | 'approved' | 'rejected'
  justification: string | null
}

/** #687：拉取应用的 scope 列表（含审核状态与理由）；权限 Tab 初始化时加载展示 */
export async function fetchScopes(appId: string): Promise<ScopeEntry[]> {
  const data = await request<{ scopes: ScopeEntry[] }>(
    `/api/v1/developer/apps/${encodeURIComponent(appId)}/scopes`,
  )
  return data.scopes
}

export async function submitApp(id: string, csrf: string): Promise<DeveloperAppDetailDTO> {
  const data = await request<{ app: DeveloperAppDetailDTO }>(
    `/api/v1/developer/apps/${encodeURIComponent(id)}/submit`,
    { method: 'POST', body: '{}', csrf },
  )
  return data.app
}

export async function rotateSecret(id: string, csrf: string): Promise<{ app: DeveloperAppDetailDTO; client_secret: string }> {
  return request<{ app: DeveloperAppDetailDTO; client_secret: string }>(
    `/api/v1/developer/apps/${encodeURIComponent(id)}/credentials/rotate`,
    { method: 'POST', body: '{}', csrf },
  )
}

export async function revokeApp(id: string, csrf: string): Promise<DeveloperAppDetailDTO> {
  const data = await request<{ app: DeveloperAppDetailDTO }>(
    `/api/v1/developer/apps/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', body: '{}', csrf },
  )
  return data.app
}
