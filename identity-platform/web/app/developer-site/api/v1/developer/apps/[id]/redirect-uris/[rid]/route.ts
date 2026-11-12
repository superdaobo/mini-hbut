/**
 * BFF：DELETE /api/v1/developer/apps/[id]/redirect-uris/[rid]
 * P4-4（mini-hbut#1219）退役：删除 redirect URI 的写能力移除 → 410 Gone
 * （固定响应体；清单仓库 manifest/apps.json + PR 审核为权威源）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { guardMutation, registryRetiredResponse } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  // P4-4 退役：固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}
