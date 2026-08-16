/**
 * BFF：GET /api/v1/admin/apps/[id]/reviews —— 审核历史（快照不可变，防 TOCTOU）。
 */

import type { NextRequest } from 'next/server'
import { getAdminApi } from '@/lib/admin/client'
import { errorJson } from '@/lib/developer-api/bff'
import { adminErrorResponse, adminJsonOk } from '../../../_shared'
import { requireAdminSession } from '@/lib/admin/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = requireAdminSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  const { id } = await ctx.params
  try {
    const reviews = await getAdminApi().listReviews(session.sub, id)
    return adminJsonOk({ reviews })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
