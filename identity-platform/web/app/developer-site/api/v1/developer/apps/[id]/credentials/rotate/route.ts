/**
 * BFF：POST /api/v1/developer/apps/[id]/credentials/rotate
 * P4-4（mini-hbut#1219）退役：client secret 轮换写能力移除 → 410 Gone
 * （固定响应体，绝不返回任何凭据；凭据管理随自建注册表一并退役）。
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
