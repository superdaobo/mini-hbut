/**
 * BFF：DELETE /api/v1/developer/apps/[id]/redirect-uris/[rid]
 * 删除单条 redirect URI（Pending 及之后自动重新进入审核）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import { developerErrorResponse, errorJson, guardMutation, jsonOk } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; rid: string }> },
) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  const { id, rid } = await ctx.params
  try {
    const app = await getDeveloperApi().removeRedirectUri(session.sub, id, rid)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
