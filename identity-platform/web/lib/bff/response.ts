/**
 * BFF 响应工具（错误映射与 no-store 头）。
 *
 * 约定：错误体统一 { error: <code> }；绝不回显 handoff 或 Core 内部细节；
 * 所有详情/状态/resume 响应都带 Cache-Control: no-store。
 */
import { NextResponse } from 'next/server'
import { CoreApiError, type CoreErrorCode } from '@/lib/core-client/contract'

/** BFF JSON 响应头：请求详情/状态/授权结果一律不缓存 */
export function noStoreJsonHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
  }
}

export function errorJson(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status, headers: noStoreJsonHeaders() })
}

/** 把 Core API 错误映射为同域错误（状态码对齐 Core 语义，错误码原样透传） */
export function coreErrorResponse(err: unknown): NextResponse {
  if (err instanceof CoreApiError) {
    return errorJson(coreErrorStatus(err.code), err.code)
  }
  // 网络/未知错误：一律 502，不泄露内部细节
  return errorJson(502, 'internal')
}

function coreErrorStatus(code: CoreErrorCode): number {
  switch (code) {
    case 'invalid_handoff':
      return 401
    case 'not_found':
      return 404
    case 'expired':
      return 410
    case 'client_unavailable':
      return 422
    case 'not_approved':
      return 409
    case 'invalid_request':
      return 400
    default:
      return 502
  }
}
