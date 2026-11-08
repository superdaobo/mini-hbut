/**
 * T12 provisioner：snapshot → plan → apply（§4.1 执行模型 + §5 失败语义）。
 *
 * 纪律：
 * - **只补缺**：现状与记录一致的产出一律 `skip`（幂等重跑无副作用）；
 * - **顺序固定** ①Casdoor → ②业务策略 → ③目录条目 → ④模块产物；
 * - **安全阀**：必需映射缺失（例如审核记录没给 Casdoor client_id、数据域不在 T11 全集内）
 *   时整轮停止并返回退出码 2 —— 不允许猜默认值继续；
 * - **部分失败不回滚已成功产物**，而是记录回执 + 留在 `approved`，重试前先对账。
 */

import { AppRegistryError, catalogStatusFor } from './lifecycle.js'
import { receiptIsSatisfied } from './idempotency.js'
import {
  buildCatalogEntry,
  catalogReviewVersion,
  type BuildCatalogOptions,
} from './catalog.js'
import type {
  ArtifactKind,
  ArtifactReceipts,
  CatalogEntry,
  CatalogPresentation,
  ReviewRecord,
} from './types.js'

/** 产出的执行顺序（不得更改：后一份依赖前一份的结果）。 */
export const ARTIFACT_ORDER: readonly ArtifactKind[] = ['casdoor', 'policy', 'catalog', 'module']

export type StepAction = 'create' | 'update' | 'skip' | 'blocked'

export interface ProvisionStep {
  artifact: ArtifactKind
  action: StepAction
  reason: string
  /** 该步要写入的目标值（供 apply 阶段使用；`skip` 时为空）。 */
  desired?: unknown
  /**
   * 该产物对当前记录是否适用。
   * `false` = 结构上不需要（例如非 remote 条目没有模块产物）→ skip 回执记 `not applicable`，
   * 与"已存在且一致"（`already in sync`）区分开，便于对账与故障定位。
   */
  applicable?: boolean
}

/** 现状快照（由调用方从 Casdoor/策略表/目录/发布记录读取）。 */
export interface ActualState {
  casdoor?: {
    application_name: string
    client_id: string
    expire_in_hours: number
    refresh_expire_in_hours: number
    token_format: string
    token_fields: string[]
  } | null
  policy?: { domain: string; operation: string }[] | null
  catalog?: CatalogEntry | null
  module?: { publisher_key_id: string; release_seq: number } | null
}

export interface ProvisionPlan {
  steps: ProvisionStep[]
  /** true = 整轮停止（安全阀触发）。 */
  stop: boolean
  /** 0 = 可继续；2 = 映射缺失整轮停止（沿用 account-sync 的安全阀语义）。 */
  exitCode: 0 | 2
  /** 安全阀原因（人类可读）。 */
  stopReason?: string
  /** 允许的数据域全集（来自 T11）；为空表示未配置 → 触发安全阀。 */
  allowedDomains?: readonly string[]
}

export interface PlanOptions {
  presentation: CatalogPresentation
  /** T11 数据域全集；未提供视为未配置 → 安全阀停止。 */
  allowedDomains?: readonly string[]
  catalogOptions?: BuildCatalogOptions
}

function pick<T>(...values: (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value
  }
  return null
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].map((v) => v.trim()).sort()
  const b = [...right].map((v) => v.trim()).sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** Casdoor 目标是否已一致（不一致则 update，一致则 skip）。 */
function casdoorInSync(review: ReviewRecord, actual: NonNullable<ActualState['casdoor']>): boolean {
  const target = review.casdoor
  return (
    actual.application_name === target.application_name &&
    actual.client_id === target.client_id &&
    actual.expire_in_hours === target.expire_in_hours &&
    actual.refresh_expire_in_hours === target.refresh_expire_in_hours &&
    actual.token_format === target.token_format &&
    sameList(actual.token_fields, target.token_fields)
  )
}

/**
 * 计算本轮 plan（纯函数，不写任何东西）。
 *
 * 前置：记录状态必须是 `approved`（或 `provisioned` 重跑）；其它状态直接拒绝。
 */
export function planProvisioning(
  review: ReviewRecord,
  actual: ActualState,
  options: PlanOptions,
): ProvisionPlan {
  if (review.status !== 'approved' && review.status !== 'provisioned') {
    throw new AppRegistryError(
      'INVALID_STATE',
      `只有 approved/provisioned 可 provision，当前 ${review.status}`,
    )
  }

  // ── 安全阀：必需映射缺失 → 整轮停止（退出码 2），不猜默认值 ──────────────
  const stopWith = (reason: string): ProvisionPlan => ({
    steps: [],
    stop: true,
    exitCode: 2,
    stopReason: reason,
    allowedDomains: options.allowedDomains,
  })

  if (!review.casdoor.client_id.trim()) {
    return stopWith('审核记录缺少 Casdoor client_id（T09 配方必需），整轮停止')
  }
  if (review.casdoor.expire_in_hours <= 0 || review.casdoor.refresh_expire_in_hours <= 0) {
    return stopWith('令牌 TTL 未显式设置（Casdoor 默认 0 会导致签发即过期），整轮停止')
  }
  if (!options.allowedDomains || options.allowedDomains.length === 0) {
    return stopWith('未取得数据域全集（T11 策略表），无法校验申请范围，整轮停止')
  }
  const unknown = review.data_domains
    .map((d) => d.domain)
    .filter((domain) => !options.allowedDomains!.includes(domain))
  if (unknown.length > 0) {
    return stopWith(`申请了未登记的数据域：${[...new Set(unknown)].join(', ')}，整轮停止`)
  }

  const steps: ProvisionStep[] = []

  // ① Casdoor 应用配置
  const casdoorActual = actual.casdoor ?? null
  if (!casdoorActual) {
    steps.push({
      artifact: 'casdoor',
      action: 'create',
      reason: 'Casdoor 应用不存在',
      desired: review.casdoor,
    })
  } else if (!casdoorInSync(review, casdoorActual)) {
    steps.push({
      artifact: 'casdoor',
      action: 'update',
      reason: 'Casdoor 配置与审核记录不一致',
      desired: review.casdoor,
    })
  } else {
    steps.push({ artifact: 'casdoor', action: 'skip', reason: 'Casdoor 配置已一致' })
  }

  // ② 业务策略（应用到数据域×操作）
  const desiredPolicy = review.data_domains.flatMap((domain) =>
    domain.operations.map((operation) => ({ domain: domain.domain, operation })),
  )
  const actualPolicy = actual.policy ?? []
  const missingPolicy = desiredPolicy.filter(
    (item) => !actualPolicy.some((a) => a.domain === item.domain && a.operation === item.operation),
  )
  if (missingPolicy.length > 0) {
    steps.push({
      artifact: 'policy',
      action: actualPolicy.length === 0 ? 'create' : 'update',
      reason: `缺少 ${missingPolicy.length} 条策略（${missingPolicy
        .map((p) => `${p.domain}:${p.operation}`)
        .join(', ')}）`,
      desired: desiredPolicy,
    })
  } else {
    steps.push({ artifact: 'policy', action: 'skip', reason: '业务策略已一致' })
  }

  // ③ 目录条目
  const desiredCatalog = buildCatalogEntry(review, options.presentation, options.catalogOptions)
  if (!desiredCatalog) {
    steps.push({
      artifact: 'catalog',
      action: 'skip',
      reason: '网页（external）形态不进模块目录',
    })
  } else {
    const actualCatalog = actual.catalog ?? null
    if (!actualCatalog) {
      steps.push({
        artifact: 'catalog',
        action: 'create',
        reason: '目录条目不存在',
        desired: desiredCatalog,
      })
    } else if (
      actualCatalog.review_version !== catalogReviewVersion(review) ||
      actualCatalog.status !== desiredCatalog.status ||
      actualCatalog.form !== desiredCatalog.form ||
      (actualCatalog.entry ?? '') !== (desiredCatalog.entry ?? '')
    ) {
      steps.push({
        artifact: 'catalog',
        action: 'update',
        reason: '目录条目与审核记录不一致',
        desired: desiredCatalog,
      })
    } else {
      steps.push({ artifact: 'catalog', action: 'skip', reason: '目录条目已一致' })
    }
  }

  // ④ 模块产物（仅 remote）
  if (!review.module) {
    steps.push({
      artifact: 'module',
      action: 'skip',
      reason: '非 remote 条目无需模块产物',
      applicable: false,
    })
  } else {
    const moduleActual = actual.module ?? null
    if (!moduleActual) {
      steps.push({
        artifact: 'module',
        action: 'create',
        reason: '模块产物未发布',
        desired: review.module,
      })
    } else if (
      moduleActual.publisher_key_id !== review.module.publisher_key_id ||
      moduleActual.release_seq !== review.module.release_seq
    ) {
      steps.push({
        artifact: 'module',
        action: 'update',
        reason: '模块产物与审核记录不一致',
        desired: review.module,
      })
    } else {
      steps.push({ artifact: 'module', action: 'skip', reason: '模块产物已一致' })
    }
  }

  return { steps, stop: false, exitCode: 0, allowedDomains: options.allowedDomains }
}

/** plan 是否需要真正写操作（全 skip = 幂等重跑，无副作用）。 */
export function planHasWrites(plan: ProvisionPlan): boolean {
  return plan.steps.some((step) => step.action === 'create' || step.action === 'update')
}

export interface ApplyResult {
  receipts: ArtifactReceipts
  failures: { artifact: ArtifactKind; error: string }[]
  /** 部分失败后应停留的状态：approved（未上架，无泄漏面）。 */
  keepStatus: 'approved' | 'provisioned'
}

/**
 * apply：按顺序执行 plan 里的写操作，累计回执。
 * **不回滚已成功的产物**；失败的记 `failed` + 原因，供对账与重试定位。
 */
export function applyPlan(
  review: ReviewRecord,
  plan: ProvisionPlan,
  write: (step: ProvisionStep) => { ok: true } | { ok: false; error: string },
  now: string,
): ApplyResult {
  const receipts: ArtifactReceipts = { ...review.artifact_receipts }
  const failures: { artifact: ArtifactKind; error: string }[] = []

  if (plan.stop) {
    return { receipts, failures, keepStatus: 'approved' }
  }

  for (const step of plan.steps) {
    if (step.action === 'skip') {
      if (!receiptIsSatisfied(receipts, step.artifact)) {
        receipts[step.artifact] = {
          at: now,
          result: 'ok',
          detail: step.applicable === false ? 'not applicable' : 'already in sync',
        }
      }
      continue
    }
    const outcome = write(step)
    if (outcome.ok) {
      receipts[step.artifact] = { at: now, result: 'ok' }
    } else {
      receipts[step.artifact] = { at: now, result: 'failed', detail: outcome.error }
      failures.push({ artifact: step.artifact, error: outcome.error })
    }
  }

  // 只有四份产物（含不适用的 skip）全部 ok 才算 provisioned
  const allOk = ARTIFACT_ORDER.every((kind) => receiptIsSatisfied(receipts, kind))
  return { receipts, failures, keepStatus: allOk ? 'provisioned' : 'approved' }
}

export { catalogStatusFor }
