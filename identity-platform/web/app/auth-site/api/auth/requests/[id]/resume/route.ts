/**
 * BFF：POST /api/auth/requests/[id]/resume —— 浏览器还在等待，请 Core 继续原 interaction。
 *
 * 安全约定（issue #630 Resume 安全边界）：
 *  - 幂等：Core 保证重复 resume 不产生第二份授权结果（已处理则返回 already_resumed）；
 *  - 不接受任意 next= 参数：本路由从不读取 URL query，回调地址只由
 *    Core 的 oidc-provider interactionFinished 决定（redirect_to 字段）；
 *  - 必须带敏感 header x-identity-handoff；Core 重新验证 request 已 APPROVED /
 *    handoff 合法未过期 / interaction uid 正确 / interaction 未 finished /
 *    client 仍 Active / scopes 与创建时快照一致；
 *  - 响应 Cache-Control: no-store；不记录任何请求头/日志。
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCoreClient } from '@/lib/core-client'
import { readHandoffHeader, hasNextParam } from '@/lib/bff/helpers'
import { noStoreJsonHeaders, errorJson, coreErrorResponse } from '@/lib/bff/response'
import { isValidRequestId } from '@/lib/auth/handoff'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!isValidRequestId(id)) {
    return errorJson(400, 'invalid_request')
  }
  // 不接受任意 next=：Web 绝不自行跳转第三方 URL
  if (hasNextParam(request)) {
    return errorJson(400, 'next_not_allowed')
  }
  const handoff = readHandoffHeader(request)
  if (!handoff) {
    return errorJson(401, 'missing_handoff')
  }
  try {
    const result = await getCoreClient().resumeRequest(id, handoff)
    return NextResponse.json(result, { headers: noStoreJsonHeaders() })
  } catch (err) {
    return coreErrorResponse(err)
  }
}
