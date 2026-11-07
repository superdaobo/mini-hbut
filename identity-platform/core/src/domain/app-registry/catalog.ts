/**
 * T12 → T07 目录条目生成（契约 `module-and-auth-contracts.md` §7）。
 *
 * 关键不变量：
 * - 只有 `status=active` 的条目可进用户可见目录（其余 `pending`/`disabled`）；
 * - `review_version` 与审核记录绑定：同一条目只能对应一个已审核版本；
 * - **不得静默隐藏**：不可用必须给出可理解原因（`unavailableReason`）；
 * - remote 条目缺 `publisher_key_id`/`release_seq` → 一律不可用（提示「模块未签名」），
 *   绝不为了兼容而运行未验证代码。
 */

import { catalogStatusFor } from './lifecycle.js'
import type {
  CatalogEntry,
  CatalogPresentation,
  CatalogStatus,
  ReviewRecord,
} from './types.js'

/** 目录条目里承载审核版本的标识：`<review_id>@v<version>`。 */
export function catalogReviewVersion(review: Pick<ReviewRecord, 'review_id' | 'version'>): string {
  return `${review.review_id}@v${review.version}`
}

export interface BuildCatalogOptions {
  /** 覆盖状态（例如 provisioner 主动先置 disabled 再上架）；默认由记录状态推导。 */
  status?: CatalogStatus
}

/**
 * 由审核记录 + 展示元数据生成目录条目（契约 §7 全字段）。
 * `form=external` 的网页应用**不进目录**（返回 null）——它不在模块宿主里呈现。
 */
export function buildCatalogEntry(
  review: ReviewRecord,
  presentation: CatalogPresentation,
  options: BuildCatalogOptions = {},
): CatalogEntry | null {
  if (review.form === 'external') {
    return null
  }
  const entry: CatalogEntry = {
    app_id: review.app_id,
    name: presentation.name,
    icon: presentation.icon,
    summary: presentation.summary,
    kind: presentation.kind,
    form: review.form,
    compat: review.compat,
    data_domains: review.data_domains,
    status: options.status ?? catalogStatusFor(review.status),
    review_version: catalogReviewVersion(review),
  }
  if (review.form === 'embedded' && review.entry) {
    entry.entry = review.entry
  }
  if (typeof presentation.order === 'number') {
    entry.order = presentation.order
  }
  if (review.module) {
    entry.module = {
      manifest_url: review.module.manifest_url,
      artifact_url: review.module.artifact_url,
      publisher_key_id: review.module.publisher_key_id,
      release_seq: review.module.release_seq,
    }
  }
  return entry
}

export interface EntryUsability {
  usable: boolean
  /** 不可用时的人类可读原因（契约要求"不得静默隐藏"）。 */
  reason?: string
}

/**
 * 装载规则（契约 §7）：状态、平台、宿主版本、remote 签名缺一不可。
 * 判定顺序固定，便于客户端稳定提示。
 */
export function evaluateEntryUsability(
  entry: CatalogEntry,
  context: { hostVersion: string; platform: string },
): EntryUsability {
  if (entry.status !== 'active') {
    return { usable: false, reason: entry.status === 'disabled' ? '应用已停用' : '应用尚未上架' }
  }
  if (!entry.compat.platforms.includes(context.platform)) {
    return { usable: false, reason: `当前平台（${context.platform}）不在支持范围` }
  }
  if (compareVersions(context.hostVersion, entry.compat.min_host) < 0) {
    return {
      usable: false,
      reason: `需要宿主 ${entry.compat.min_host} 或更高（当前 ${context.hostVersion}）`,
    }
  }
  if (entry.compat.store_policy === 'disabled') {
    return { usable: false, reason: '该应用在当前分发渠道不可用' }
  }
  if (entry.kind === 'remote') {
    const module = entry.module
    if (!module || !module.publisher_key_id || !module.release_seq) {
      return { usable: false, reason: '模块未签名（缺少发布公钥或发布序号），不予运行' }
    }
  }
  if (entry.form === 'embedded' && !entry.entry) {
    return { usable: false, reason: '缺少宿主入口（entry）' }
  }
  return { usable: true }
}

/** 语义化版本比较（只比较数字段，缺位按 0）。 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    String(value ?? '')
      .split('.')
      .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ''), 10))
      .map((n) => (Number.isFinite(n) ? n : 0))
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** 按 id upsert（目录幂等键 = app_id；重复生成覆盖不追加）。 */
export function upsertCatalogEntries(
  existing: readonly CatalogEntry[],
  generated: readonly CatalogEntry[],
): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>()
  for (const entry of existing) {
    byId.set(entry.app_id, entry)
  }
  for (const entry of generated) {
    byId.set(entry.app_id, entry)
  }
  return [...byId.values()]
}
