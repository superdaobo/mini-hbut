/**
 * BFF：DELETE /api/v1/developer/keys/[id]
 * P4-4（mini-hbut#1219）退役：API Key 吊销写能力移除 → 410 Gone
 * （固定响应体；不泄露 Key 是否存在）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireSession, registryRetiredResponse } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
  const session = requireSession(request)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // P4-4 退役：固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}
