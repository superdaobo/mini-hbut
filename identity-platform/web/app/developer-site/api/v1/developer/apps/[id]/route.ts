/**
 * BFF：GET/PATCH/DELETE /api/v1/developer/apps/[id]
 *  - GET：应用详情（7 个 Tab 的数据源；secret 只有元数据，绝无明文）；
 *  - PATCH：更新基本信息（仅 draft/rejected；pending 及之后 409）；
 *  - DELETE：物理删除（仅 draft；其余走 revoke 策略）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import {
  developerErrorResponse,
  errorJson,
  guardMutation,
  jsonOk,
  requireSession,
} from '@/lib/developer-api/bff'
import type { UpdateAppInput } from '@/lib/developer/contract'
import { validateUpdateAppInput } from '@/lib/developer/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  const { id } = await ctx.params
  try {
    const app = await getDeveloperApi().getApp(session.sub, id)
    if (!app) {
      // 不存在/非本人所有统一 404（防枚举）
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  const { id } = await ctx.params
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
  // 只允许白名单字段；未知字段（含 developer_id/student_id 越权面）一律忽略
  const input: UpdateAppInput = {
    name: typeof rec.name === 'string' ? rec.name : undefined,
    description: typeof rec.description === 'string' ? rec.description : undefined,
    homepage_url: typeof rec.homepage_url === 'string' ? rec.homepage_url : undefined,
    privacy_policy_url: typeof rec.privacy_policy_url === 'string' ? rec.privacy_policy_url : undefined,
    contact: typeof rec.contact === 'string' ? rec.contact : undefined,
  }
  const check = validateUpdateAppInput(input)
  if (!check.ok) {
    return errorJson(400, 'invalid_request')
  }
  try {
    const app = await getDeveloperApi().updateApp(session.sub, id, input)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  const { id } = await ctx.params
  try {
    const result = await getDeveloperApi().deleteApp(session.sub, id)
    if (!result) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ deleted: true })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
