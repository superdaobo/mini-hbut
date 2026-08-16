/**
 * BFF：GET /api/v1/developer/me —— 当前开发者资料（owner 从会话推导）。
 * GET 幂等建档（首次登录自动创建开发者档案）；返回 csrf_token 供前端 mutation 回传。
 */

import type { NextRequest } from 'next/server'
import { getDeveloperApi } from '@/lib/developer-api/client'
import { errorJson, jsonOk, requireSession } from '@/lib/developer-api/bff'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = requireSession(request)
  if (!session) {
    return errorJson(401, 'unauthorized')
  }
  try {
    const developer = await getDeveloperApi().ensureDeveloper(session.sub, session.display_name)
    // csrf 值与会话内一致（双提交 cookie 同值），仅同源页面可见
    return jsonOk({ developer, csrf_token: session.csrf })
  } catch {
    return errorJson(502, 'internal')
  }
}
