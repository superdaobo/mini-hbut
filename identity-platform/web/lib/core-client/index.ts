/**
 * Core API 类型化客户端（Web 唯一的数据通道，见 #617/#618 信任边界）。
 *
 * 约束：
 *  - Web 只能经 Core API 改状态，禁止直接读写 Identity DB；
 *  - handoff 只经敏感 header x-identity-handoff 转发，绝不进入 URL/query/日志；
 *  - Core 未实现 #619/#620 前，开发/测试可用显式开启的桩模式（IDENTITY_CORE_STUB=1）。
 */
import {
  CoreApiError,
  type CoreErrorCode,
  type CoreRequestStatus,
  type RequestDetailDTO,
  type RequestStatusDTO,
  type ResumeResultDTO,
} from './contract'
import { serviceTokenHeaders } from '@/lib/security/service-token'

export type EnvLike = Record<string, string | undefined>

/** Core API 基地址（IDENTITY_CORE_BASE_URL，必须显式配置） */
export function coreBaseUrl(env: EnvLike = process.env): string {
  const base = env.IDENTITY_CORE_BASE_URL?.trim()
  if (!base) {
    throw new Error('必须显式配置 IDENTITY_CORE_BASE_URL')
  }
  return base.replace(/\/+$/, '')
}

/** handoff 转发的敏感 header 名（浏览器→BFF→Core 全程同名，服务端日志对其脱敏） */
export const HANDOFF_HEADER = 'x-identity-handoff'

/**
 * 构造 Core 请求：handoff 只进 header，不进 URL（可单测的安全属性）。
 * 该属性保证 handoff 不会出现在 CDN/Server access log 与 Referer 中。
 * #626：BFF → Core 服务令牌（IDENTITY_SERVICE_TOKEN）一并附加，Core 校验
 * 缺失/伪造一律 401（production/preview fail closed）。
 */
export function buildCoreRequest(
  baseUrl: string,
  path: string,
  handoff: string,
  env: EnvLike = process.env,
): { url: string; headers: Record<string, string> } {
  return {
    url: `${baseUrl}${path}`,
    headers: {
      [HANDOFF_HEADER]: handoff,
      accept: 'application/json',
      ...serviceTokenHeaders(env),
    },
  }
}

export interface CoreClientOptions {
  signal?: AbortSignal
}

export interface CoreClient {
  getRequestDetail(requestId: string, handoff: string, opts?: CoreClientOptions): Promise<RequestDetailDTO>
  getRequestStatus(requestId: string, handoff: string, opts?: CoreClientOptions): Promise<RequestStatusDTO>
  resumeRequest(requestId: string, handoff: string, opts?: CoreClientOptions): Promise<ResumeResultDTO>
}

const CORE_ERROR_CODES: ReadonlySet<string> = new Set([
  'invalid_handoff',
  'not_found',
  'expired',
  'client_unavailable',
  'not_approved',
  'invalid_request',
  'internal',
])

function isCoreErrorCode(value: string): value is CoreErrorCode {
  return CORE_ERROR_CODES.has(value)
}

/** 真实 Core 客户端（服务端 fetch；redirect: manual 防止误跟随 Core 3xx 而把 handoff 头带往第三方） */
export function createCoreClient(baseUrl: string, fetchImpl: typeof fetch = fetch): CoreClient {
  async function request<T>(
    method: string,
    path: string,
    handoff: string,
    opts?: CoreClientOptions,
  ): Promise<T> {
    const { url, headers } = buildCoreRequest(baseUrl, path, handoff)
    const res = await fetchImpl(url, { method, headers, signal: opts?.signal, redirect: 'manual' })
    if (!res.ok) {
      let code: CoreErrorCode = 'internal'
      try {
        const body = (await res.json()) as { error?: unknown }
        if (body && typeof body.error === 'string' && isCoreErrorCode(body.error)) {
          code = body.error
        }
      } catch {
        // 非 JSON 错误体：保持 internal，不向客户端回显
      }
      throw new CoreApiError(res.status, code)
    }
    return (await res.json()) as T
  }

  return {
    getRequestDetail: (requestId, handoff, opts) =>
      request<RequestDetailDTO>('GET', `/api/v1/requests/${encodeURIComponent(requestId)}`, handoff, opts),
    getRequestStatus: (requestId, handoff, opts) =>
      request<RequestStatusDTO>('GET', `/api/v1/requests/${encodeURIComponent(requestId)}/status`, handoff, opts),
    resumeRequest: (requestId, handoff, opts) =>
      request<ResumeResultDTO>('POST', `/api/v1/requests/${encodeURIComponent(requestId)}/resume`, handoff, opts),
  }
}

/** 桩请求记录（Core 未实现前的内存替身，仅显式开启时使用） */
export interface StubRequestRecord {
  detail: RequestDetailDTO
  status: CoreRequestStatus
  /** 桩认可的一次性 handoff（校验逻辑与真实 Core 一致：摘要校验，这里简化用原文比对） */
  handoff: string
  /** resume 成功后返回的回调（模拟 oidc-provider interactionFinished 结果） */
  resumeRedirectTo?: string
  /** resume 调用次数（幂等性观察点） */
  resumeCalls: number
}

/**
 * 桩 Core 客户端：语义与真实 Core 契约一致（#619/#620 实现后替换）。
 *  - 错误码/状态码与契约对齐：401 invalid_handoff / 404 not_found / 410 expired / 409 not_approved；
 *  - resume 幂等：第二次调用返回 already_resumed，不产生第二份授权结果。
 */
export function createCoreStubClient(store: Map<string, StubRequestRecord> = new Map()): CoreClient {
  function find(requestId: string, handoff: string): StubRequestRecord {
    const rec = store.get(requestId)
    if (!rec) {
      throw new CoreApiError(404, 'not_found')
    }
    if (rec.handoff !== handoff) {
      throw new CoreApiError(401, 'invalid_handoff')
    }
    return rec
  }

  return {
    async getRequestDetail(requestId, handoff) {
      const rec = find(requestId, handoff)
      if (rec.status === 'expired') {
        throw new CoreApiError(410, 'expired')
      }
      return structuredClone(rec.detail)
    },
    async getRequestStatus(requestId, handoff) {
      const rec = find(requestId, handoff)
      if (rec.status === 'expired') {
        throw new CoreApiError(410, 'expired')
      }
      return {
        request_id: rec.detail.request_id,
        status: rec.status,
        expires_at: rec.detail.expires_at,
      }
    },
    async resumeRequest(requestId, handoff) {
      const rec = find(requestId, handoff)
      if (rec.status === 'expired') {
        throw new CoreApiError(410, 'expired')
      }
      if (rec.status !== 'approved') {
        throw new CoreApiError(409, 'not_approved')
      }
      rec.resumeCalls += 1
      return {
        status: rec.resumeCalls > 1 ? 'already_resumed' : 'approved',
        ...(rec.resumeRedirectTo ? { redirect_to: rec.resumeRedirectTo } : {}),
      }
    },
  }
}

/** 模块级桩仓库：桩模式下跨请求共享（仅开发/测试） */
const stubStore = new Map<string, StubRequestRecord>()

/**
 * 按环境选择客户端（fail closed）：
 *  - IDENTITY_CORE_STUB=1 → 内存桩（Core 未实现 #619/#620 时的本地开发/联调）；
 *  - 否则必须配置 IDENTITY_CORE_BASE_URL，缺失即抛错。
 */
export function getCoreClient(env: EnvLike = process.env): CoreClient {
  if (env.IDENTITY_CORE_STUB === '1') {
    return createCoreStubClient(stubStore)
  }
  return createCoreClient(coreBaseUrl(env))
}

/** 向桩仓库写入一条请求（仅开发/测试） */
export function seedStubRequest(record: Omit<StubRequestRecord, 'resumeCalls'>): void {
  stubStore.set(record.detail.request_id, { ...record, resumeCalls: 0 })
}

/** 清空桩仓库（测试隔离） */
export function clearStubStore(): void {
  stubStore.clear()
}
