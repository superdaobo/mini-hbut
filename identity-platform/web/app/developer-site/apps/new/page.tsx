/**
 * 创建应用：/apps/new（server page + 登录守卫）。
 * 未登录 → 302 /login（fail closed）。
 */
import { requireDeveloperSession } from '@/lib/auth-session/guard'
import { AppForm } from '../../_components/app-form'

export const dynamic = 'force-dynamic'

export default async function DeveloperNewAppPage() {
  await requireDeveloperSession()
  return <AppForm />
}
