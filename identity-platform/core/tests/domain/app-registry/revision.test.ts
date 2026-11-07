/**
 * T12 内容寻址 revision 测试：
 * - 确定性：同内容 → 同摘要（含数组顺序无关）；
 * - 敏感字段任一变化 → 摘要变化（TOCTOU 能发现改动）；
 * - 流程/运行时字段（status/reviewer/decision/receipts…）**不**参与摘要；
 * - 形状：hex64。
 */

import { describe, expect, it } from 'vitest'

import {
  REVISION_EXCLUDED_FIELDS,
  computeReviewRevision,
  isRevisionShaped,
  revisionMatches,
} from '../../../src/domain/app-registry/revision.js'
import { baseReviewInput, makeReview } from './fixtures.js'

describe('T12 revision 内容寻址', () => {
  it('同内容同顺序 → 同摘要，且是 hex64', () => {
    const first = computeReviewRevision(baseReviewInput())
    const second = computeReviewRevision(baseReviewInput())
    expect(first).toBe(second)
    expect(isRevisionShaped(first)).toBe(true)
    expect(first).toHaveLength(64)
  })

  it('数组顺序不影响摘要（否则同内容会被判成两次改动）', () => {
    const a = baseReviewInput()
    const b = {
      ...baseReviewInput(),
      allowed_groups: [...a.allowed_groups].reverse(),
      redirect_uris: [...a.redirect_uris].reverse(),
      data_domains: [{ ...a.data_domains[0]!, operations: [...a.data_domains[0]!.operations].reverse() }],
      compat: { ...a.compat, platforms: [...a.compat.platforms].reverse() },
      casdoor: { ...a.casdoor, token_fields: [...a.casdoor.token_fields].reverse() },
    }
    expect(computeReviewRevision(b)).toBe(computeReviewRevision(a))
  })

  it('权限语义字段任一变化 → 摘要变化', () => {
    const base = computeReviewRevision(baseReviewInput())
    const variants = [
      { ...baseReviewInput(), app_id: 'other-app' },
      { ...baseReviewInput(), entry: 'other' },
      { ...baseReviewInput(), allowed_groups: ['students', 'teachers'] },
      { ...baseReviewInput(), allowed_groups: [] },
      {
        ...baseReviewInput(),
        data_domains: [{ domain: 'forum', operations: ['read'], purpose: '浏览' }],
      },
      {
        ...baseReviewInput(),
        data_domains: [{ domain: 'cloud_sync', operations: ['read'], purpose: '同步学习进度' }],
      },
      { ...baseReviewInput(), compat: { ...baseReviewInput().compat, min_host: '1.5.0' } },
      { ...baseReviewInput(), compat: { ...baseReviewInput().compat, store_policy: 'disabled' as const } },
      {
        ...baseReviewInput(),
        casdoor: { ...baseReviewInput().casdoor, refresh_expire_in_hours: 24 },
      },
      { ...baseReviewInput(), owner: 'dev-bob' },
      {
        ...baseReviewInput(),
        module: {
          manifest_url: 'https://cdn.example/m.json',
          artifact_url: 'https://cdn.example/a.zip',
          publisher_key_id: 'key-1',
          release_seq: 3,
        },
      },
    ]
    for (const variant of variants) {
      expect(computeReviewRevision(variant)).not.toBe(base)
    }
  })

  it('流程/运行时字段不参与摘要', () => {
    // 这些字段变化不得改变 revision，否则「批准」动作本身会改内容摘要 → TOCTOU 永远失败
    const review = makeReview({ status: 'approved', reviewer: 'admin-1', decision: 'approved' })
    const sameContent = makeReview({ status: 'active', reviewer: 'admin-2', decision: 'rejected' })
    expect(review.revision).toBe(sameContent.revision)
    expect(REVISION_EXCLUDED_FIELDS).toContain('status')
    expect(REVISION_EXCLUDED_FIELDS).toContain('artifact_receipts')
  })

  it('revisionMatches 能发现内容被改动（TOCTOU）', () => {
    const review = makeReview()
    expect(revisionMatches(review, baseReviewInput())).toBe(true)
    expect(revisionMatches(review, { ...baseReviewInput(), allowed_groups: ['students', 'others'] })).toBe(false)
  })
})
