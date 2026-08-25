/**
 * BFF：GET/POST /api/v1/developer/keys（#688 账户级 API Key）
 *  - GET：本账户 Key 列表（无明文/无 hash）；
 *  - POST：签发新 Key（响应中的整串明文只出现这一次）。
 */

import type { NextRequest } from 'next/server'
import { assertTurnstileFromRequest } from '@/lib/turnstile-server'
import { NextResponse } from 'next/server'
import { getDeveloperKeysApi } from '@/lib/developer-api/account-client'
import {
  developerErrorResponse,
  errorJson,
  guardMutation,
  noStoreJsonHeaders,
  jsonOk,
  requireSession,
} from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  try {
    const keys = await getDeveloperKeysApi().listKeys(session.sub)
    return jsonOk({ keys })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }

  // #708 人机验证：敏感写动作必须通过 Turnstile 核验（未配置钥匙时跳过）
  const turnstile = await assertTurnstileFromRequest(request)
  if (!turnstile.ok) {
    return NextResponse.json(
      { error: 'turnstile_failed', message: turnstile.message },
      { status: 400, headers: noStoreJsonHeaders() },
    )
  }
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return errorJson(400, 'invalid_request')
  }
  const name =
    typeof raw === 'object' && raw !== null && typeof (raw as { name?: unknown }).name === 'string'
      ? (raw as { name: string }).name.trim().slice(0, 64)
      : ''
  if (!name) {
    return errorJson(400, 'invalid_request')
  }
  try {
    const result = await getDeveloperKeysApi().createKey(session.sub, name)
    // 201；key 明文只出现这一次，之后无法找回
    return jsonOk(result, { status: 201 })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
