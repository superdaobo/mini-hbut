/**
 * Client 生命周期状态机（纯函数，可单测）。
 *
 * 状态（与 core/src/domain/clients.ts 的 ApplicationStatus 对齐）：
 *
 *   DRAFT → PENDING_REVIEW → APPROVED → ACTIVE
 *   PENDING_REVIEW → REJECTED
 *   ACTIVE → SUSPENDED（SUSPENDED → ACTIVE 可恢复）
 *   ACTIVE / SUSPENDED → REVOKED（终态）
 *   REJECTED → DRAFT（开发者修改后重新提交，即 REJECTED → PENDING_REVIEW）
 *
 * APPROVED/ACTIVE 分离决策（issue #624）：默认保留两者。
 * 理由：APPROVED 表示管理员审核通过（reviewed_at 落定），ACTIVE 表示真正对外可用
 * （activated_at 落定），审批完成与正式启用分离，管理员可先批量审批再择机启用；
 * 且 ACTIVE 还承载 SUSPENDED 的恢复语义，若合并则「审批通过」与「启用」无法独立审计。
 * Core 侧 oidc-provider 只加载 status='active' 的 Client。
 */

import type { DeveloperAppStatus } from './contract'

/** 全部状态（顺序即展示顺序） */
export const APP_STATUSES: readonly DeveloperAppStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'active',
  'rejected',
  'suspended',
  'revoked',
]

/**
 * 合法迁移表（与 Core 的 CLIENT_ALLOWED_TRANSITIONS 一致；
 * rejected/revoked 为终态，不可恢复）。
 */
export const APP_ALLOWED_TRANSITIONS: Readonly<
  Record<DeveloperAppStatus, readonly DeveloperAppStatus[]>
> = {
  draft: ['pending_review', 'rejected', 'revoked'],
  pending_review: ['approved', 'rejected', 'revoked'],
  approved: ['active', 'revoked'],
  active: ['suspended', 'revoked'],
  suspended: ['active', 'revoked'],
  rejected: [],
  revoked: [],
}

/** 状态是否允许迁移到 to（开发者可发起的只有 submit/revoke，其余由管理员/Core 驱动） */
export function canTransition(from: DeveloperAppStatus, to: DeveloperAppStatus): boolean {
  return APP_ALLOWED_TRANSITIONS[from].includes(to)
}

/** 开发者可自行发起的迁移（其余迁移属于 #625 管理员审核流） */
export const DEVELOPER_DRIVEN_TRANSITIONS: Readonly<
  Partial<Record<DeveloperAppStatus, readonly DeveloperAppStatus[]>>
> = {
  draft: ['pending_review'],
  rejected: ['pending_review'],
}

/** 该状态下开发者是否可以发起提交审核 */
export function canSubmit(from: DeveloperAppStatus): boolean {
  return from === 'draft' || from === 'rejected'
}

/** 该状态下应用基本信息是否可编辑（draft/rejected 之外锁定） */
export function isEditable(status: DeveloperAppStatus): boolean {
  return status === 'draft' || status === 'rejected'
}

/** 该状态下是否可物理删除（仅 Draft；其余走 revoke，见 issue #624 DELETE 语义） */
export function isDeletable(status: DeveloperAppStatus): boolean {
  return status === 'draft'
}

/** 该状态下是否可撤销（revoke：非终态均可） */
export function isRevocable(status: DeveloperAppStatus): boolean {
  return status !== 'revoked'
}

/** 终态：revoked 后任何变更（含 rotate）都不允许 */
export function isTerminal(status: DeveloperAppStatus): boolean {
  return status === 'revoked'
}

/** 修改 redirect URI / scopes 是否需要重新进入审核（Pending 及之后一律需要） */
export function redirectChangeRequiresReview(status: DeveloperAppStatus): boolean {
  return (
    status === 'pending_review' ||
    status === 'approved' ||
    status === 'active' ||
    status === 'suspended'
  )
}

/** 状态中文标签（UI 同时使用文字 + 图标，不只靠颜色） */
export function appStatusLabel(status: DeveloperAppStatus): string {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'pending_review':
      return '待审核'
    case 'approved':
      return '已批准'
    case 'active':
      return '已启用'
    case 'rejected':
      return '已拒绝'
    case 'suspended':
      return '已暂停'
    case 'revoked':
      return '已撤销'
  }
}

/** 状态图标（文字符号，配合颜色双通道表达） */
export function appStatusIcon(status: DeveloperAppStatus): string {
  switch (status) {
    case 'draft':
      return '✏️'
    case 'pending_review':
      return '⏳'
    case 'approved':
      return '✅'
    case 'active':
      return '🟢'
    case 'rejected':
      return '⛔'
    case 'suspended':
      return '⏸️'
    case 'revoked':
      return '🚫'
  }
}

/** 状态对应的 CSS class（颜色只是辅助，文案/图标为主） */
export function appStatusClass(status: DeveloperAppStatus): string {
  switch (status) {
    case 'draft':
      return 'status-draft'
    case 'pending_review':
      return 'status-pending'
    case 'approved':
      return 'status-approved'
    case 'active':
      return 'status-active'
    case 'rejected':
      return 'status-rejected'
    case 'suspended':
      return 'status-suspended'
    case 'revoked':
      return 'status-revoked'
  }
}
