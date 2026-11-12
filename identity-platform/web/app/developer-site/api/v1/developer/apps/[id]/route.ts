/**
 * BFF：GET/PATCH/DELETE /api/v1/developer/apps/[id]
 *  - GET：应用详情（只读，保留；secret 只有元数据，绝无明文）；
 *  - PATCH/DELETE：P4-4（mini-hbut#1219）退役 —— 自建注册表不再是权威源，
 *    应用内容变更一律 410 Gone；接入/变更改由清单仓库 manifest/apps.json + PR 审核。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import {
  developerErrorResponse,
  errorJson,
  guardMutation,
  jsonOk,
  registryRetiredResponse,
  requireSession,
} from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  const { id } = await ctx.params
  try {
    const app = await getDeveloperApi().getApp(session.sub, id)
    if (!app) {
      // 不存在/非本人所有统一 404（防枚举）
      return errorJson(404, 'not_found')
    }
    return jsonOk({ app })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function PATCH(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  // P4-4 退役：基本信息不再可改；固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}

export async function DELETE(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    return session
  }
  // P4-4 退役：不再支持物理删除；固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}
