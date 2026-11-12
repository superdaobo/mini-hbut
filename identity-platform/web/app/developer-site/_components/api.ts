/**
 * 客户端 API 助手（同源 fetch 到 /api/v1/developer/*）。
 *  - 统一错误映射：401 → 跳登录；其余错误码 → 中文提示；
 *  - 禁止 localStorage：登录态/令牌只存在于 HttpOnly cookie，本模块不落任何存储。
 * P4-4（mini-hbut#1219）：自建注册表退役 —— 写助手（createApp/updateApp/
 * deleteApp/addRedirectUri/removeRedirectUri/putScopes/submitApp/rotateSecret/
 * revokeApp）移除；只保留只读查询（fetchMe/fetchApps/fetchApp/fetchScopes）。
 */
'use client'

import type {
  DeveloperAppDetailDTO,
  DeveloperAppSummaryDTO,
  DeveloperDTO,
} from '@/lib/developer/contract'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init?.body !== undefined) {
    headers['content-type'] = 'application/json'
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

/** 单条 scope（GET /scopes 返回项；justification 对应 core 的 review_note） */
export interface ScopeEntry {
  scope: string
  status: 'requested' | 'approved' | 'rejected'
  justification: string | null
}

/** 拉取应用的 scope 列表（含审核状态与理由）；权限 Tab 初始化时加载展示 */
export async function fetchScopes(appId: string): Promise<ScopeEntry[]> {
  const data = await request<{ scopes: ScopeEntry[] }>(
    `/api/v1/developer/apps/${encodeURIComponent(appId)}/scopes`,
  )
  return data.scopes
}
