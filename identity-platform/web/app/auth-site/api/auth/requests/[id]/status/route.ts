/**
 * BFF：GET /api/auth/requests/[id]/status —— 最小状态轮询端点（同域代理到 Core）。
 *
 * 安全约定与详情端点一致：
 *  - 必须带敏感 header x-identity-handoff；
 *  - 响应 Cache-Control: no-store（轮询响应绝不进任何缓存）；
 *  - 不记录任何请求头/日志（handoff 红线）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCoreClient } from '@/lib/core-client'
import { readHandoffHeader, hasNextParam } from '@/lib/bff/helpers'
import { noStoreJsonHeaders, errorJson, coreErrorResponse } from '@/lib/bff/response'
import { isValidRequestId } from '@/lib/auth/handoff'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!isValidRequestId(id)) {
    return errorJson(400, 'invalid_request')
  }
  if (hasNextParam(request)) {
    return errorJson(400, 'next_not_allowed')
  }
  const handoff = readHandoffHeader(request)
  if (!handoff) {
    return errorJson(401, 'missing_handoff')
  }
  try {
    const status = await getCoreClient().getRequestStatus(id, handoff)
    return NextResponse.json(status, { headers: noStoreJsonHeaders() })
  } catch (err) {
    return coreErrorResponse(err)
  }
}
