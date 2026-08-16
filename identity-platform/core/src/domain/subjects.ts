/**
 * Pairwise Subject 策略（#619）。
 *
 *   sub = base64url(HMAC-SHA256(PAIRWISE_KEY, sector_or_client_id || 0x00 || user_id))
 *
 * 要求（docs/issues/619.json）：
 * - 同一用户 + 同一 Client/sector 永远稳定；
 * - 不同 Client 默认得到不同 sub；
 * - 不能从 sub 反推出学号 / 内部 user id；
 * - PAIRWISE_KEY 缺失或为占位时 fail closed（抛错，绝不临时随机生成生产 key）。
 *
 * 密钥来源：环境变量 IDENTITY_PAIRWISE_SUBJECT_KEY（#618 已登记名称）。
 * 轮换策略：轮换即第三方全部 sub 变化（断联），属破坏性操作，
 * 需要 #626 统一制定迁移窗口，本模块只保证派生确定性。
 */
import { createHmac } from 'node:crypto'
import { PairwiseKeyNotConfiguredError } from './errors.js'
import { assertKeyMaterial } from '../security/hash.js'

export interface DerivePairwiseSubjectInput {
  /** IDENTITY_PAIRWISE_SUBJECT_KEY；未配置/占位 → fail closed */
  pairwiseKey: string | undefined
  /** sector identifier；V1 未开放 sector_identifier_uri 时传 client_id */
  sectorOrClientId: string
  /** 内部 user id（UUIDv7），绝不传学号 */
  userId: string
}

export function derivePairwiseSubject(input: DerivePairwiseSubjectInput): string {
  try {
    assertKeyMaterial(input.pairwiseKey, 'IDENTITY_PAIRWISE_SUBJECT_KEY')
  } catch {
    throw new PairwiseKeyNotConfiguredError()
  }
  // 0x00 分隔符防止拼接歧义（sector id / user id 都不能含 NUL）
  const material = `${input.sectorOrClientId}\u0000${input.userId}`
  return createHmac('sha256', input.pairwiseKey as string)
    .update(material, 'utf8')
    .digest('base64url')
}
