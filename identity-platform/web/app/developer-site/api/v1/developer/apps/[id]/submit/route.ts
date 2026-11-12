/**
 * BFF：POST /api/v1/developer/apps/[id]/submit
 * P4-4（mini-hbut#1219）退役：自建注册表审核流不再是权威源 → 410 Gone。
 * 应用接入（含审核）改由清单仓库 manifest/apps.json + PR 审核。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { guardMutation, registryRetiredResponse } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  // P4-4 退役：固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}
