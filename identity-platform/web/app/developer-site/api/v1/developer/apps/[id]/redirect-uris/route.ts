/**
 * BFF：GET/POST /api/v1/developer/apps/[id]/redirect-uris
 *  - GET：列表（只读，保留；含类型与校验状态）；
 *  - POST：P4-4（mini-hbut#1219）退役 —— 410 Gone；
 *    redirect URI 变更改由清单仓库 manifest/apps.json + PR 审核。
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
    const app = await getDeveloperApi().getApp(session.sub, id)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ redirect_uris: app.redirect_uris })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  // P4-4 退役：不再新增 redirect URI；固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}
