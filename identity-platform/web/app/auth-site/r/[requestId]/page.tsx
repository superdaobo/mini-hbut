/**
 * auth.* 授权接力主页面：/r/<request_id>（#630）。
 *
 * 职责：展示请求方应用/权限说明、唤起 Mini-HBUT、二维码占位、短轮询等待 App 处理结果。
 * 安全边界：
 *  - handoff 只存在于浏览器 location.hash（#h=<one-time-handoff>），服务端渲染 HTML 不包含它；
 *  - 本页没有任何密码表单，也没有允许/拒绝按钮（批准面只在 Mini-HBUT App 内）；
 *  - 页面 title 不包含姓名/学号等个人信息（静态标题）。
 */
import type { Metadata } from 'next'
import HandoffClient from './handoff-client'

export const metadata: Metadata = {
  title: '授权确认 - Mini-HBUT Identity',
}

export const dynamic = 'force-dynamic'

export default async function AuthRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params
  return <HandoffClient requestId={requestId} />
}
