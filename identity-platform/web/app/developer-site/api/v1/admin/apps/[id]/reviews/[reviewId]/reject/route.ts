/**
 * BFF：POST /api/v1/admin/apps/[id]/reviews/[reviewId]/reject
 *  - 必须填写开发者可读 reason（1..2000）；
 *  - 409 revision_mismatch = TOCTOU 防护。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminApi } from '@/lib/admin/client'
import { errorJson } from '@/lib/developer-api/bff'
import { adminErrorResponse, adminJsonOk } from '../../../../../_shared'
import { authTimeOf, guardAdminMutation } from '@/lib/admin/bff'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; reviewId: string }> },
) {
  const session = guardAdminMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  const { id, reviewId } = await ctx.params
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
  try {
    const review = await getAdminApi().rejectReview(session.sub, id, reviewId, { reason }, authTimeOf(session))
    return adminJsonOk({ review })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
