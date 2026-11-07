/**
 * T12 状态机与守卫测试（§3.2）：
 * - 迁移表合法/非法；
 * - 可见性不变量（只有 active 进用户可见目录）；
 * - self-review 禁止、revision 不一致拒绝、敏感操作 step-up；
 * - rejected 可回炉（修复旧模型把 rejected 当终态的矛盾）；
 * - 撤销终态不可逆、开发者自我撤销范围收窄；
 * - 回调白名单禁通配符、按 kind 的形态约束；
 * - 提交前置必填与 release_seq 单调。
 */

import { describe, expect, it } from 'vitest'

import {
  AppRegistryError,
  assertApprovalAllowed,
  assertReason,
  assertRedirectUris,
  assertRejectionAllowed,
  assertResumeAllowed,
  assertRevokeAllowed,
  assertSubmittable,
  assertSuspendAllowed,
  assertTransition,
  canTransition,
  catalogStatusFor,
  isTerminal,
} from '../../../src/domain/app-registry/lifecycle.js'
import { baseReviewInput, makeReview } from './fixtures.js'

const NOW = new Date('2026-11-08T00:00:00Z')

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn()
    throw new Error('预期抛错但没有')
  } catch (error) {
    expect(error).toBeInstanceOf(AppRegistryError)
    expect((error as AppRegistryError).code).toBe(code)
  }
}

describe('T12 状态机', () => {
  it('合法迁移包含回炉与 provisioned 回滚', () => {
    expect(canTransition('draft', 'submitted')).toBe(true)
    expect(canTransition('submitted', 'approved')).toBe(true)
    expect(canTransition('rejected', 'submitted')).toBe(true) // 回炉
    expect(canTransition('approved', 'provisioned')).toBe(true)
    expect(canTransition('provisioned', 'approved')).toBe(true) // §3.2 #10
    expect(canTransition('provisioned', 'active')).toBe(true)
    expect(canTransition('active', 'suspended')).toBe(true)
    expect(canTransition('suspended', 'active')).toBe(true)
  })

  it('非法迁移被拒（终态不可出、不能跳过 provision）', () => {
    expectCode(() => assertTransition('revoked', 'active'), 'INVALID_TRANSITION')
    expectCode(() => assertTransition('draft', 'active'), 'INVALID_TRANSITION')
    expectCode(() => assertTransition('submitted', 'active'), 'INVALID_TRANSITION')
    expect(isTerminal('revoked')).toBe(true)
    expect(isTerminal('active')).toBe(false)
  })

  it('可见性不变量：只有 active 进用户可见目录', () => {
    expect(catalogStatusFor('active')).toBe('active')
    for (const status of ['draft', 'submitted', 'approved', 'provisioned'] as const) {
      expect(catalogStatusFor(status)).toBe('pending')
    }
    for (const status of ['suspended', 'revoked', 'rejected'] as const) {
      expect(catalogStatusFor(status)).toBe('disabled')
    }
  })

  it('原因必须有内容且不超长', () => {
    expect(assertReason('  信息过期  ')).toBe('信息过期')
    expectCode(() => assertReason('   '), 'INVALID_REASON')
    expectCode(() => assertReason('x'.repeat(2001)), 'INVALID_REASON')
  })
})

describe('T12 批准/驳回守卫', () => {
  it('批准：状态、revision、非 self-review', () => {
    const review = makeReview({ status: 'submitted', owner: 'dev-alice' })
    assertApprovalAllowed({
      review,
      currentContent: baseReviewInput(),
      reviewerId: 'admin-1',
      now: NOW,
    })

    expectCode(
      () =>
        assertApprovalAllowed({
          review,
          currentContent: { ...baseReviewInput(), allowed_groups: ['students', 'others'] },
          reviewerId: 'admin-1',
          now: NOW,
        }),
      'REVISION_MISMATCH',
    )

    expectCode(
      () =>
        assertApprovalAllowed({
          review,
          currentContent: baseReviewInput(),
          reviewerId: 'dev-alice', // 自己审自己
          now: NOW,
        }),
      'SELF_REVIEW_FORBIDDEN',
    )

    expectCode(
      () =>
        assertApprovalAllowed({
          review: makeReview({ status: 'draft' }),
          currentContent: baseReviewInput(),
          reviewerId: 'admin-1',
          now: NOW,
        }),
      'INVALID_TRANSITION',
    )
  })

  it('批准：敏感变更要求近期 step-up', () => {
    const review = makeReview({ status: 'submitted' })
    expectCode(
      () =>
        assertApprovalAllowed({
          review,
          currentContent: baseReviewInput(),
          reviewerId: 'admin-1',
          sensitive: true,
          stepUpVerifiedAt: null,
          now: NOW,
        }),
      'STEP_UP_REQUIRED',
    )
    assertApprovalAllowed({
      review,
      currentContent: baseReviewInput(),
      reviewerId: 'admin-1',
      sensitive: true,
      stepUpVerifiedAt: '2026-11-07T23:55:00Z',
      now: NOW,
    })
    expectCode(
      () =>
        assertApprovalAllowed({
          review,
          currentContent: baseReviewInput(),
          reviewerId: 'admin-1',
          sensitive: true,
          stepUpVerifiedAt: '2026-11-07T20:00:00Z', // 超过 15 分钟窗口
          now: NOW,
        }),
      'STEP_UP_REQUIRED',
    )
  })

  it('驳回：必须有可读原因且不能自审', () => {
    const review = makeReview({ status: 'submitted', owner: 'dev-alice' })
    expect(
      assertRejectionAllowed({ review, reviewerId: 'admin-1', owner: 'dev-alice', reason: ' 材料不全 ' }),
    ).toBe('材料不全')
    expectCode(
      () => assertRejectionAllowed({ review, reviewerId: 'admin-1', owner: 'dev-alice', reason: '  ' }),
      'INVALID_REASON',
    )
    expectCode(
      () => assertRejectionAllowed({ review, reviewerId: 'dev-alice', owner: 'dev-alice', reason: 'ok' }),
      'SELF_REVIEW_FORBIDDEN',
    )
  })
})

describe('T12 撤销/停用守卫', () => {
  it('撤销终态不可逆；开发者只能撤 draft/submitted', () => {
    expectCode(
      () => assertRevokeAllowed({ status: 'revoked', actor: 'admin', reason: 'x' }),
      'ALREADY_TERMINAL',
    )
    expectCode(
      () => assertRevokeAllowed({ status: 'active', actor: 'developer', reason: 'x' }),
      'FORBIDDEN',
    )
    expect(assertRevokeAllowed({ status: 'draft', actor: 'developer', reason: '改主意了' })).toBe('改主意了')
    expect(assertRevokeAllowed({ status: 'active', actor: 'admin', reason: '违规' })).toBe('违规')
  })

  it('管理员撤销高风险目标需要 step-up', () => {
    expectCode(
      () => assertRevokeAllowed({ status: 'active', actor: 'admin', reason: '违规', sensitive: true, now: NOW }),
      'STEP_UP_REQUIRED',
    )
  })

  it('停用/恢复状态约束与原因', () => {
    expect(assertSuspendAllowed({ status: 'active', reason: '临时下架' })).toBe('临时下架')
    expectCode(() => assertSuspendAllowed({ status: 'suspended', reason: 'x' }), 'INVALID_TRANSITION')
    assertResumeAllowed('suspended')
    expectCode(() => assertResumeAllowed('active'), 'INVALID_TRANSITION')
  })
})

describe('T12 回调白名单与提交前置', () => {
  it('禁通配符 + 按 kind 校验形态', () => {
    assertRedirectUris([
      { uri: 'minihbut://identity/callback', kind: 'native_custom' },
      { uri: 'http://127.0.0.1:4399/identity/callback', kind: 'native_loopback' },
      { uri: 'https://demo.example/callback', kind: 'web_https' },
    ])
    expectCode(() => assertRedirectUris([]), 'MISSING_FIELD')
    expectCode(
      () => assertRedirectUris([{ uri: 'https://*.example/cb', kind: 'web_https' }]),
      'ILLEGAL_REDIRECT_URI',
    )
    expectCode(
      () => assertRedirectUris([{ uri: 'http://demo.example/cb', kind: 'web_https' }]),
      'ILLEGAL_REDIRECT_URI',
    )
    expectCode(
      () => assertRedirectUris([{ uri: 'https://demo.example/cb', kind: 'native_loopback' }]),
      'ILLEGAL_REDIRECT_URI',
    )
  })

  it('提交前置：形态与入口匹配、数据域/群组必填、remote 必须有签名产物', () => {
    assertSubmittable(makeReview())
    expectCode(() => assertSubmittable(makeReview({ entry: '' })), 'MISSING_FIELD')
    expectCode(() => assertSubmittable(makeReview({ form: 'external', entry: 'x' })), 'MISSING_FIELD')
    expectCode(() => assertSubmittable(makeReview({ allowed_groups: [] })), 'MISSING_FIELD')
    expectCode(() => assertSubmittable(makeReview({ data_domains: [] })), 'MISSING_FIELD')
    expectCode(
      () =>
        assertSubmittable(
          makeReview({ data_domains: [{ domain: 'x', operations: ['read'], purpose: '  ' }] }),
        ),
      'MISSING_FIELD',
    )
    expectCode(() => assertSubmittable(makeReview({ compat: { min_host: '', platforms: [], store_policy: 'allowed' } })), 'MISSING_FIELD')
    // remote 缺签名 → 拒绝
    expectCode(
      () =>
        assertSubmittable(
          makeReview({
            module: { manifest_url: 'https://cdn/m.json', artifact_url: 'https://cdn/a.zip', publisher_key_id: '', release_seq: 1 },
          }),
        ),
      'MISSING_FIELD',
    )
  })

  it('release_seq 必须单调递增（防回放）', () => {
    const review = makeReview({
      module: {
        manifest_url: 'https://cdn/m.json',
        artifact_url: 'https://cdn/a.zip',
        publisher_key_id: 'key-1',
        release_seq: 5,
      },
    })
    assertSubmittable(review, { previousReleaseSeq: 4 })
    expectCode(() => assertSubmittable(review, { previousReleaseSeq: 5 }), 'RELEASE_SEQ_REGRESSION')
    expectCode(() => assertSubmittable(review, { previousReleaseSeq: 9 }), 'RELEASE_SEQ_REGRESSION')
  })
})
