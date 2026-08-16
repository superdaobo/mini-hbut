/**
 * BFF：GET/POST /api/v1/developer/apps
 *  - GET：应用列表（Dashboard 卡片）；
 *  - POST：创建应用（先落 Draft；client_secret 只在此响应返回一次）。
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
import { sanitizeCreateAppInput } from '@/lib/developer/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  try {
    const apps = await getDeveloperApi().listApps(session.sub)
    return jsonOk({ apps })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorJson(400, 'invalid_request')
  }
  const sanitized = sanitizeCreateAppInput(raw)
  if (!sanitized.ok) {
    return errorJson(400, 'invalid_request')
  }
  try {
    const result = await getDeveloperApi().createApp(session.sub, sanitized.value)
    // 201；client_secret 只出现这一次
    return jsonOk(result, { status: 201 })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
