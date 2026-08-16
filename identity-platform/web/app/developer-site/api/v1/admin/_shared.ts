/**
 * Admin BFF 路由共享助手（issue #625）。
 * 统一错误映射：AdminApiError → { error: <code> }；未知 → 502 internal；
 * 响应一律 no-store（管理员数据不缓存）。
 */
import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/admin/contract'
import { noStoreJsonHeaders } from '@/lib/developer-api/bff'

export function adminErrorResponse(err: unknown): NextResponse {
  if (err instanceof AdminApiError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status, headers: noStoreJsonHeaders() },
    )
  }
  return NextResponse.json({ error: 'internal' }, { status: 502, headers: noStoreJsonHeaders() })
}

export function adminJsonOk(data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: noStoreJsonHeaders() })
}
