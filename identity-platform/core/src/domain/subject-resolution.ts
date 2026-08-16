/**
 * Pairwise Subject → 内部 user_id 解析（admin/developer API 用）。
 *
 * 背景：BFF 会话里存的是 OIDC id_token 的 sub（pairwise 派生值，
 * sub = HMAC(PAIRWISE_KEY, client_id || 0x00 || user_id)），而 admin RBAC
 * （user_roles）和 developers 表都按内部 user_id 关联。pairwise 不可逆，
 * 因此本模块在服务端用同一 HMAC 枚举比对，把 sub 解析回 user_id。
 *
 * 约束与优化：
 * - 只在受 service-token 保护的 BFF 通道使用（用户量小、频率低）；
 * - 进程内 LRU 缓存（sub → user_id），避免每次请求全表枚举；
 * - 密钥未配置/占位 → fail closed（抛错，绝不返回猜测结果）。
 */
import { createHmac } from 'node:crypto'
import type { SqlExecutor } from '../db/types.js'
import { assertKeyMaterial } from '../security/hash.js'

const CACHE_MAX = 512

/** 轻量进程内缓存（sub → user_id | null；null 表示确认不存在） */
class SubjectCache {
  private map = new Map<string, string | null>()

  get(sub: string): string | null | undefined {
    return this.map.get(sub)
  }

  set(sub: string, userId: string | null): void {
    if (this.map.size >= CACHE_MAX) {
      // 简单淘汰：清空重建（频率低，可接受）
      this.map.clear()
    }
    this.map.set(sub, userId)
  }
}

const cache = new SubjectCache()

/** 与 domain/subjects.ts derivePairwiseSubject 逐字节一致（0x00 分隔） */
function derivePairwise(subjectKey: string, sectorOrClientId: string, userId: string): string {
  const material = `${sectorOrClientId}\u0000${userId}`
  return createHmac('sha256', subjectKey).update(material, 'utf8').digest('base64url')
}

export interface ResolveSubjectInput {
  sql: SqlExecutor
  /** IDENTITY_PAIRWISE_SUBJECT_KEY */
  pairwiseKey: string | undefined
  /** 登录所用 client_id（developer-portal 等第一方 client） */
  clientId: string
  /** 待解析的 pairwise sub */
  subject: string
}

/**
 * 推导 pairwise sector（与 oidc-provider 的 client.sectorIdentifier 语义一致）：
 * - 显式 sector_identifier（预留列）优先；
 * - 否则用 redirect_uri 的 host（RFC 8252 pairwise：同 host 的多个 client 共享 sub 空间）；
 * - 解析不到 → null。
 */
async function resolveSector(
  sql: SqlExecutor,
  clientId: string,
): Promise<string | null> {
  const app = await sql.query<{ sector_identifier: string | null }>(
    'SELECT sector_identifier FROM oauth_applications WHERE client_id = $1',
    [clientId],
  )
  const row = app.rows[0]
  if (!row) {
    return null
  }
  if (row.sector_identifier) {
    return row.sector_identifier
  }
  const uris = await sql.query<{ redirect_uri: string }>(
    `SELECT r.redirect_uri FROM oauth_redirect_uris r
     JOIN oauth_applications a ON a.id = r.application_id
     WHERE a.client_id = $1 ORDER BY r.redirect_uri LIMIT 1`,
    [clientId],
  )
  const uri = uris.rows[0]?.redirect_uri
  if (!uri) {
    return null
  }
  try {
    return new URL(uri).host
  } catch {
    return null
  }
}

/**
 * 解析 pairwise sub → 内部 user_id。
 * 找不到返回 null（BFF 应视为未登录/无权限，fail closed）。
 */
export async function resolveUserIdBySubject(
  input: ResolveSubjectInput,
): Promise<string | null> {
  const { sql, pairwiseKey, clientId, subject } = input
  if (!subject || !clientId) {
    return null
  }
  assertKeyMaterial(pairwiseKey, 'IDENTITY_PAIRWISE_SUBJECT_KEY')

  const cached = cache.get(subject)
  if (cached !== undefined) {
    return cached
  }

  // sector = redirect_uri host（与 oidc-provider pairwise 一致）
  const sector = await resolveSector(sql, clientId)
  if (!sector) {
    cache.set(subject, null)
    return null
  }

  // 枚举 users（用户量小）；未来可改为预计算列/索引
  const result = await sql.query<{ id: string }>('SELECT id FROM users')
  for (const row of result.rows) {
    if (derivePairwise(pairwiseKey as string, sector, row.id) === subject) {
      cache.set(subject, row.id)
      return row.id
    }
  }
  cache.set(subject, null)
  return null
}
