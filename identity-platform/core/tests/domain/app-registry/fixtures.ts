/**
 * T12 领域层测试夹具：构造审核记录 / 现状快照。
 * 全部为合成数据，不连数据库、不访问网络。
 */

import { computeReviewRevision } from '../../../src/domain/app-registry/revision.js'
import type { ActualState } from '../../../src/domain/app-registry/provisioning.js'
import type { ReviewRecord } from '../../../src/domain/app-registry/types.js'

export function baseReviewInput() {
  return {
    app_id: 'demo-app',
    form: 'embedded' as const,
    entry: 'demo',
    redirect_uris: [
      { uri: 'minihbut://identity/callback', kind: 'native_custom' as const },
      { uri: 'https://demo.example/callback', kind: 'web_https' as const },
    ],
    allowed_groups: ['students'],
    data_domains: [{ domain: 'cloud_sync', operations: ['read', 'write'], purpose: '同步学习进度' }],
    compat: { min_host: '1.4.0', platforms: ['windows', 'android'], store_policy: 'allowed' as const },
    module: null,
    casdoor: {
      application_name: 'demo-app',
      client_id: 'demo-client-id',
      expire_in_hours: 24,
      refresh_expire_in_hours: 168,
      token_format: 'JWT-Custom',
      token_fields: ['Properties.hbut_student_id'],
    },
    owner: 'dev-alice',
  }
}

const REVIEW_ID = '01920000-0000-7000-8000-000000000001'

/** 构造审核记录；`revision` 默认按内容计算（与生产同一函数），可用 overrides 覆盖以模拟过期。 */
export function makeReview(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  const input = { ...baseReviewInput(), ...overrides }
  return {
    review_id: REVIEW_ID,
    version: 1,
    submitted_by: 'dev-alice',
    submitted_at: '2026-11-08T00:00:00Z',
    reviewer: null,
    reviewed_at: null,
    decision: null,
    decision_reason: null,
    status: 'submitted',
    artifact_receipts: {},
    ...input,
    revision: overrides.revision ?? computeReviewRevision(input),
  }
}

export function emptyActual(): ActualState {
  return { casdoor: null, policy: [], catalog: null, module: null }
}

export const PRESENTATION = {
  name: '示例应用',
  icon: 'demo.png',
  summary: '用于测试',
  kind: 'internal' as const,
  order: 10,
}
