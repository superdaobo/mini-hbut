/**
 * Dashboard：/apps（server page + 登录守卫）。
 * 未登录 → 302 /login（fail closed，与 admin layout 一致）。
 * P4-4（mini-hbut#1219）：自建注册表退役，「创建应用」改为「接入申请 = 开 PR」。
 */
import { requireDeveloperSession } from '@/lib/auth-session/guard'
import { AppsList } from '../_components/apps-list'

export const dynamic = 'force-dynamic'

export default async function DeveloperAppsPage() {
  await requireDeveloperSession()
  return (
    <div>
      <div className="dev-page-head">
        <h1 className="dev-page-title">我的应用（只读目录）</h1>
        <a className="dev-btn dev-btn-primary" href="/apps/new">
          接入申请（开 PR）
        </a>
      </div>
      <AppsList />
    </div>
  )
}
