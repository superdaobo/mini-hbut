/**
 * 应用详情：/apps/[id]（server page + 登录守卫）。
 * 未登录 → 302 /login（fail closed）。
 */
import { requireDeveloperSession } from '@/lib/auth-session/guard'
import { AppDetail } from '../../_components/app-detail'

export const dynamic = 'force-dynamic'

export default async function DeveloperAppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireDeveloperSession()
  const { id } = await params
  if (!id) {
    return <div className="dev-error">缺少应用 ID</div>
  }
  return <AppDetail appId={id} />
}
