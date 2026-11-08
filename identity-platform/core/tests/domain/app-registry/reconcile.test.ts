/**
 * T12 对账与幂等键测试（§4.1 / §4.2）：
 * - 对账能发现：产物缺失、Casdoor 被手工改动、越权策略、目录 review_version 过期；
 * - 渲染成人可读清单；
 * - 幂等键 7 类齐备；
 * - 提交重放判定：同内容返回既有 pending，内容变更则 supersede。
 */

import { describe, expect, it } from 'vitest'

import {
  IDEMPOTENCY_KEYS,
  catalogIdempotencyKey,
  decideSubmissionReplay,
  failedArtifacts,
  policyIdempotencyKey,
  receiptIdempotencyKey,
  reviewIdempotencyKey,
  successfulArtifacts,
} from '../../../src/domain/app-registry/idempotency.js'
import { formatReconciliation, reconcileAll, reconcileReview } from '../../../src/domain/app-registry/reconcile.js'
import type { ActualState } from '../../../src/domain/app-registry/provisioning.js'
import { emptyActual, makeReview } from './fixtures.js'

function actualFor(review = makeReview({ status: 'active' })): ActualState {
  return {
    casdoor: {
      application_name: review.casdoor.application_name,
      client_id: review.casdoor.client_id,
      expire_in_hours: review.casdoor.expire_in_hours,
      refresh_expire_in_hours: review.casdoor.refresh_expire_in_hours,
      token_format: review.casdoor.token_format,
      token_fields: [...review.casdoor.token_fields],
    },
    policy: [
      { domain: 'cloud_sync', operation: 'read' },
      { domain: 'cloud_sync', operation: 'write' },
    ],
    catalog: {
      app_id: review.app_id,
      name: 's',
      icon: 'i',
      summary: 's',
      kind: 'internal',
      form: 'embedded',
      entry: 'demo',
      compat: review.compat,
      data_domains: review.data_domains,
      status: 'active',
      review_version: `${review.review_id}@v${review.version}`,
    },
    module: null,
  }
}

describe('T12 对账', () => {
  it('完全一致 → inSync，无偏差', () => {
    const review = makeReview({ status: 'active' })
    expect(reconcileReview(review, actualFor(review))).toMatchObject({ inSync: true, drifts: [] })
  })

  it('产物缺失也算偏差（人工删掉不会静默）', () => {
    const review = makeReview({ status: 'active' })
    const result = reconcileReview(review, emptyActual())
    expect(result.inSync).toBe(false)
    expect(result.drifts.map((d) => d.artifact)).toContain('casdoor')
    expect(result.drifts.map((d) => d.artifact)).toContain('policy')
    expect(result.drifts.map((d) => d.artifact)).toContain('catalog')
  })

  it('Casdoor 被手工改动 → 逐字段报出', () => {
    const review = makeReview({ status: 'active' })
    const actual = actualFor(review)
    actual.casdoor = { ...actual.casdoor!, expire_in_hours: 1, token_fields: [] }
    const result = reconcileReview(review, actual)
    const fields = result.drifts.map((d) => d.field)
    expect(fields).toContain('expire_in_hours')
    expect(fields).toContain('token_fields')
  })

  it('越权授权（实际存在但未申请）也要报出', () => {
    const review = makeReview({ status: 'active' })
    const actual = actualFor(review)
    actual.policy = [...actual.policy!, { domain: 'grades', operation: 'read' }]
    const result = reconcileReview(review, actual)
    const drift = result.drifts.find((d) => d.field === 'grades:read')
    expect(drift?.actual).toContain('越权')
  })

  it('目录 review_version 过期 / entry 不一致 / external 不该有条目', () => {
    const review = makeReview({ status: 'active' })
    const actual = actualFor(review)
    actual.catalog = { ...actual.catalog!, review_version: 'old@v0', entry: 'other' }
    const result = reconcileReview(review, actual)
    expect(result.drifts.map((d) => d.field)).toContain('review_version')
    expect(result.drifts.map((d) => d.field)).toContain('entry')

    const external = makeReview({ form: 'external', entry: '', status: 'active' })
    const externalActual = { ...actualFor(external), catalog: actual.catalog! }
    expect(reconcileReview(external, externalActual).drifts.map((d) => d.artifact)).toContain('catalog')
  })

  it('批量对账 + 人类可读渲染', () => {
    const ok = makeReview({ status: 'active' })
    const broken = makeReview({ status: 'active', app_id: 'broken-app' })
    const results = reconcileAll([ok, broken], (appId) => (appId === 'broken-app' ? emptyActual() : actualFor(ok)))
    expect(results).toHaveLength(2)
    const text = formatReconciliation(results)
    expect(text).toContain('✔')
    expect(text).toContain('✖ broken-app')
    expect(text).toContain('期望')
  })
})

describe('T12 幂等键与提交重放', () => {
  it('7 类幂等键齐备', () => {
    expect(Object.keys(IDEMPOTENCY_KEYS).sort()).toEqual(
      ['application', 'catalog', 'policy', 'receipt', 'review', 'secret', 'student'].sort(),
    )
  })

  it('键形态稳定（含内容寻址与主键语义）', () => {
    const review = makeReview()
    expect(reviewIdempotencyKey(review)).toBe(`demo-app@${review.revision}`)
    expect(catalogIdempotencyKey(review)).toBe('demo-app')
    expect(policyIdempotencyKey({ app_id: 'a', domain: 'd', operation: 'read' })).toBe('a|d|read')
    expect(receiptIdempotencyKey('r1', 'catalog')).toBe('r1|catalog')
  })

  it('提交重放：同内容返回既有 pending；内容变更 → supersede', () => {
    const review = makeReview()
    expect(decideSubmissionReplay(null, review)).toEqual({ kind: 'create', reason: 'no_existing_review' })
    expect(decideSubmissionReplay({ review_id: 'r1', revision: review.revision }, review)).toEqual({
      kind: 'replay',
      reviewId: 'r1',
      reason: 'same_content_pending',
    })
    expect(decideSubmissionReplay({ review_id: 'r1', revision: 'deadbeef' }, review)).toEqual({
      kind: 'supersede',
      reviewId: 'r1',
      reason: 'content_changed',
    })
  })

  it('回执统计：成功/失败产物可分别取出', () => {
    const receipts = {
      casdoor: { at: 't', result: 'ok' as const },
      policy: { at: 't', result: 'failed' as const, detail: 'x' },
      catalog: { at: 't', result: 'ok' as const },
    }
    expect(successfulArtifacts(receipts)).toEqual(['casdoor', 'catalog'])
    expect(failedArtifacts(receipts)).toEqual(['policy'])
  })
})
