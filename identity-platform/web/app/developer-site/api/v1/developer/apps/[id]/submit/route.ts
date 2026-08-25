/**
 * BFF：POST /api/v1/developer/apps/[id]/submit —— 提交审核（draft/rejected → pending_review）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import { assertTurnstileFromRequest } from '@/lib/turnstile-server'
import { developerErrorResponse, errorJson, guardMutation, noStoreJsonHeaders, jsonOk } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  const { id } = await ctx.params
  try {
    const app = await getDeveloperApi().submitForReview(session.sub, id)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
