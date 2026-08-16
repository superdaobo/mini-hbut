/**
 * BFF：POST /api/v1/admin/apps/[id]/revoke —— 永久撤销（终态不可逆，重新接入需新 Client）。
 */
import type { NextRequest } from 'next/server'
import { handleRuntimeAction } from '../../../_runtime'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handleRuntimeAction(request, id, 'revoke')
}
