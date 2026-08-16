/**
 * BFF：GET /api/v1/admin/apps/[id] —— 审核详情（8 分区数据源）。
 */

import type { NextRequest } from 'next/server'
import { getAdminApi } from '@/lib/admin/client'
import { errorJson } from '@/lib/developer-api/bff'
import { adminErrorResponse, adminJsonOk } from '../../_shared'
import { requireAdminSession } from '@/lib/admin/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = requireAdminSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  const { id } = await ctx.params
  try {
    const app = await getAdminApi().getApp(session.sub, id)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return adminJsonOk({ app })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
