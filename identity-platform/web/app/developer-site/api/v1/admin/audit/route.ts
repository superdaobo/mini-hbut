/**
 * BFF：GET /api/v1/admin/audit —— 审计查询（仅 identity_admin，Core 侧强制）。
 * 参数：event_type / target_type / before（UUIDv7 游标）/ limit。
 */

import type { NextRequest } from 'next/server'
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
  const sp = request.nextUrl.searchParams
  const rawLimit = sp.get('limit')
  const limit = rawLimit !== null && Number.isInteger(Number(rawLimit)) ? Number(rawLimit) : undefined
  try {
    const events = await getAdminApi().listAudit(session.sub, {
      event_type: sp.get('event_type') ?? undefined,
      before: sp.get('before') ?? undefined,
      limit,
    })
    return adminJsonOk({ events })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
