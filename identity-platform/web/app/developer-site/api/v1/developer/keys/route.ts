/**
 * BFF：GET/POST /api/v1/developer/keys（#688 账户级 API Key）
 * P4-4（mini-hbut#1219）退役：API Key 属自建注册表的写凭据，整体退役 →
 * 410 Gone（固定响应体；清单仓库 + PR 审核不依赖账户级 API Key）。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireSession, registryRetiredResponse } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // 会话守卫（401 优先于 410）；随后固定 410
  const session = requireSession(request)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return registryRetiredResponse()
}

export async function POST(request: NextRequest) {
  // 会话守卫（401 优先于 410）；随后固定 410
  const session = requireSession(request)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return registryRetiredResponse()
}
