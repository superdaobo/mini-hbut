/**
 * BFF：GET /api/v1/developer/apps/[id]/audit —— 审计/活动记录。
 * secret 值永不进入 audit（测试固化）；本路由只读。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import { developerErrorResponse, errorJson, jsonOk, requireSession } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  const { id } = await ctx.params
  try {
    const audit = await getDeveloperApi().listAudit(session.sub, id)
    if (!audit) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ audit })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
