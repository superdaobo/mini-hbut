/**
 * BFF：POST /api/v1/admin/apps/[id]/reviews/[reviewId]/approve
 *  - CSRF/Origin/会话守卫（guardAdminMutation）；
 *  - auth_time = 会话 iat（Core 对含敏感 scope 的审核强制近期认证 step-up）；
 *  - body: { scope_decisions: [{scope, decision, note?}], note? }；
 *  - 409 revision_mismatch = TOCTOU 防护（应用内容已变）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminApi } from '@/lib/admin/client'
import type { ScopeDecisionInput } from '@/lib/admin/contract'
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
  if (typeof raw !== 'object' || raw === null) {
    return errorJson(400, 'invalid_request')
  }
  const rec = raw as Record<string, unknown>
  if (!Array.isArray(rec.scope_decisions)) {
    return errorJson(400, 'invalid_request')
  }
  try {
    const review = await getAdminApi().approveReview(
      session.sub,
      id,
      reviewId,
      {
        // 数组已在上方校验；逐项 shape 校验由 Core 执行（scope_decisions 白名单）
        scope_decisions: rec.scope_decisions as ScopeDecisionInput[],
        note: typeof rec.note === 'string' ? rec.note : null,
      },
      authTimeOf(session),
    )
    return adminJsonOk({ review })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
