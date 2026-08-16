/**
 * oidc_provider_records 仓储（#619）。
 * 对应 oidc-provider v9 Adapter 契约（见 src/oidc/adapter/postgres-adapter.ts）：
 * upsert / find / findByUserCode / findByUid / consume / destroy / revokeByGrantId。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'
import { parseJsonb } from '../types.js'
import { newUuidV7 } from '../../domain/ids.js'

export interface OidcRecordRow extends QueryResultRow {
  id: string
  model_name: string
  record_id: string
  payload_jsonb: unknown
  expires_at: Date | null
  consumed_at: Date | null
  grant_id: string | null
  user_code: string | null
  uid: string | null
  created_at: Date
  updated_at: Date
}

export interface UpsertOidcRecordInput {
  modelName: string
  recordId: string
  payload: Record<string, unknown>
  /** oidc-provider expiresIn：秒；undefined = 永不过期；0 = 立即过期 */
  expiresIn?: number
  grantId?: string | null
  userCode?: string | null
  uid?: string | null
}

export function expiresAtFor(expiresIn: number | undefined, now: Date = new Date()): Date | null {
  if (typeof expiresIn !== 'number') {
    return null
  }
  return new Date(now.getTime() + expiresIn * 1000)
}

/** upsert：存在 (model_name, record_id) 则整体覆盖并重置消费状态 */
export async function upsertOidcRecord(
  sql: SqlExecutor,
  input: UpsertOidcRecordInput,
): Promise<void> {
  const expiresAt = expiresAtFor(input.expiresIn)
  await sql.query(
    `INSERT INTO oidc_provider_records (
       id, model_name, record_id, payload_jsonb, expires_at,
       grant_id, user_code, uid
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
     ON CONFLICT (model_name, record_id)
     DO UPDATE SET
       payload_jsonb = EXCLUDED.payload_jsonb,
       expires_at    = EXCLUDED.expires_at,
       consumed_at   = NULL,
       grant_id      = EXCLUDED.grant_id,
       user_code     = EXCLUDED.user_code,
       uid           = EXCLUDED.uid,
       updated_at    = NOW()`,
    [
      newUuidV7(),
      input.modelName,
      input.recordId,
      JSON.stringify(input.payload),
      expiresAt,
      input.grantId ?? null,
      input.userCode ?? null,
      input.uid ?? null,
    ],
  )
}

function parseRow(row: OidcRecordRow): OidcRecordRow {
  row.payload_jsonb = parseJsonb<Record<string, unknown>>(row.payload_jsonb)
  return row
}

/** find：未过期（expires_at IS NULL 或 > NOW()）才返回 */
export async function findOidcRecord(
  sql: SqlExecutor,
  modelName: string,
  recordId: string,
): Promise<OidcRecordRow | null> {
  const result = await sql.query<OidcRecordRow>(
    `SELECT * FROM oidc_provider_records
      WHERE model_name = $1 AND record_id = $2
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [modelName, recordId],
  )
  const row = result.rows[0]
  return row ? parseRow(row) : null
}

export async function findOidcRecordByUserCode(
  sql: SqlExecutor,
  modelName: string,
  userCode: string,
): Promise<OidcRecordRow | null> {
  const result = await sql.query<OidcRecordRow>(
    `SELECT * FROM oidc_provider_records
      WHERE model_name = $1 AND user_code = $2
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC LIMIT 1`,
    [modelName, userCode],
  )
  const row = result.rows[0]
  return row ? parseRow(row) : null
}

export async function findOidcRecordByUid(
  sql: SqlExecutor,
  modelName: string,
  uid: string,
): Promise<OidcRecordRow | null> {
  const result = await sql.query<OidcRecordRow>(
    `SELECT * FROM oidc_provider_records
      WHERE model_name = $1 AND uid = $2
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC LIMIT 1`,
    [modelName, uid],
  )
  const row = result.rows[0]
  return row ? parseRow(row) : null
}

/**
 * consume：原子设置 payload.consumed = epoch 秒（oidc-provider 契约）
 * 与 consumed_at 列；条件 consumed_at IS NULL 保证只消费一次。
 */
export async function consumeOidcRecord(
  sql: SqlExecutor,
  modelName: string,
  recordId: string,
  epochSeconds: number,
): Promise<boolean> {
  const current = await findOidcRecord(sql, modelName, recordId)
  if (!current) {
    return false
  }
  const payload = current.payload_jsonb as Record<string, unknown>
  payload.consumed = epochSeconds
  const result = await sql.query(
    `UPDATE oidc_provider_records
        SET payload_jsonb = $3::jsonb, consumed_at = NOW(), updated_at = NOW()
      WHERE model_name = $1 AND record_id = $2 AND consumed_at IS NULL`,
    [modelName, recordId, JSON.stringify(payload)],
  )
  return (result.rowCount ?? 0) === 1
}

export async function destroyOidcRecord(
  sql: SqlExecutor,
  modelName: string,
  recordId: string,
): Promise<boolean> {
  const result = await sql.query(
    'DELETE FROM oidc_provider_records WHERE model_name = $1 AND record_id = $2',
    [modelName, recordId],
  )
  return (result.rowCount ?? 0) === 1
}

/** 与 oidc-provider memory adapter 的 grantable 集合保持一致 */
const GRANTABLE_MODELS = [
  'AccessToken',
  'AuthorizationCode',
  'RefreshToken',
  'DeviceCode',
  'BackchannelAuthenticationRequest',
  'PreAuthorizedCode',
]

/** 撤销某个 grant 关联的全部协议 artifact（硬删除） */
export async function revokeByGrantId(
  sql: SqlExecutor,
  grantId: string,
): Promise<number> {
  const result = await sql.query(
    `DELETE FROM oidc_provider_records
      WHERE grant_id = $1 AND model_name = ANY($2::text[])`,
    [grantId, GRANTABLE_MODELS],
  )
  return result.rowCount ?? 0
}
