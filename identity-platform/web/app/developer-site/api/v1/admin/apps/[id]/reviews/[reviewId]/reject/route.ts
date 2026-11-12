/**
 * BFF：POST /api/v1/admin/apps/[id]/reviews/[reviewId]/reject
 * P4-4（mini-hbut#1219）退役：自建注册表/审核不再是权威源 → 410 Gone
 * （固定响应体；驳回改由清单仓库 manifest/apps.json + PR 审核）。
 * 会话/CSRF 守卫（guardAdminMutation）仍先于 410（401/403 优先）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { registryRetiredResponse } from '@/lib/developer-api/bff'
import { guardAdminMutation } from '@/lib/admin/bff'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = guardAdminMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  // P4-4 退役：固定 410 响应，先于任何 Core 调用
  return registryRetiredResponse()
}
