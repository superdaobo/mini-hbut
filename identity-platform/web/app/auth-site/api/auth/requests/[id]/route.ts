/**
 * BFF：GET /api/auth/requests/[id] —— 请求详情（同域代理到 Core，见 lib/core-client）。
 *
 * 安全约定（issue #630）：
 *  - 必须带敏感 header x-identity-handoff，否则 401（只有 request id 不给请求详情）；
 *  - 不接受 next= 参数；回调只能由 Core/oidc-provider 决定；
 *  - 响应 Cache-Control: no-store；本路由不记录任何请求头/日志
 *    （未来接入日志必须先经 lib/security/redact 的 redactHandoff 脱敏）。
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
  // request id 格式校验：畸形输入直接拒绝（防注入/日志污染）
  if (!isValidRequestId(id)) {
    return errorJson(400, 'invalid_request')
  }
  // 不接受任意 next=：回调地址只能来自 Core
  if (hasNextParam(request)) {
    return errorJson(400, 'next_not_allowed')
  }
  const handoff = readHandoffHeader(request)
  if (!handoff) {
    return errorJson(401, 'missing_handoff')
  }
  try {
    const detail = await getCoreClient().getRequestDetail(id, handoff)
    return NextResponse.json(detail, { headers: noStoreJsonHeaders() })
  } catch (err) {
    return coreErrorResponse(err)
  }
}
