/**
 * T12 对账（§4.2）：发现「实际产物 ≠ 审核记录」的人工偏差。
 *
 * 用途：provisioner 每轮 apply 前先对账；定时任务也用它找出被人手工改过的对象。
 * 只读、不修：输出差异清单，由人工或下一次 provision 收敛。
 */

import { catalogReviewVersion } from './catalog.js'
import type { ActualState } from './provisioning.js'
import type { ReviewRecord } from './types.js'

export interface DriftItem {
  artifact: 'casdoor' | 'policy' | 'catalog' | 'module'
  field: string
  expected: string
  actual: string
}

export interface ReconcileResult {
  app_id: string
  inSync: boolean
  drifts: DriftItem[]
}

function list(values: readonly string[]): string {
  return [...values].map((v) => v.trim()).sort().join(',')
}

/**
 * 单条审核记录的对账。
 * 注意：**产物缺失也算偏差**（期望有、实际没有），这样"人工删掉目录条目"不会静默。
 */
export function reconcileReview(review: ReviewRecord, actual: ActualState): ReconcileResult {
  const drifts: DriftItem[] = []

  // ① Casdoor
  const casdoor = actual.casdoor ?? null
  if (!casdoor) {
    drifts.push({ artifact: 'casdoor', field: 'application', expected: review.casdoor.application_name, actual: '<不存在>' })
  } else {
    const pairs: [string, string, string][] = [
      ['application_name', review.casdoor.application_name, casdoor.application_name],
      ['client_id', review.casdoor.client_id, casdoor.client_id],
      ['expire_in_hours', String(review.casdoor.expire_in_hours), String(casdoor.expire_in_hours)],
      ['refresh_expire_in_hours', String(review.casdoor.refresh_expire_in_hours), String(casdoor.refresh_expire_in_hours)],
      ['token_format', review.casdoor.token_format, casdoor.token_format],
      ['token_fields', list(review.casdoor.token_fields), list(casdoor.token_fields)],
    ]
    for (const [field, expected, value] of pairs) {
      if (expected !== value) {
        drifts.push({ artifact: 'casdoor', field, expected, actual: value })
      }
    }
  }

  // ② 业务策略
  const expectedPolicy = review.data_domains.flatMap((domain) =>
    domain.operations.map((operation) => ({ domain: domain.domain, operation })),
  )
  const actualPolicy = actual.policy ?? []
  for (const item of expectedPolicy) {
    if (!actualPolicy.some((a) => a.domain === item.domain && a.operation === item.operation)) {
      drifts.push({
        artifact: 'policy',
        field: `${item.domain}:${item.operation}`,
        expected: '已授权',
        actual: '缺失',
      })
    }
  }
  for (const item of actualPolicy) {
    if (!expectedPolicy.some((e) => e.domain === item.domain && e.operation === item.operation)) {
      drifts.push({
        artifact: 'policy',
        field: `${item.domain}:${item.operation}`,
        expected: '未申请',
        actual: '存在授权（越权）',
      })
    }
  }

  // ③ 目录条目
  const catalog = actual.catalog ?? null
  if (review.form === 'external') {
    if (catalog) {
      drifts.push({ artifact: 'catalog', field: 'entry', expected: '不应存在（external 不进目录）', actual: catalog.app_id })
    }
  } else if (!catalog) {
    drifts.push({ artifact: 'catalog', field: 'entry', expected: review.app_id, actual: '<不存在>' })
  } else {
    const expectedVersion = catalogReviewVersion(review)
    if (catalog.review_version !== expectedVersion) {
      drifts.push({ artifact: 'catalog', field: 'review_version', expected: expectedVersion, actual: catalog.review_version })
    }
    if (catalog.app_id !== review.app_id) {
      drifts.push({ artifact: 'catalog', field: 'app_id', expected: review.app_id, actual: catalog.app_id })
    }
    if ((catalog.entry ?? '') !== (review.entry ?? '')) {
      drifts.push({ artifact: 'catalog', field: 'entry', expected: review.entry ?? '', actual: catalog.entry ?? '' })
    }
    if (list(catalog.compat.platforms) !== list(review.compat.platforms)) {
      drifts.push({
        artifact: 'catalog',
        field: 'compat.platforms',
        expected: list(review.compat.platforms),
        actual: list(catalog.compat.platforms),
      })
    }
  }

  // ④ 模块产物
  if (review.module) {
    const module = actual.module ?? null
    if (!module) {
      drifts.push({ artifact: 'module', field: 'artifact', expected: review.module.artifact_url, actual: '<未发布>' })
    } else {
      if (module.publisher_key_id !== review.module.publisher_key_id) {
        drifts.push({
          artifact: 'module',
          field: 'publisher_key_id',
          expected: review.module.publisher_key_id,
          actual: module.publisher_key_id,
        })
      }
      if (module.release_seq !== review.module.release_seq) {
        drifts.push({
          artifact: 'module',
          field: 'release_seq',
          expected: String(review.module.release_seq),
          actual: String(module.release_seq),
        })
      }
    }
  }

  return { app_id: review.app_id, inSync: drifts.length === 0, drifts }
}

/** 批量对账（供定时任务：只输出有偏差的项）。 */
export function reconcileAll(
  reviews: readonly ReviewRecord[],
  actualByApp: (appId: string) => ActualState,
): ReconcileResult[] {
  return reviews.map((review) => reconcileReview(review, actualByApp(review.app_id)))
}

/** 把对账结果渲染成人类可读多行（运维直接贴进 issue / 告警）。 */
export function formatReconciliation(results: readonly ReconcileResult[]): string {
  const lines: string[] = []
  for (const result of results) {
    if (result.inSync) {
      lines.push(`✔ ${result.app_id}：一致`)
      continue
    }
    lines.push(`✖ ${result.app_id}：${result.drifts.length} 处偏差`)
    for (const drift of result.drifts) {
      lines.push(`   - [${drift.artifact}] ${drift.field}：期望 ${drift.expected} / 实际 ${drift.actual}`)
    }
  }
  return lines.join('\n')
}
