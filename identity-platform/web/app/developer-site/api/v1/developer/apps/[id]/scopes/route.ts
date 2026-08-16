/**
 * BFF：GET/PUT /api/v1/developer/apps/[id]/scopes
 *  - GET：scope 列表（含审核状态与理由）；
 *  - PUT：整体替换 scope 请求（openid 必选；敏感 scope 需理由；
 *    Pending 及之后自动重新进入审核）。
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
import { sanitizeScopeRequests } from '@/lib/developer/validation'

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

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  const sanitized = sanitizeScopeRequests((raw as Record<string, unknown>).scopes)
  if (!sanitized.ok) {
    return errorJson(400, 'invalid_request')
  }
  try {
    const app = await getDeveloperApi().putScopes(session.sub, id, sanitized.value)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
