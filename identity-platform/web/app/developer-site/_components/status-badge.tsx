/**
 * 状态徽标：文字 + 图标 + 颜色三通道（不只靠颜色，issue #624 UI/UX）。
 * 同时用于应用状态与 scope 审核状态。
 */
import { appStatusClass, appStatusIcon, appStatusLabel } from '@/lib/developer/status'
import type { DeveloperAppStatus } from '@/lib/developer/contract'

export function StatusBadge({ status }: { status: DeveloperAppStatus }) {
  return (
    <span className={`dev-status ${appStatusClass(status)}`} role="status">
      <span aria-hidden="true">{appStatusIcon(status)}</span>
      {appStatusLabel(status)}
    </span>
  )
}

const SCOPE_STATUS_LABEL: Record<string, string> = {
  requested: '待批准',
  approved: '已批准',
  rejected: '已拒绝',
}

export function ScopeStatusBadge({ status }: { status: 'requested' | 'approved' | 'rejected' }) {
  const cls = status === 'approved' ? 'status-active' : status === 'rejected' ? 'status-rejected' : 'status-pending'
  const icon = status === 'approved' ? '✅' : status === 'rejected' ? '⛔' : '⏳'
  return (
    <span className={`dev-status ${cls}`} role="status">
      <span aria-hidden="true">{icon}</span>
      {SCOPE_STATUS_LABEL[status]}
    </span>
  )
}
