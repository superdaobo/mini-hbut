/**
 * BFF：GET/POST /api/v1/developer/apps/[id]/redirect-uris
 *  - GET：列表（含类型与校验状态）；
 *  - POST：新增（服务端重新校验；Pending 及之后自动重新进入审核）。
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
import { sanitizeRedirectUris } from '@/lib/developer/validation'

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

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  // 只接受单条 { uri, kind }
  if (typeof raw !== 'object' || raw === null) {
    return errorJson(400, 'invalid_request')
  }
  const rec = raw as Record<string, unknown>
  const sanitized = sanitizeRedirectUris([rec])
  if (!sanitized.ok) {
    return errorJson(400, 'invalid_request')
  }
  try {
    const app = await getDeveloperApi().addRedirectUri(session.sub, id, sanitized.value[0]!)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
