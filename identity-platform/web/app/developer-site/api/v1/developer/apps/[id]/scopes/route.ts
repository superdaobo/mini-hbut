/**
 * BFF：GET/PUT /api/v1/developer/apps/[id]/scopes
 *  - GET：scope 列表（只读，保留；含审核状态与理由）；
 *  - PUT：P4-4（mini-hbut#1219）退役 —— 数据域/scope 请求不再可提交，410 Gone；
 *    接入与数据域变更改由清单仓库 manifest/apps.json + PR 审核。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import {
  developerErrorResponse,
  errorJson,
  guardMutation,
  jsonOk,
  registryRetiredResponse,
  requireSession,
} from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  const { id } = await ctx.params
  try {
    const scopes = await getDeveloperApi().getScopes(session.sub, id)
    if (!scopes) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ scopes })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function PUT(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  // P4-4 退役：不再提交 scope 请求；固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}
