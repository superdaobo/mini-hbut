/**
 * api_keys 仓储（#688 账户级 API Key）。
 *
 * 安全约定：
 * - secret_hash = sha256Base64url(整串 Key)，明文绝不入库（签发响应只出现一次）；
 * - prefix 列 UNIQUE，认证时按前缀定位行再做 constant-time 比对；
 * - 所有列表/查询接口不得返回 secret_hash（由 DTO 层裁剪）。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'
import { parseJsonb } from '../types.js'

export type ApiKeyStatus = 'active' | 'revoked'

export interface ApiKeyRow extends QueryResultRow {
  id: string
  user_id: string
  name: string
  prefix: string
  secret_hash: string
  scopes: unknown
  status: ApiKeyStatus
  expires_at: Date | null
  last_used_at: Date | null
  created_at: Date
}

/** 解析 scopes JSONB 列（两种驱动返回形态统一成数组） */
export function parseApiKeyScopes(value: unknown): string[] {
  const parsed = parseJsonb<unknown>(value)
  return Array.isArray(parsed) ? (parsed as string[]) : []
}

export async function insertApiKey(sql: SqlExecutor, key: {
  id: string
  userId: string
  name: string
  prefix: string
  secretHash: string
  scopes?: string[]
}): Promise<void> {
  await sql.query(
    `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, scopes)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      key.id,
      key.userId,
      key.name,
      key.prefix,
      key.secretHash,
      JSON.stringify(key.scopes ?? ['account.full']),
    ],
  )
}

/** 按前缀查行（认证路径；返回原始行含 hash，调用方负责不外泄） */
export async function findApiKeyByPrefix(
  sql: SqlExecutor,
  prefix: string,
): Promise<ApiKeyRow | null> {
  const result = await sql.query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE prefix = $1',
    [prefix],
  )
  return result.rows[0] ?? null
}

/** 按 id + 属主查询（管理面吊销路径；非本人一律视为不存在） */
export async function findApiKeyByIdAndUser(
  sql: SqlExecutor,
  id: string,
  userId: string,
): Promise<ApiKeyRow | null> {
  const result = await sql.query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE id = $1 AND user_id = $2',
    [id, userId],
  )
  return result.rows[0] ?? null
}

export interface ApiKeySummaryRow extends QueryResultRow {
  id: string
  name: string
  prefix: string
  status: ApiKeyStatus
  last_used_at: Date | null
  created_at: Date
}

/** 本账户 Key 列表（不含 secret_hash；门户展示用） */
export async function listApiKeysByUser(
  sql: SqlExecutor,
  userId: string,
): Promise<ApiKeySummaryRow[]> {
  const result = await sql.query<ApiKeySummaryRow>(
    `SELECT id, name, prefix, status, last_used_at, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  )
  return result.rows
}

/** 吊销（条件更新：仅 active 可吊销；幂等——已吊销返回 false） */
export async function revokeApiKey(sql: SqlExecutor, id: string): Promise<boolean> {
  const result = await sql.query(
    `UPDATE api_keys SET status = 'revoked' WHERE id = $1 AND status = 'active'`,
    [id],
  )
  return (result.rowCount ?? 0) === 1
}

/** 认证成功后更新最后使用时间（失败不影响请求；尽力而为） */
export async function touchApiKeyLastUsed(sql: SqlExecutor, id: string): Promise<void> {
  await sql.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [id])
}
