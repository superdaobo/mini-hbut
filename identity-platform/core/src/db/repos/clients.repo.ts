/**
 * oauth_applications / redirect_uris / scopes / consents 仓储（#619）。
 * Client 数据模型唯一权威来源；业务层见 src/domain/clients.ts，
 * oidc-provider 动态读取见 src/oidc/adapter/client-loader.ts。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'
import { parseJsonb } from '../types.js'
import { newUuidV7 } from '../../domain/ids.js'

export type ClientType = 'web_confidential' | 'native_public' | 'browser_public'
export type ApplicationStatus =
  | 'draft' | 'pending_review' | 'approved' | 'active'
  | 'rejected' | 'suspended' | 'revoked'
export type TokenEndpointAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none'
export type RedirectUriKind = 'web_https' | 'native_custom' | 'native_loopback'
export type ScopeStatus = 'requested' | 'approved' | 'rejected'

export interface OAuthApplicationRow extends QueryResultRow {
  id: string
  client_id: string
  owner_developer_id: string
  name: string
  description: string | null
  homepage_url: string | null
  privacy_policy_url: string | null
  /** 开发者联系方式（#687：0004 迁移新增，可空） */
  contact: string | null
  client_type: ClientType
  status: ApplicationStatus
  token_endpoint_auth_method: TokenEndpointAuthMethod
  client_secret_encrypted: string | null
  client_secret_expires_at: Date | null
  subject_type: 'pairwise' | 'public'
  sector_identifier: string | null
  created_at: Date
  submitted_at: Date | null
  reviewed_at: Date | null
  activated_at: Date | null
  updated_at: Date
}

export interface RedirectUriRow extends QueryResultRow {
  id: string
  application_id: string
  redirect_uri: string
  kind: RedirectUriKind
  created_at: Date
}

export interface ApplicationScopeRow extends QueryResultRow {
  id: string
  application_id: string
  scope: string
  requested_at: Date
  approved_at: Date | null
  status: ScopeStatus
  review_note: string | null
}

export interface ConsentRow extends QueryResultRow {
  id: string
  user_id: string
  application_id: string
  granted_scopes: unknown
  created_at: Date
  updated_at: Date
  revoked_at: Date | null
}

/** 允许被部分更新的业务列（防 SQL 注入的动态列白名单） */
const UPDATABLE_COLUMNS = {
  name: 'name',
  description: 'description',
  homepage_url: 'homepage_url',
  privacy_policy_url: 'privacy_policy_url',
  contact: 'contact',
  status: 'status',
  token_endpoint_auth_method: 'token_endpoint_auth_method',
  client_secret_encrypted: 'client_secret_encrypted',
  client_secret_expires_at: 'client_secret_expires_at',
  submitted_at: 'submitted_at',
  reviewed_at: 'reviewed_at',
  activated_at: 'activated_at',
} as const

export async function insertApplication(sql: SqlExecutor, app: {
  id: string
  client_id: string
  owner_developer_id: string
  name: string
  description?: string | null
  homepage_url?: string | null
  privacy_policy_url?: string | null
  client_type: ClientType
  status?: ApplicationStatus
  token_endpoint_auth_method: TokenEndpointAuthMethod
  client_secret_encrypted?: string | null
  client_secret_expires_at?: Date | null
  subject_type?: 'pairwise' | 'public'
  sector_identifier?: string | null
}): Promise<void> {
  await sql.query(
    `INSERT INTO oauth_applications (
       id, client_id, owner_developer_id, name, description,
       homepage_url, privacy_policy_url, client_type, status,
       token_endpoint_auth_method, client_secret_encrypted,
       client_secret_expires_at, subject_type, sector_identifier
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      app.id,
      app.client_id,
      app.owner_developer_id,
      app.name,
      app.description ?? null,
      app.homepage_url ?? null,
      app.privacy_policy_url ?? null,
      app.client_type,
      app.status ?? 'draft',
      app.token_endpoint_auth_method,
      app.client_secret_encrypted ?? null,
      app.client_secret_expires_at ?? null,
      app.subject_type ?? 'pairwise',
      app.sector_identifier ?? null,
    ],
  )
}

/** 部分更新（键必须来自白名单） */
export async function updateApplication(
  sql: SqlExecutor,
  clientId: string,
  patch: Partial<Record<keyof typeof UPDATABLE_COLUMNS, unknown>>,
): Promise<boolean> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  if (entries.length === 0) {
    return false
  }
  const sets: string[] = []
  const values: unknown[] = [clientId]
  for (const [key, value] of entries) {
    const column = UPDATABLE_COLUMNS[key as keyof typeof UPDATABLE_COLUMNS]
    if (!column) {
      throw new Error(`[clients.repo] 不允许更新的列：${key}`)
    }
    sets.push(`${column} = $${values.length + 1}`)
    values.push(value)
  }
  sets.push('updated_at = NOW()')
  const result = await sql.query(
    `UPDATE oauth_applications SET ${sets.join(', ')} WHERE client_id = $1`,
    values,
  )
  return (result.rowCount ?? 0) === 1
}

export async function findApplicationByClientId(
  sql: SqlExecutor,
  clientId: string,
): Promise<OAuthApplicationRow | null> {
  const result = await sql.query<OAuthApplicationRow>(
    'SELECT * FROM oauth_applications WHERE client_id = $1',
    [clientId],
  )
  return result.rows[0] ?? null
}

export async function findActiveApplicationByClientId(
  sql: SqlExecutor,
  clientId: string,
): Promise<OAuthApplicationRow | null> {
  const result = await sql.query<OAuthApplicationRow>(
    "SELECT * FROM oauth_applications WHERE client_id = $1 AND status = 'active'",
    [clientId],
  )
  return result.rows[0] ?? null
}

// ---------------------------------------------------------------------------
// redirect_uris
// ---------------------------------------------------------------------------

export async function replaceRedirectUris(
  sql: SqlExecutor,
  applicationId: string,
  uris: Array<{ uri: string; kind: RedirectUriKind }>,
): Promise<void> {
  await sql.query('DELETE FROM oauth_redirect_uris WHERE application_id = $1', [applicationId])
  for (const u of uris) {
    await sql.query(
      `INSERT INTO oauth_redirect_uris (id, application_id, redirect_uri, kind)
       VALUES ($1, $2, $3, $4)`,
      [newUuidV7(), applicationId, u.uri, u.kind],
    )
  }
}

export async function listRedirectUris(
  sql: SqlExecutor,
  applicationId: string,
): Promise<RedirectUriRow[]> {
  const result = await sql.query<RedirectUriRow>(
    'SELECT * FROM oauth_redirect_uris WHERE application_id = $1 ORDER BY created_at',
    [applicationId],
  )
  return result.rows
}

// ---------------------------------------------------------------------------
// scopes
// ---------------------------------------------------------------------------

export async function upsertApplicationScope(
  sql: SqlExecutor,
  applicationId: string,
  scope: string,
  status: ScopeStatus,
): Promise<void> {
  await sql.query(
    `INSERT INTO oauth_application_scopes (id, application_id, scope, status, approved_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (application_id, scope)
     DO UPDATE SET status = EXCLUDED.status, approved_at = EXCLUDED.approved_at`,
    [
      newUuidV7(),
      applicationId,
      scope,
      status,
      status === 'approved' ? new Date() : null,
    ],
  )
}

export async function listApprovedScopes(
  sql: SqlExecutor,
  applicationId: string,
): Promise<string[]> {
  const result = await sql.query<{ scope: string }>(
    `SELECT scope FROM oauth_application_scopes
      WHERE application_id = $1 AND status = 'approved' ORDER BY scope`,
    [applicationId],
  )
  return result.rows.map((r) => r.scope)
}

// ---------------------------------------------------------------------------
// consents
// ---------------------------------------------------------------------------

export async function upsertConsent(
  sql: SqlExecutor,
  consent: { userId: string; applicationId: string; grantedScopes: string[] },
): Promise<void> {
  await sql.query(
    `INSERT INTO oauth_consents (id, user_id, application_id, granted_scopes)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, application_id)
     DO UPDATE SET granted_scopes = EXCLUDED.granted_scopes, updated_at = NOW(), revoked_at = NULL`,
    [newUuidV7(), consent.userId, consent.applicationId, JSON.stringify(consent.grantedScopes)],
  )
}

export async function findConsent(
  sql: SqlExecutor,
  userId: string,
  applicationId: string,
): Promise<ConsentRow | null> {
  const result = await sql.query<ConsentRow>(
    'SELECT * FROM oauth_consents WHERE user_id = $1 AND application_id = $2',
    [userId, applicationId],
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  row.granted_scopes = parseJsonb<string[]>(row.granted_scopes)
  return row
}
