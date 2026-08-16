/**
 * Developer API 消费层（Web BFF → Core，issue #624）。
 *
 * 服务端类型化客户端：
 *  - 桩模式（IDENTITY_CORE_STUB=1 或 IDENTITY_OIDC_STUB=1）：内存桩（stub-store），
 *    语义与对接合同一致（IDOR/生命周期/secret 全在桩内实现并被测试固化）；
 *  - 真实模式：调用 Core 的 {coreBaseUrl}/api/v1/developer/*，
 *    以 x-developer-subject header 传递会话推导的 sub（owner 永不出自请求体）；
 *
 * fail closed：两者都不是 → 抛错（禁止静默走错通道）。
 * 真实 Core 的传输认证（BFF↔Core 服务令牌）由 #626 安全硬化统一补充，
 * 本层预留 x-developer-subject 契约。
 */

import { DeveloperApiError, type CreateAppInput, type UpdateAppInput, type DeveloperAppSummaryDTO, type DeveloperAppDetailDTO } from '@/lib/developer/contract'
import { coreBaseUrl } from '@/lib/core-client/index'
import { getStubDeveloperStore } from './stub-store'
import type { DeveloperStore } from './store'
import { serviceTokenHeaders } from '@/lib/security/service-token'

export type EnvLike = Record<string, string | undefined>

/** 会话推导的 sub 通过该 header 传给 Core（Web 永不接受浏览器输入的 sub） */
export const DEVELOPER_SUBJECT_HEADER = 'x-developer-subject'

/** 桩模式开关（与 auth 流程的 IDENTITY_CORE_STUB 同源，另支持 OIDC 专用开关） */
export function isDeveloperStubMode(env: EnvLike = process.env): boolean {
  return env.IDENTITY_CORE_STUB === '1' || env.IDENTITY_OIDC_STUB === '1'
}

function isCreateAppInput(v: unknown): v is CreateAppInput {
  return typeof v === 'object' && v !== null
}

function isUpdateAppInput(v: unknown): v is UpdateAppInput {
  return typeof v === 'object' && v !== null
}

/** 真实 Core 客户端（服务端 fetch；错误码映射与契约一致） */
export function createDeveloperApiHttpClient(baseUrl: string, fetchImpl: typeof fetch = fetch): DeveloperStore {
  async function request<T>(
    method: string,
    path: string,
    sub: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        [DEVELOPER_SUBJECT_HEADER]: sub,
        // #626：BFF → Core 服务令牌（IDENTITY_SERVICE_TOKEN），Core 校验缺失/伪造 401
        ...serviceTokenHeaders(),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    if (!res.ok) {
      let code: DeveloperApiError['code'] = 'internal'
      try {
        const parsed = (await res.json()) as { error?: string }
        if (
          parsed &&
          ['unauthorized', 'forbidden', 'not_found', 'invalid_request', 'invalid_state', 'internal'].includes(parsed.error ?? '')
        ) {
          code = parsed.error as DeveloperApiError['code']
        }
      } catch {
        // 非 JSON 错误体：保持 internal，不向客户端回显
      }
      throw new DeveloperApiError(res.status, code)
    }
    return (await res.json()) as T
  }

  const appPath = (appId: string): string => `/api/v1/developer/apps/${encodeURIComponent(appId)}`

  return {
    getDeveloper: (sub) => request('GET', '/api/v1/developer/me', sub),
    ensureDeveloper: (sub, displayName) =>
      request('POST', '/api/v1/developer/me', sub, { display_name: displayName }),
    listApps: async (sub) => {
      const data = await request<{ apps: DeveloperAppSummaryDTO[] }>('GET', '/api/v1/developer/apps', sub)
      return data.apps
    },
    createApp: (sub, input) => {
      if (!isCreateAppInput(input)) {
        throw new DeveloperApiError(400, 'invalid_request')
      }
      return request('POST', '/api/v1/developer/apps', sub, input)
    },
    getApp: async (sub, appId) => {
      const data = await request<{ app: DeveloperAppDetailDTO }>('GET', appPath(appId), sub)
      return data.app
    },
    updateApp: async (sub, appId, input) => {
      if (!isUpdateAppInput(input)) {
        throw new DeveloperApiError(400, 'invalid_request')
      }
      const data = await request<{ app: DeveloperAppDetailDTO }>('PATCH', appPath(appId), sub, input)
      return data.app
    },
    deleteApp: async (sub, appId) => {
      const data = await request<{ deleted: true }>('DELETE', appPath(appId), sub)
      return data
    },
    addRedirectUri: async (sub, appId, input) => {
      const data = await request<{ app: DeveloperAppDetailDTO }>('POST', `${appPath(appId)}/redirect-uris`, sub, input)
      return data.app
    },
    removeRedirectUri: async (sub, appId, redirectUriId) => {
      const data = await request<{ app: DeveloperAppDetailDTO }>('DELETE', `${appPath(appId)}/redirect-uris/${encodeURIComponent(redirectUriId)}`, sub)
      return data.app
    },
    putScopes: async (sub, appId, scopes) => {
      const data = await request<{ app: DeveloperAppDetailDTO }>('PUT', `${appPath(appId)}/scopes`, sub, { scopes })
      return data.app
    },
    getScopes: (sub, appId) => request('GET', `${appPath(appId)}/scopes`, sub),
    submitForReview: async (sub, appId) => {
      const data = await request<{ app: DeveloperAppDetailDTO }>('POST', `${appPath(appId)}/submit`, sub, {})
      return data.app
    },
    rotateSecret: async (sub, appId) => {
      const data = await request<{ app: DeveloperAppDetailDTO; client_secret: string }>('POST', `${appPath(appId)}/credentials/rotate`, sub, {})
      return { app: data.app, client_secret: data.client_secret }
    },
    revokeApp: async (sub, appId) => {
      const data = await request<{ app: DeveloperAppDetailDTO }>('POST', `${appPath(appId)}/revoke`, sub, {})
      return data.app
    },
    listAudit: (sub, appId) => request('GET', `${appPath(appId)}/audit`, sub),
  }
}

/** 按环境选择 Developer Store（fail closed） */
export function getDeveloperApi(env: EnvLike = process.env): DeveloperStore {
  if (isDeveloperStubMode(env)) {
    return getStubDeveloperStore()
  }
  return createDeveloperApiHttpClient(coreBaseUrl(env))
}
