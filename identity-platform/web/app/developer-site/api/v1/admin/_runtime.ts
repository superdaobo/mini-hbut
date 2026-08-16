/**
 * Admin BFF 运行时动作共享实现（issue #625）。
 * suspend / unsuspend / revoke 三个端点形状完全一致：
 *  - guardAdminMutation（会话 + Origin + CSRF）；
 *  - reason 必填（1..2000，Core 侧再校验）；
 *  - auth_time = 会话 iat（Core 强制近期认证 step-up）；
 *  - 幂等：重复提交返回既有状态。
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminApi } from '@/lib/admin/client'
import { errorJson } from '@/lib/developer-api/bff'
import { adminErrorResponse, adminJsonOk } from './_shared'
import { authTimeOf, guardAdminMutation } from '@/lib/admin/bff'

export type RuntimeAction = 'suspend' | 'unsuspend' | 'revoke'

export async function handleRuntimeAction(
  request: NextRequest,
  appId: string,
  action: RuntimeAction,
): Promise<NextResponse> {
  const session = guardAdminMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorJson(400, 'invalid_request')
  }
  const reason = (raw as Record<string, unknown> | null)?.reason
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return errorJson(400, 'invalid_request')
  }
  const api = getAdminApi()
  const authTime = authTimeOf(session)
  try {
    const client =
      action === 'suspend'
        ? await api.suspendClient(session.sub, appId, reason, authTime)
        : action === 'unsuspend'
          ? await api.unsuspendClient(session.sub, appId, reason, authTime)
          : await api.revokeClient(session.sub, appId, reason, authTime)
    return adminJsonOk({ client })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
