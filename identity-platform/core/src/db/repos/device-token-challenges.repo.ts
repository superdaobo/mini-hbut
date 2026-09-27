/**
 * device_token_challenges 仓储（#902 第一方设备换票）。
 *
 * 一次性语义（协议 §6.2.1 的既定范式，直接照搬）：
 * - 签发：只写 sha256(challenge) + device_id + expires_at；
 * - 消费：**单条条件 UPDATE** 即裁决 —— `WHERE challenge_hash = $1 AND device_id = $2
 *   AND consumed_at IS NULL AND expires_at > NOW()`，`rowCount === 1` 才继续。
 *   禁止「先 SELECT 判断再 UPDATE」（TOCTOU）：并发兑换同一 challenge 时
 *   只有一条 UPDATE 能命中，其余 rowCount=0 一律按失效处理。
 * - 所有失败形态（不存在 / 已消费 / 已过期 / 属于其它设备）对外返回同一个错误，
 *   不提供状态预言机（协议 §6.2.4 探测防护）。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'

export interface DeviceTokenChallengeRow extends QueryResultRow {
  id: string
  challenge_hash: string
  device_id: string
  expires_at: Date
  consumed_at: Date | null
  created_at: Date
}

export async function insertDeviceTokenChallenge(
  sql: SqlExecutor,
  challenge: {
    id: string
    challengeHash: string
    deviceId: string
    expiresAt: Date
  },
): Promise<void> {
  await sql.query(
    `INSERT INTO device_token_challenges (id, challenge_hash, device_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [challenge.id, challenge.challengeHash, challenge.deviceId, challenge.expiresAt],
  )
}

/**
 * 一次性消费 challenge（原子裁决）。
 * 返回 true 表示本次调用成功占用该 challenge；false 表示失效（不存在/已用/过期/非本设备）。
 */
export async function consumeDeviceTokenChallenge(
  sql: SqlExecutor,
  input: { challengeHash: string; deviceId: string },
): Promise<boolean> {
  const result = await sql.query(
    `UPDATE device_token_challenges
        SET consumed_at = NOW()
      WHERE challenge_hash = $1
        AND device_id = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()`,
    [input.challengeHash, input.deviceId],
  )
  return (result.rowCount ?? 0) === 1
}
