/**
 * Dashboard：/apps（server page + 登录守卫）。
 * 未登录 → 302 /login（fail closed，与 admin layout 一致）。
 */
import { requireDeveloperSession } from '@/lib/auth-session/guard'
import { AppsList } from '../_components/apps-list'

export const dynamic = 'force-dynamic'

export default async function DeveloperAppsPage() {
  await requireDeveloperSession()
  return (
    <div>
      <div className="dev-page-head">
        <h1 className="dev-page-title">我的应用</h1>
        <a className="dev-btn dev-btn-primary" href="/apps/new">
          创建应用
        </a>
      </div>
      <AppsList />
    </div>
  )
}
