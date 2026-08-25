/**
 * data_snapshots 仓储（#700 授权数据快照）。
 *
 * 不变式：
 * - (user_id, client_id) 唯一：同用户对同应用只保留最新一份快照，重传即覆盖；
 * - payload_enc 只存 AES-256-GCM 密文，本层不做加解密（见 security/snapshot-crypto.ts）；
 * - 「有效」= expires_at > NOW()：过期行对读取不可见，并由读取路径惰性清理；
 * - 应用吊销时由 domain/clients.ts 显式级联删除（DB 层另有 FK ON DELETE CASCADE 兜底）。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'
import { parseJsonb } from '../types.js'
import { newUuidV7 } from '../../domain/ids.js'

export interface DataSnapshotRow extends QueryResultRow {
  id: string
  user_id: string
  client_id: string
  scope_set: unknown
  payload_enc: string
  fetched_at: Date | null
  expires_at: Date
  created_at: Date
  updated_at: Date
}

export interface UpsertSnapshotInput {
  userId: string
  clientId: string
  scopeSet: string[]
  /** encryptSnapshot 输出的密文 */
  payloadEnc: string
  fetchedAt?: Date | null
  expiresAt: Date
}

/**
 * 写入/覆盖最新快照：(user_id, client_id) 冲突时原地更新密文与时效，
 * 保证「单用户单应用单行」，绝不产生历史堆积。
 */
export async function upsertLatest(
  sql: SqlExecutor,
  input: UpsertSnapshotInput,
): Promise<DataSnapshotRow> {
  const result = await sql.query<DataSnapshotRow>(
    `INSERT INTO data_snapshots (
       id, user_id, client_id, scope_set, payload_enc, fetched_at, expires_at
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     ON CONFLICT (user_id, client_id)
     DO UPDATE SET scope_set = EXCLUDED.scope_set,
                   payload_enc = EXCLUDED.payload_enc,
                   fetched_at = EXCLUDED.fetched_at,
                   expires_at = EXCLUDED.expires_at,
                   updated_at = NOW()
     RETURNING *`,
    [
      newUuidV7(),
      input.userId,
      input.clientId,
      JSON.stringify(input.scopeSet),
      input.payloadEnc,
      input.fetchedAt ?? null,
      input.expiresAt,
    ],
  )
  const row = result.rows[0]
  if (!row) {
    throw new Error('[data-snapshots.repo] upsertLatest 未返回行')
  }
  row.scope_set = parseJsonb<string[]>(row.scope_set)
  return row
}

/** 查询 (user_id, client_id) 最新且未过期的快照；过期/不存在返回 null */
export async function findActiveByUserAndClient(
  sql: SqlExecutor,
  userId: string,
  clientId: string,
): Promise<DataSnapshotRow | null> {
  const result = await sql.query<DataSnapshotRow>(
    `SELECT * FROM data_snapshots
      WHERE user_id = $1 AND client_id = $2 AND expires_at > NOW()`,
    [userId, clientId],
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  row.scope_set = parseJsonb<string[]>(row.scope_set)
  return row
}

/** 惰性清理：删除某用户全部已过期快照行（读取路径顺带执行，免定时任务） */
export async function deleteExpiredForUser(sql: SqlExecutor, userId: string): Promise<number> {
  const result = await sql.query(
    'DELETE FROM data_snapshots WHERE user_id = $1 AND expires_at <= NOW()',
    [userId],
  )
  return result.rowCount ?? 0
}

/** 按 client_id 删除全部快照（应用 revoke 级联） */
export async function deleteByClient(sql: SqlExecutor, clientId: string): Promise<number> {
  const result = await sql.query(
    'DELETE FROM data_snapshots WHERE client_id = $1',
    [clientId],
  )
  return result.rowCount ?? 0
}
