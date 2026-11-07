/**
 * T12 审核生命周期状态机与守卫（§3.2 迁移表）。
 *
 * 每个守卫都是**纯函数**：输入记录 + 当前内容 + 操作者，返回 void 或抛 `AppRegistryError`。
 * 好处是可以在没有数据库的情况下穷举测试（本仓库 `tests/domain/app-registry/`）。
 *
 * 与旧状态机的关系（`src/domain/clients.ts:53-61`）：
 * - `submitted` ≈ 旧的 `pending_review`；
 * - 新增 `provisioned`：四产物已就绪但未上架（旧模型 approve 即 active，无法容纳 provision 失败）；
 * - **`rejected` 可回炉**：旧表把它列为终态，但旧 API 实际允许重新提交，
 *   T12 以「可回炉」为准（§3.2 #4）。
 */

import type { CatalogStatus, ReviewRecord, ReviewStatus } from './types.js'
import { computeReviewRevision, type RevisionInput } from './revision.js'

export class AppRegistryError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AppRegistryError'
    this.code = code
  }
}

/** 合法迁移表（§3.1 总图 + §3.2 迁移表的并集）。 */
export const REVIEW_TRANSITIONS: Readonly<Record<ReviewStatus, readonly ReviewStatus[]>> = {
  draft: ['submitted', 'revoked'],
  submitted: ['approved', 'rejected', 'revoked'],
  // 回炉：修复旧模型把 rejected 当终态的矛盾
  rejected: ['submitted', 'revoked'],
  approved: ['provisioned', 'revoked'],
  // provisioned → approved 是 §3.2 #10 的回滚路径
  provisioned: ['active', 'approved', 'revoked'],
  active: ['suspended', 'revoked'],
  suspended: ['active', 'revoked'],
  revoked: [],
}

export const TERMINAL_STATUSES: readonly ReviewStatus[] = ['revoked']

export function isTerminal(status: ReviewStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: ReviewStatus, to: ReviewStatus): void {
  if (!canTransition(from, to)) {
    throw new AppRegistryError('INVALID_TRANSITION', `不允许的状态迁移：${from} → ${to}`)
  }
}

/**
 * 可见性不变量（§3.2 末）：只有 `active` 的目录条目才是 `active`。
 * 其余状态一律 `pending`（仅管理员可见）；已停用/撤销/驳回 → `disabled`。
 */
export function catalogStatusFor(status: ReviewStatus): CatalogStatus {
  if (status === 'active') return 'active'
  if (status === 'suspended' || status === 'revoked' || status === 'rejected') return 'disabled'
  return 'pending'
}

/** 审核原因：1..2000 字符，trim 后不得为空（沿用 `reviews.ts` 的 assertReason 语义）。 */
export function assertReason(reason: string): string {
  const text = String(reason ?? '').trim()
  if (text.length === 0) {
    throw new AppRegistryError('INVALID_REASON', '必须提供可读原因')
  }
  if (text.length > 2000) {
    throw new AppRegistryError('INVALID_REASON', '原因过长（上限 2000 字符）')
  }
  return text
}

const URI_WILDCARD = /[*]/

/** 回调/入口白名单校验（§2.2：复用 clients.ts 的禁通配符规则 + 按 kind 的形态约束）。 */
export function assertRedirectUris(uris: readonly { uri: string; kind: string }[]): void {
  if (uris.length === 0) {
    throw new AppRegistryError('MISSING_FIELD', 'redirect_uris 不能为空')
  }
  for (const item of uris) {
    const uri = String(item.uri ?? '').trim()
    if (!uri) {
      throw new AppRegistryError('MISSING_FIELD', 'redirect_uris 含空 uri')
    }
    if (URI_WILDCARD.test(uri)) {
      throw new AppRegistryError('ILLEGAL_REDIRECT_URI', `回调地址不允许通配符：${uri}`)
    }
    if (item.kind === 'web_https' && !uri.startsWith('https://')) {
      throw new AppRegistryError('ILLEGAL_REDIRECT_URI', `web_https 必须是 https：${uri}`)
    }
    if (item.kind === 'native_custom' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) {
      throw new AppRegistryError('ILLEGAL_REDIRECT_URI', `native_custom 需要自定义 scheme：${uri}`)
    }
    if (item.kind === 'native_loopback' && !/^http:\/\/(127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(uri)) {
      throw new AppRegistryError('ILLEGAL_REDIRECT_URI', `native_loopback 必须是回环地址：${uri}`)
    }
  }
}

/** 提交前置（§3.2 #1）：必填齐 + remote 条目必须有可信产物 + release_seq 单调。 */
export function assertSubmittable(
  review: Pick<
    ReviewRecord,
    'form' | 'entry' | 'redirect_uris' | 'allowed_groups' | 'data_domains' | 'compat' | 'module'
  >,
  options: { previousReleaseSeq?: number } = {},
): void {
  if (review.form === 'embedded' && !String(review.entry ?? '').trim()) {
    throw new AppRegistryError('MISSING_FIELD', 'embedded 形态必须提供 entry')
  }
  if (review.form === 'external' && String(review.entry ?? '').trim()) {
    throw new AppRegistryError('MISSING_FIELD', 'external 形态不应提供 entry')
  }
  assertRedirectUris(review.redirect_uris)
  if (review.allowed_groups.length === 0) {
    throw new AppRegistryError('MISSING_FIELD', 'allowed_groups 不能为空（不允许"默认对全组织开放"）')
  }
  if (review.data_domains.length === 0) {
    throw new AppRegistryError('MISSING_FIELD', 'data_domains 不能为空（默认拒绝未列出的数据域）')
  }
  for (const domain of review.data_domains) {
    if (!domain.domain.trim() || domain.operations.length === 0) {
      throw new AppRegistryError('MISSING_FIELD', 'data_domains 的 domain/operations 不能为空')
    }
    if (!domain.purpose.trim()) {
      throw new AppRegistryError('MISSING_FIELD', 'data_domains 必须写清用途（purpose）')
    }
  }
  if (!String(review.compat.min_host ?? '').trim()) {
    throw new AppRegistryError('MISSING_FIELD', 'compat.min_host 不能为空')
  }
  if (review.compat.platforms.length === 0) {
    throw new AppRegistryError('MISSING_FIELD', 'compat.platforms 不能为空')
  }
  if (review.module) {
    const artifact = review.module
    if (!artifact.publisher_key_id.trim() || !artifact.manifest_url.trim() || !artifact.artifact_url.trim()) {
      throw new AppRegistryError('MISSING_FIELD', 'remote 条目必须提供可信模块产物（发布公钥/清单/产物）')
    }
    if (!Number.isInteger(artifact.release_seq) || artifact.release_seq <= 0) {
      throw new AppRegistryError('MISSING_FIELD', 'module.release_seq 必须是正整数')
    }
    const previous = options.previousReleaseSeq ?? 0
    if (artifact.release_seq <= previous) {
      throw new AppRegistryError(
        'RELEASE_SEQ_REGRESSION',
        `module.release_seq 必须递增（当前 ${artifact.release_seq} ≤ 既有 ${previous}）`,
      )
    }
  }
}

export interface ApprovalInput {
  review: Pick<ReviewRecord, 'revision' | 'owner' | 'status'>
  currentContent: RevisionInput
  reviewerId: string
  /** 敏感 scope/数据域是否要求近期再认证（step-up）。 */
  sensitive?: boolean
  stepUpVerifiedAt?: string | null
  stepUpWindowSeconds?: number
  now?: Date
}

/**
 * 批准守卫（§3.2 #2）：
 * - 状态必须是 `submitted`；
 * - `review.revision` 必须等于当前内容 revision（TOCTOU）；
 * - **禁止 self-review**（审核人 ≠ owner）；
 * - 敏感变更需要 step-up 且在窗口内。
 */
export function assertApprovalAllowed(input: ApprovalInput): void {
  if (input.review.status !== 'submitted') {
    throw new AppRegistryError('INVALID_TRANSITION', `只有 submitted 可批准，当前 ${input.review.status}`)
  }
  const current = computeReviewRevision(input.currentContent)
  if (current !== input.review.revision) {
    throw new AppRegistryError('REVISION_MISMATCH', '内容已变更，请重新提交后再审核')
  }
  if (String(input.reviewerId).trim() === String(input.review.owner).trim()) {
    throw new AppRegistryError('SELF_REVIEW_FORBIDDEN', '不允许审核自己提交的应用')
  }
  if (input.sensitive) {
    const window = input.stepUpWindowSeconds ?? 15 * 60
    const verifiedAt = input.stepUpVerifiedAt ? Date.parse(input.stepUpVerifiedAt) : Number.NaN
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(verifiedAt) || now - verifiedAt > window * 1000) {
      throw new AppRegistryError('STEP_UP_REQUIRED', '敏感权限需要近期再认证')
    }
  }
}

/** 驳回守卫（§3.2 #3）：原因必填、可读、有长度上限。 */
export function assertRejectionAllowed(input: {
  review: Pick<ReviewRecord, 'status'>
  reviewerId: string
  owner: string
  reason: string
}): string {
  if (input.review.status !== 'submitted') {
    throw new AppRegistryError('INVALID_TRANSITION', `只有 submitted 可驳回，当前 ${input.review.status}`)
  }
  if (String(input.reviewerId).trim() === String(input.owner).trim()) {
    throw new AppRegistryError('SELF_REVIEW_FORBIDDEN', '不允许审核自己提交的应用')
  }
  return assertReason(input.reason)
}

/**
 * 撤销守卫（§3.2 #9）：终态不可逆；开发者自我撤销只允许 draft/submitted。
 * 返回规范化原因。
 */
export function assertRevokeAllowed(input: {
  status: ReviewStatus
  actor: 'admin' | 'developer'
  reason: string
  sensitive?: boolean
  stepUpVerifiedAt?: string | null
  stepUpWindowSeconds?: number
  now?: Date
}): string {
  if (isTerminal(input.status)) {
    throw new AppRegistryError('ALREADY_TERMINAL', '该应用已撤销，不可重复撤销')
  }
  if (input.actor === 'developer' && input.status !== 'draft' && input.status !== 'submitted') {
    throw new AppRegistryError('FORBIDDEN', '开发者只能撤销 draft/submitted 状态的应用')
  }
  if (input.actor === 'admin' && input.sensitive) {
    const window = input.stepUpWindowSeconds ?? 15 * 60
    const verifiedAt = input.stepUpVerifiedAt ? Date.parse(input.stepUpVerifiedAt) : Number.NaN
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(verifiedAt) || now - verifiedAt > window * 1000) {
      throw new AppRegistryError('STEP_UP_REQUIRED', '高风险操作需要近期再认证')
    }
  }
  return assertReason(input.reason)
}

/** 停用/恢复守卫（§3.2 #7/#8）：管理员操作，原因必填。 */
export function assertSuspendAllowed(input: { status: ReviewStatus; reason: string }): string {
  if (input.status !== 'active') {
    throw new AppRegistryError('INVALID_TRANSITION', `只有 active 可停用，当前 ${input.status}`)
  }
  return assertReason(input.reason)
}

export function assertResumeAllowed(status: ReviewStatus): void {
  if (status !== 'suspended') {
    throw new AppRegistryError('INVALID_TRANSITION', `只有 suspended 可恢复，当前 ${status}`)
  }
}
