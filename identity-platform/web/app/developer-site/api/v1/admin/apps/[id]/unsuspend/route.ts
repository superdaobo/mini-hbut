/**
 * BFF：POST /api/v1/admin/apps/[id]/unsuspend —— 恢复（仅 suspended → active）。
 */
import type { NextRequest } from 'next/server'
import { handleRuntimeAction } from '../../../_runtime'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handleRuntimeAction(request, id, 'unsuspend')
}
