/**
 * T12 内容寻址 revision（§2.2 / §4.1）。
 *
 * 沿用 `src/api/admin/queries.ts:115-130` 的机制（固定键序 JSON + sha256 hex），
 * 但把输入扩展到审核记录的全部审核字段，使「同内容 → 同 revision」在四个产物层面都成立。
 *
 * 确定性要求：
 * - 键序固定（显式列出字段，不用对象展开）；
 * - 数组排序（redirect_uris 按 kind+uri、allowed_groups/operations/platforms/token_fields 字典序、
 *   data_domains 按 domain），否则同内容不同顺序会算出不同 revision，导致 TOCTOU 误判；
 * - 可空字段统一收敛为 `null`，避免 `undefined` 与 `null` 产生两种摘要。
 */

import { createHash } from 'node:crypto'

import type { ReviewRecord, ReviewStatus } from './types.js'

/** revision 的输入：审核记录里**会影响权限语义或产物内容**的字段。 */
export type RevisionInput = Pick<
  ReviewRecord,
  | 'app_id'
  | 'form'
  | 'entry'
  | 'redirect_uris'
  | 'allowed_groups'
  | 'data_domains'
  | 'compat'
  | 'module'
  | 'casdoor'
  | 'owner'
>

function sorted(values: readonly string[]): string[] {
  return [...values].map((v) => v.trim()).filter((v) => v.length > 0).sort()
}

/**
 * 计算内容寻址 revision（hex64）。
 *
 * 注意：**不含** `status`/`reviewer`/`decision`/`artifact_receipts` —— 这些是流程与运行时字段，
 * 把它们算进 revision 会让「批准动作本身」改变内容摘要，从而破坏 TOCTOU 比对。
 */
export function computeReviewRevision(input: RevisionInput): string {
  const canonical = JSON.stringify({
    app_id: input.app_id,
    form: input.form,
    entry: input.entry ? input.entry : null,
    redirect_uris: [...input.redirect_uris]
      .map((r) => ({ uri: r.uri.trim(), kind: r.kind }))
      .sort((a, b) => (a.kind === b.kind ? a.uri.localeCompare(b.uri) : a.kind.localeCompare(b.kind))),
    allowed_groups: sorted(input.allowed_groups),
    data_domains: [...input.data_domains]
      .map((d) => ({
        domain: d.domain.trim(),
        operations: sorted(d.operations),
        purpose: d.purpose.trim(),
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain)),
    compat: {
      min_host: input.compat.min_host.trim(),
      platforms: sorted(input.compat.platforms),
      store_policy: input.compat.store_policy,
    },
    module: input.module
      ? {
          manifest_url: input.module.manifest_url.trim(),
          artifact_url: input.module.artifact_url.trim(),
          publisher_key_id: input.module.publisher_key_id.trim(),
          release_seq: input.module.release_seq,
        }
      : null,
    casdoor: {
      application_name: input.casdoor.application_name.trim(),
      client_id: input.casdoor.client_id.trim(),
      expire_in_hours: input.casdoor.expire_in_hours,
      refresh_expire_in_hours: input.casdoor.refresh_expire_in_hours,
      token_format: input.casdoor.token_format.trim(),
      token_fields: sorted(input.casdoor.token_fields),
    },
    owner: input.owner.trim(),
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

const HEX64 = /^[0-9a-f]{64}$/

export function isRevisionShaped(value: string): boolean {
  return HEX64.test(String(value ?? ''))
}

/** TOCTOU 判定：审核时的 revision 必须等于当前内容 revision（§3.2 #2）。 */
export function revisionMatches(review: Pick<ReviewRecord, 'revision'>, current: RevisionInput): boolean {
  return review.revision === computeReviewRevision(current)
}

/** 状态字段**不**参与 revision —— 有测试锁定这一点（防止有人后来"顺手"加进去）。 */
export const REVISION_EXCLUDED_FIELDS: readonly (keyof ReviewRecord | keyof ReviewStatus)[] = [
  'status',
  'reviewer',
  'reviewed_at',
  'decision',
  'decision_reason',
  'artifact_receipts',
  'submitted_by',
  'submitted_at',
  'review_id',
  'version',
]
