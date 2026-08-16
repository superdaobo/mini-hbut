/**
 * BFF：GET /api/v1/admin/overview —— 概览（待审核数 / 敏感 scope / 活跃 / 暂停 / 最近事件）。
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
  try {
    const overview = await getAdminApi().overview(session.sub)
    return adminJsonOk({ overview })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
