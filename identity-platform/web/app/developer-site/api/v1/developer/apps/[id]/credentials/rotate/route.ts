/**
 * BFF：POST /api/v1/developer/apps/[id]/credentials/rotate
 * 轮换 client secret（仅 web_confidential；新 secret 只在此响应返回一次；
 * audit 记录 rotate 动作，绝不记录 secret 值）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import { developerErrorResponse, errorJson, guardMutation, jsonOk } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  const { id } = await ctx.params
  try {
    const result = await getDeveloperApi().rotateSecret(session.sub, id)
    if (!result) {
      return errorJson(404, 'not_found')
    }
    // client_secret 明文只出现在这一次响应中
    return jsonOk({ app: result.app, client_secret: result.client_secret })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
