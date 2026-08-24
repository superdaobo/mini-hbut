/**
 * API 密钥页：/keys（server page + 登录守卫，#688）。
 * 未登录 → 302 /login（fail closed，与 /apps 一致）。
 */
import { requireDeveloperSession } from '@/lib/auth-session/guard'
import { ApiKeys } from '../_components/api-keys'

export const dynamic = 'force-dynamic'

export default async function DeveloperKeysPage() {
  await requireDeveloperSession()
  return (
    <div>
      <div className="dev-page-head">
        <h1 className="dev-page-title">API 密钥</h1>
      </div>
      <ApiKeys />
    </div>
  )
}
