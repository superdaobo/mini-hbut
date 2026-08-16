/**
 * BFF 公共守卫（仅类型依赖 next/server，逻辑可单测）。
 *
 * 安全要点（issue #630）：
 *  - 只有 request id、没有 handoff 时不给请求详情和状态（readHandoffHeader 拒绝）；
 *  - handoff 只允许经敏感 header x-identity-handoff 到达（不落 query/日志/storage）；
 *  - 不接受任意 next= 参数（回调只能由 Core/oidc-provider 决定，见 resume 路由）。
 */
import type { NextRequest } from 'next/server'
import { HANDOFF_TOKEN_RE } from '@/lib/auth/handoff'

export const HANDOFF_HEADER = 'x-identity-handoff'

/** 读取并校验敏感 header 中的 handoff；缺失/格式非法返回 null（fail closed） */
export function readHandoffHeader(request: NextRequest): string | null {
  const raw = request.headers.get(HANDOFF_HEADER)
  if (!raw || !HANDOFF_TOKEN_RE.test(raw)) {
    return null
  }
  return raw
}

/** 请求是否携带 next= 参数（一律拒绝） */
export function hasNextParam(request: NextRequest): boolean {
  return request.nextUrl.searchParams.has('next')
}
