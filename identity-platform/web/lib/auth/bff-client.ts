/**
 * 浏览器端 BFF 客户端（只与同域 /api/auth/requests/* 通信）。
 *
 * 安全约定（issue #630）：
 *  - handoff 只经敏感 header x-identity-handoff 传递，绝不进入 URL/query；
 *  - fetch 显式 cache: 'no-store'，与 BFF 响应头 Cache-Control: no-store 双保险；
 *  - 网络层异常（含 AbortError）原样抛出，由调用方决定退避/忽略。
 */
import type {
  RequestDetailDTO,
  RequestStatusDTO,
  ResumeResultDTO,
} from '@/lib/core-client/contract'

export const BFF_HANDOFF_HEADER = 'x-identity-handoff'

export type BffResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; status: number }

export interface BffClient {
  getDetail(requestId: string, handoff: string, signal?: AbortSignal): Promise<BffResult<RequestDetailDTO>>
  getStatus(requestId: string, handoff: string, signal?: AbortSignal): Promise<BffResult<RequestStatusDTO>>
  resume(requestId: string, handoff: string, signal?: AbortSignal): Promise<BffResult<ResumeResultDTO>>
}

export function createBffClient(fetchImpl: typeof fetch = fetch): BffClient {
  async function call<T>(
    path: string,
    method: 'GET' | 'POST',
    handoff: string,
    signal?: AbortSignal,
  ): Promise<BffResult<T>> {
    const res = await fetchImpl(path, {
      method,
      headers: { [BFF_HANDOFF_HEADER]: handoff },
      signal,
      cache: 'no-store',
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) {
      return { ok: false, code: body?.error ?? 'internal', status: res.status }
    }
    return { ok: true, value: body as T }
  }

  return {
    getDetail: (requestId, handoff, signal) =>
      call<RequestDetailDTO>(`/api/auth/requests/${encodeURIComponent(requestId)}`, 'GET', handoff, signal),
    getStatus: (requestId, handoff, signal) =>
      call<RequestStatusDTO>(`/api/auth/requests/${encodeURIComponent(requestId)}/status`, 'GET', handoff, signal),
    resume: (requestId, handoff, signal) =>
      call<ResumeResultDTO>(`/api/auth/requests/${encodeURIComponent(requestId)}/resume`, 'POST', handoff, signal),
  }
}

/** 判断是否为 AbortController 主动中止（中止时静默，不当作网络错误/退避） */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
