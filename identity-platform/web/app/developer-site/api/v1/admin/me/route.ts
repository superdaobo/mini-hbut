/**
 * BFF：GET /api/v1/admin/me —— 当前管理员身份（角色来自 Core RBAC）。
 * 返回 { admin: { sub, display_name, roles }, csrf_token }；
 * 非管理员（无角色）→ 403 forbidden（页面据此隐藏/拒绝，真正的边界在 Core）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminApi } from '@/lib/admin/client'
import { errorJson } from '@/lib/developer-api/bff'
import { adminErrorResponse, adminJsonOk } from '../_shared'
import { requireAdminSession } from '@/lib/admin/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  try {
    const me = await getAdminApi().me(session.sub)
    return adminJsonOk({
      admin: { sub: me.sub, display_name: session.display_name, roles: me.roles },
      csrf_token: session.csrf,
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
