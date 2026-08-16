/**
 * BFF：POST /api/v1/developer/apps/[id]/revoke —— 撤销应用（终态，不可恢复）。
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
    const app = await getDeveloperApi().revokeApp(session.sub, id)
    if (!app) {
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}
