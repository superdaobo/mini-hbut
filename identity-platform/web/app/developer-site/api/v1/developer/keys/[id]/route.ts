/**
 * BFF：DELETE /api/v1/developer/keys/[id] —— 吊销 API Key（不可恢复）。
 * 非本人 / 不存在 → 404（Core 侧防枚举，不区分）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperKeysApi } from '@/lib/developer-api/account-client'
import { developerErrorResponse, guardMutation } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  const { id } = await ctx.params
  try {
    await getDeveloperKeysApi().revokeKey(session.sub, id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
