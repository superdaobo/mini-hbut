/**
 * BFF：GET /api/v1/admin/apps —— 应用队列（默认 pending 优先；支持过滤/搜索）。
 * 过滤参数：status / client_type / sensitive_scope / search / developer。
 */

import type { NextRequest } from 'next/server'
import { getAdminApi } from '@/lib/admin/client'
import type { AdminAppListFilter } from '@/lib/admin/store'
import { errorJson } from '@/lib/developer-api/bff'
import { adminErrorResponse, adminJsonOk } from '../_shared'
import { requireAdminSession } from '@/lib/admin/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = requireAdminSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  const sp = request.nextUrl.searchParams
  const filter: AdminAppListFilter = {
    status: sp.get('status') ?? undefined,
    client_type: sp.get('client_type') ?? undefined,
    search: sp.get('search') ?? undefined,
    developer: sp.get('developer') ?? undefined,
    sensitive_scope: sp.get('sensitive_scope') === '1' || sp.get('sensitive_scope') === 'true',
  }
  try {
    const result = await getAdminApi().listApps(session.sub, filter)
    return adminJsonOk(result)
  } catch (err) {
    return adminErrorResponse(err)
  }
}
