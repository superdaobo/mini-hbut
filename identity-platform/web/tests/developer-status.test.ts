/**
 * Client 生命周期状态机测试（issue #624 Application lifecycle / 状态迁移）。
 * 状态图（与 Core 对齐）：
 *   DRAFT → PENDING_REVIEW → APPROVED → ACTIVE
 *   PENDING_REVIEW → REJECTED；ACTIVE ↔ SUSPENDED；ACTIVE/SUSPENDED → REVOKED
 *   REJECTED → DRAFT（重新提交）
 */
import { describe, expect, it } from 'vitest'
import {
  APP_ALLOWED_TRANSITIONS,
  APP_STATUSES,
  appStatusClass,
  appStatusIcon,
  appStatusLabel,
  canSubmit,
  canTransition,
  DEVELOPER_DRIVEN_TRANSITIONS,
  isDeletable,
  isEditable,
  isRevocable,
  isTerminal,
  redirectChangeRequiresReview,
} from '../lib/developer/status'

describe('状态全集与中文标签', () => {
  it('包含全部 7 个状态且顺序即展示顺序', () => {
    expect(APP_STATUSES).toEqual([
      'draft',
      'pending_review',
      'approved',
      'active',
      'rejected',
      'suspended',
      'revoked',
    ])
  })

  it('每个状态都有中文标签与图标（不只靠颜色，UI 双通道）', () => {
    for (const s of APP_STATUSES) {
      expect(appStatusLabel(s).length).toBeGreaterThan(0)
      expect(appStatusIcon(s).length).toBeGreaterThan(0)
      expect(appStatusClass(s).startsWith('status-')).toBe(true)
    }
  })
})

describe('合法迁移表', () => {
  it('draft 只能 submit/rejected/revoked', () => {
    expect(APP_ALLOWED_TRANSITIONS.draft).toEqual(['pending_review', 'rejected', 'revoked'])
  })

  it('pending_review 只能 approved/rejected/revoked', () => {
    expect(APP_ALLOWED_TRANSITIONS.pending_review).toEqual(['approved', 'rejected', 'revoked'])
  })

  it('approved → active（审批完成与正式启用分离，issue #624 决策）', () => {
    expect(APP_ALLOWED_TRANSITIONS.approved).toContain('active')
    expect(canTransition('approved', 'active')).toBe(true)
  })

  it('active 可被 suspended 且可恢复；active/suspended 均可 revoked', () => {
    expect(canTransition('active', 'suspended')).toBe(true)
    expect(canTransition('suspended', 'active')).toBe(true)
    expect(canTransition('active', 'revoked')).toBe(true)
    expect(canTransition('suspended', 'revoked')).toBe(true)
  })

  it('rejected 与 revoked 为终态：无任何出边', () => {
    expect(APP_ALLOWED_TRANSITIONS.rejected).toEqual([])
    expect(APP_ALLOWED_TRANSITIONS.revoked).toEqual([])
  })

  it('非法迁移一律 false（DRAFT → ACTIVE 不允许跳级）', () => {
    expect(canTransition('draft', 'active')).toBe(false)
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('pending_review', 'suspended')).toBe(false)
    expect(canTransition('revoked', 'draft')).toBe(false)
    expect(canTransition('active', 'approved')).toBe(false)
  })
})

describe('开发者可发起的动作（其余由管理员/Core 驱动）', () => {
  it('只有 draft/rejected 可提交审核', () => {
    expect(canSubmit('draft')).toBe(true)
    expect(canSubmit('rejected')).toBe(true)
    expect(canSubmit('pending_review')).toBe(false)
    expect(canSubmit('approved')).toBe(false)
    expect(canSubmit('active')).toBe(false)
    expect(canSubmit('suspended')).toBe(false)
    expect(canSubmit('revoked')).toBe(false)
  })

  it('开发者驱动的迁移只有 draft/rejected → pending_review', () => {
    expect(DEVELOPER_DRIVEN_TRANSITIONS).toEqual({
      draft: ['pending_review'],
      rejected: ['pending_review'],
    })
  })

  it('仅 draft/rejected 可编辑基本信息', () => {
    expect(isEditable('draft')).toBe(true)
    expect(isEditable('rejected')).toBe(true)
    for (const s of ['pending_review', 'approved', 'active', 'suspended', 'revoked'] as const) {
      expect(isEditable(s), s).toBe(false)
    }
  })

  it('仅 draft 可物理删除；其余走 revoke', () => {
    expect(isDeletable('draft')).toBe(true)
    expect(isDeletable('rejected')).toBe(false)
    expect(isDeletable('active')).toBe(false)
  })

  it('非 revoked 均可撤销；revoked 是终态', () => {
    for (const s of APP_STATUSES) {
      expect(isRevocable(s)).toBe(s !== 'revoked')
      expect(isTerminal(s)).toBe(s === 'revoked')
    }
  })
})

describe('修改 redirect URI / scope 的重新审核规则', () => {
  it('pending_review 及之后：任何变更自动重新进入审核', () => {
    for (const s of ['pending_review', 'approved', 'active', 'suspended'] as const) {
      expect(redirectChangeRequiresReview(s), s).toBe(true)
    }
  })

  it('draft/rejected 修改不触发重新审核（本来就要重新提交）', () => {
    expect(redirectChangeRequiresReview('draft')).toBe(false)
    expect(redirectChangeRequiresReview('rejected')).toBe(false)
    expect(redirectChangeRequiresReview('revoked')).toBe(false)
  })
})
