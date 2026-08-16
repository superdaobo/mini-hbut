/**
 * audit_events 仓储（#619）。
 * 写入前必须经 src/observability/audit/serializer.ts 校验/脱敏，
 * 禁止把 client_secret / token / code / handoff / 密码等敏感值落库。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'
import { newUuidV7 } from '../../domain/ids.js'

export type ActorType = 'user' | 'device' | 'developer' | 'admin' | 'client' | 'system'
export type AuditResult = 'success' | 'denied' | 'error'

export interface AuditEventRow extends QueryResultRow {
  id: string
  event_type: string
  actor_type: ActorType
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  result: AuditResult
  request_correlation_id: string | null
  ip_hash: string | null
  user_agent_summary: string | null
  metadata_json: unknown
  created_at: Date
}

export interface InsertAuditEventInput {
  eventType: string
  actorType: ActorType
  actorId?: string | null
  targetType?: string | null
  targetId?: string | null
  result: AuditResult
  requestCorrelationId?: string | null
  ipHash?: string | null
  userAgentSummary?: string | null
  /** 必须已通过 serializer 校验（白名单/脱敏后），否则调用方自行负责 */
  metadata?: Record<string, unknown>
}

export async function insertAuditEvent(
  sql: SqlExecutor,
  input: InsertAuditEventInput,
): Promise<AuditEventRow> {
  const result = await sql.query<AuditEventRow>(
    `INSERT INTO audit_events (
       id, event_type, actor_type, actor_id, target_type, target_id, result,
       request_correlation_id, ip_hash, user_agent_summary, metadata_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING *`,
    [
      newUuidV7(),
      input.eventType,
      input.actorType,
      input.actorId ?? null,
      input.targetType ?? null,
      input.targetId ?? null,
      input.result,
      input.requestCorrelationId ?? null,
      input.ipHash ?? null,
      input.userAgentSummary ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  )
  return result.rows[0] as AuditEventRow
}

export async function listAuditEvents(
  sql: SqlExecutor,
  opts: { actorType?: ActorType; limit?: number } = {},
): Promise<AuditEventRow[]> {
  const clauses: string[] = []
  const values: unknown[] = []
  if (opts.actorType) {
    clauses.push(`actor_type = $${values.length + 1}`)
    values.push(opts.actorType)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = opts.limit ?? 100
  const result = await sql.query<AuditEventRow>(
    `SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT $${values.length + 1}`,
    [...values, limit],
  )
  return result.rows
}
