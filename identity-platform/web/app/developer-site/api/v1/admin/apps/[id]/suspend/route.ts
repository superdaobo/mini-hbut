/**
 * BFF：POST /api/v1/admin/apps/[id]/suspend —— 临时安全响应（identity_admin + step-up）。
 * 真实作用：provider 不再加载该 client，全部 grant/token 链撤销（Core 侧）。
 */
import type { NextRequest } from 'next/server'
import { handleRuntimeAction } from '../../../_runtime'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handleRuntimeAction(request, id, 'suspend')
}
