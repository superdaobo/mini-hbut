/**
 * auth_requests 仓储（#619）。
 * 状态机合法性定义在 src/domain/auth-requests/state-machine.ts；
 * 本文件提供原子条件更新（WHERE status = ... AND expires_at > NOW()），
 * 保证并发 approve / deny / 过期互斥只有一次生效。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'
import { parseJsonb } from '../types.js'
import type { AuthRequestStatus } from '../../domain/auth-requests/state-machine.js'

export interface AuthRequestRow extends QueryResultRow {
  id: string
  interaction_uid: string
  client_id: string
  requested_scopes: unknown
  scope_hash: string
  server_challenge: string
  handoff_secret_hash: string
  status: AuthRequestStatus
  expires_at: Date
  opened_at: Date | null
  approved_at: Date | null
  denied_at: Date | null
  approved_user_id: string | null
  approved_device_id: string | null
  approval_nonce: string | null
  interaction_finished_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface InsertAuthRequestInput {
  id: string
  interactionUid: string
  clientId: string
  requestedScopes: string[]
  scopeHash: string
  serverChallenge: string
  handoffSecretHash: string
  expiresAt: Date
}

export async function insertAuthRequest(
  sql: SqlExecutor,
  input: InsertAuthRequestInput,
): Promise<void> {
  await sql.query(
    `INSERT INTO auth_requests (
       id, interaction_uid, client_id, requested_scopes, scope_hash,
       server_challenge, handoff_secret_hash, status, expires_at
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'CREATED', $8)`,
    [
      input.id,
      input.interactionUid,
      input.clientId,
      JSON.stringify(input.requestedScopes),
      input.scopeHash,
      input.serverChallenge,
      input.handoffSecretHash,
      input.expiresAt,
    ],
  )
}

export async function findAuthRequestById(
  sql: SqlExecutor,
  id: string,
): Promise<AuthRequestRow | null> {
  const result = await sql.query<AuthRequestRow>(
    'SELECT * FROM auth_requests WHERE id = $1',
    [id],
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  row.requested_scopes = parseJsonb<string[]>(row.requested_scopes)
  return row
}

/** 条件更新 + 时间戳列补写（approve/deny/open 等业务迁移共用） */
export interface TransitionPatch {
  openedAt?: Date | null
  approvedAt?: Date | null
  deniedAt?: Date | null
  approvedUserId?: string | null
  approvedDeviceId?: string | null
  approvalNonce?: string | null
  interactionFinishedAt?: Date | null
}

/**
 * 原子状态迁移：
 * - from 必须是允许的来源状态集合（合法迁移由调用方按状态机表传入）；
 * - 默认要求未过期；to=EXPIRED 时 allowExpired=true（过期本身就是目的状态）；
 * - 返回更新后的行；条件不满足返回 null。
 */
export async function transitionAuthRequest(
  sql: SqlExecutor,
  id: string,
  from: readonly AuthRequestStatus[],
  to: AuthRequestStatus,
  patch: TransitionPatch = {},
  opts: { allowExpired?: boolean } = {},
): Promise<AuthRequestRow | null> {
  const sets: string[] = ['status = $2', 'updated_at = NOW()']
  const values: unknown[] = [id, to]

  const colMap: Array<[keyof TransitionPatch, string]> = [
    ['openedAt', 'opened_at'],
    ['approvedAt', 'approved_at'],
    ['deniedAt', 'denied_at'],
    ['approvedUserId', 'approved_user_id'],
    ['approvedDeviceId', 'approved_device_id'],
    ['approvalNonce', 'approval_nonce'],
    ['interactionFinishedAt', 'interaction_finished_at'],
  ]
  for (const [key, column] of colMap) {
    const value = patch[key]
    if (value !== undefined) {
      sets.push(`${column} = $${values.length + 1}`)
      values.push(value)
    }
  }

  // 每个 from 状态对应一个独立占位符（索引递增，不能复用 values.length）
  const fromParams = from.map((_, i) => `$${values.length + 1 + i}`)
  values.push(...from)
  const expireCondition = opts.allowExpired
    ? 'TRUE'
    : 'expires_at > NOW()'

  const result = await sql.query<AuthRequestRow>(
    `UPDATE auth_requests
        SET ${sets.join(', ')}
      WHERE id = $1
        AND status IN (${fromParams.join(', ')})
        AND ${expireCondition}
      RETURNING *`,
    values,
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  row.requested_scopes = parseJsonb<string[]>(row.requested_scopes)
  return row
}

/** 授权历史行：auth_requests JOIN oauth_applications/developers 的展示视图 */
export interface AuthHistoryByDeviceRow extends QueryResultRow {
  request_id: string
  approved_at: Date
  status: AuthRequestStatus
  client_id: string
  app_name: string | null
  homepage_url: string | null
  developer_display_name: string | null
  app_status: string | null
  requested_scopes: string[]
}

/**
 * 按设备查询授权历史（「授权记录」页数据源）：
 * 只取本设备批准过、且已进入终态链路（approve 之后任一状态）的请求，
 * 按批准时间倒序，上限由 limit 控制（防响应过大）。
 */
export async function listAuthRequestsByDevice(
  sql: SqlExecutor,
  deviceId: string,
  limit = 50,
): Promise<AuthHistoryByDeviceRow[]> {
  const result = await sql.query<AuthHistoryByDeviceRow>(
    `SELECT ar.id AS request_id, ar.approved_at, ar.status, ar.client_id, ar.requested_scopes,
            app.name AS app_name, app.homepage_url, app.status AS app_status,
            dev.display_name AS developer_display_name
       FROM auth_requests ar
       JOIN oauth_applications app ON app.client_id = ar.client_id
       LEFT JOIN developers dev ON dev.id = app.owner_developer_id
      WHERE ar.approved_device_id = $1
        AND ar.status IN ('APPROVED', 'INTERACTION_FINISHED', 'CODE_ISSUED', 'CONSUMED')
      ORDER BY ar.approved_at DESC, ar.id DESC
      LIMIT $2`,
    [deviceId, limit],
  )
  return result.rows.map((row) => ({
    ...row,
    requested_scopes: parseJsonb<string[]>(row.requested_scopes),
  }))
}
