/**
 * T12 幂等（§4.1）+ 对账（§4.2）。
 *
 * 幂等键共 7 类；本文件把它们固化成可测试的函数，而不是散落在各处的约定：
 * 学生账号 / 应用 / secret / 审核记录 / 目录条目 / 业务策略 / 产物回执。
 *
 * provisioner 执行模型（复用 `apps/account-sync/README.md:47-52` 的 snapshot→plan→apply）：
 * 每轮先取现状（snapshot）→ 与审核记录算差（plan）→ 只补缺（apply）；
 * **安全阀**：必需映射缺失时整轮停止（退出码 2），不允许"猜一个默认值继续"。
 */

import type { ArtifactKind, ArtifactReceipts, ReviewRecord } from './types.js'

export const IDEMPOTENCY_KEYS: Readonly<Record<string, string>> = {
  student: 'Name = hbut_<学号>（T10 建号幂等 upsert；T12 只消费，不新建账号）',
  application: 'application_name = app_id（先 get-application，存在则比对，不存在才 add）',
  secret: '轮换即生成新 key，旧 key 只置失效时间（重复轮换产生新 key 属预期）',
  review: '(app_id, revision)（同内容重复提交返回既有 pending）',
  catalog: 'app_id（按 id upsert，重复生成覆盖不追加）',
  policy: '(app_id, data_domain, operation)（T11 策略表主键）',
  receipt: '(review_id, artifact)（重写前先比对实际值，已一致则跳过）',
}

export function reviewIdempotencyKey(review: Pick<ReviewRecord, 'app_id' | 'revision'>): string {
  return `${review.app_id}@${review.revision}`
}

export function catalogIdempotencyKey(review: Pick<ReviewRecord, 'app_id'>): string {
  return review.app_id
}

export function policyIdempotencyKey(input: {
  app_id: string
  domain: string
  operation: string
}): string {
  return `${input.app_id}|${input.domain}|${input.operation}`
}

export function receiptIdempotencyKey(reviewId: string, artifact: ArtifactKind): string {
  return `${reviewId}|${artifact}`
}

/** 重复提交的判定结果。 */
export type SubmissionReplayDecision =
  | { kind: 'create'; reason: 'no_existing_review' }
  | { kind: 'replay'; reviewId: string; reason: 'same_content_pending' }
  | { kind: 'supersede'; reviewId: string; reason: 'content_changed' }

/**
 * 重复提交判定（§3.2 #1/#4 + §4.1 审核记录行）：
 * - 没有既有 pending → 新建；
 * - 存在同 `(app_id, revision)` 的 pending → **返回既有 pending**（幂等重放）；
 * - 存在同 app_id 但 revision 不同的 pending → 旧 review 置 `superseded`，新建。
 */
export function decideSubmissionReplay(
  existing: { review_id: string; revision: string } | null,
  candidate: Pick<ReviewRecord, 'revision'>,
): SubmissionReplayDecision {
  if (!existing) {
    return { kind: 'create', reason: 'no_existing_review' }
  }
  if (existing.revision === candidate.revision) {
    return { kind: 'replay', reviewId: existing.review_id, reason: 'same_content_pending' }
  }
  return { kind: 'supersede', reviewId: existing.review_id, reason: 'content_changed' }
}

/** 产物回执是否表示"该产物已落地且与记录一致"。 */
export function receiptIsSatisfied(receipts: ArtifactReceipts, artifact: ArtifactKind): boolean {
  const receipt = receipts[artifact]
  return Boolean(receipt && receipt.result === 'ok')
}

export function failedArtifacts(receipts: ArtifactReceipts): ArtifactKind[] {
  const kinds: ArtifactKind[] = ['casdoor', 'policy', 'catalog', 'module']
  return kinds.filter((kind) => receipts[kind]?.result === 'failed')
}

export function successfulArtifacts(receipts: ArtifactReceipts): ArtifactKind[] {
  const kinds: ArtifactKind[] = ['casdoor', 'policy', 'catalog', 'module']
  return kinds.filter((kind) => receipts[kind]?.result === 'ok')
}
