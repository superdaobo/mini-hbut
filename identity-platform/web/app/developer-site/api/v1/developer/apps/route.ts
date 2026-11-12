/**
 * BFF：GET/POST /api/v1/developer/apps
 *  - GET：应用列表（只读目录，保留）；
 *  - POST：创建应用 —— P4-4（mini-hbut#1219）退役：410 Gone。
 *    自建注册表不再是权威源；应用接入改由清单仓库 manifest/apps.json + PR 审核。
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

export async function GET(request: NextRequest) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  try {
    const apps = await getDeveloperApi().listApps(session.sub)
    return jsonOk({ apps })
  } catch (err) {
    return developerErrorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  const session = guardMutation(request)
  if (session instanceof NextResponse) {
    // 会话/CSRF 守卫失败（401/403）优先于 410
    return session
  }
  // P4-4 退役：不再创建应用；固定 410 响应，先于任何 store 调用
  return registryRetiredResponse()
}
