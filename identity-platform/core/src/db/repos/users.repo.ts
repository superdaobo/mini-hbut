/**
 * users / linked_identities 仓储（#619）。
 * 纯 SQL 封装，业务语义（冲突检测、事务编排）在 src/domain/users.ts。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'

export type UserStatus = 'active' | 'suspended' | 'disabled'

export interface UserRow extends QueryResultRow {
  id: string
  status: UserStatus
  created_at: Date
  updated_at: Date
  last_active_at: Date | null
}

export type VerificationMethod = 'mini_hbut_app' | 'hbut_oidc'
export type VerificationLevel = 'low' | 'medium' | 'high'

export interface LinkedIdentityRow extends QueryResultRow {
  id: string
  user_id: string
  provider: string
  subject: string
  student_name_snapshot: string | null
  college_snapshot: string | null
  major_snapshot: string | null
  class_name_snapshot: string | null
  grade_snapshot: string | null
  verification_method: VerificationMethod
  verification_level: VerificationLevel
  verified_at: Date
  last_refreshed_at: Date | null
  metadata_json: unknown
  created_at: Date
  updated_at: Date
}

export async function insertUser(sql: SqlExecutor, user: {
  id: string
  status?: UserStatus
}): Promise<void> {
  await sql.query(
    `INSERT INTO users (id, status) VALUES ($1, $2)`,
    [user.id, user.status ?? 'active'],
  )
}

export async function findUserById(sql: SqlExecutor, id: string): Promise<UserRow | null> {
  const result = await sql.query<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [id],
  )
  return result.rows[0] ?? null
}

export async function touchUserLastActive(sql: SqlExecutor, id: string): Promise<void> {
  await sql.query(
    'UPDATE users SET last_active_at = NOW(), updated_at = NOW() WHERE id = $1',
    [id],
  )
}

export async function insertLinkedIdentity(sql: SqlExecutor, identity: {
  id: string
  user_id: string
  provider: 'hbut'
  subject: string
  student_name_snapshot?: string | null
  college_snapshot?: string | null
  major_snapshot?: string | null
  class_name_snapshot?: string | null
  grade_snapshot?: string | null
  verification_method: VerificationMethod
  verification_level?: VerificationLevel
  verified_at: Date
}): Promise<void> {
  await sql.query(
    `INSERT INTO linked_identities (
       id, user_id, provider, subject,
       student_name_snapshot, college_snapshot, major_snapshot,
       class_name_snapshot, grade_snapshot,
       verification_method, verification_level, verified_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      identity.id,
      identity.user_id,
      identity.provider,
      identity.subject,
      identity.student_name_snapshot ?? null,
      identity.college_snapshot ?? null,
      identity.major_snapshot ?? null,
      identity.class_name_snapshot ?? null,
      identity.grade_snapshot ?? null,
      identity.verification_method,
      identity.verification_level ?? 'low',
      identity.verified_at,
    ],
  )
}

export async function findIdentityByProviderSubject(
  sql: SqlExecutor,
  provider: string,
  subject: string,
): Promise<LinkedIdentityRow | null> {
  const result = await sql.query<LinkedIdentityRow>(
    'SELECT * FROM linked_identities WHERE provider = $1 AND subject = $2',
    [provider, subject],
  )
  return result.rows[0] ?? null
}

export async function findIdentityByUserId(
  sql: SqlExecutor,
  userId: string,
): Promise<LinkedIdentityRow | null> {
  const result = await sql.query<LinkedIdentityRow>(
    'SELECT * FROM linked_identities WHERE user_id = $1 LIMIT 1',
    [userId],
  )
  return result.rows[0] ?? null
}
