/**
 * Account API —— 管理面 Key 签发/列表/吊销端点（#688）。
 *
 * 挂载在 developer 命名空间（/api/v1/developer/keys），复用既有
 * service-token + x-developer-subject 链路（开发者门户会话经 BFF 调用；
 * service-token 中间件按前缀 '/api/v1/developer/' 自动覆盖本组路由）。
 *
 * 端点（契约 v1）：
 *   GET    /api/v1/developer/keys      → {keys:[{id,name,prefix,status,last_used_at?,created_at}]}
 *                                    （无明文/无 hash）
 *   POST   /api/v1/developer/keys body{name} → 201 {key:"mhbat_...", info:{...}}
 *                                    （明文仅此一次；审计 key_created）
 *   DELETE /api/v1/developer/keys/:id  → 204（owner 校验，非本人 404；审计 key_revoked）
 */
import type Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { readJsonBody } from '../app/body.js'
import { resolveUserIdBySubject } from '../../domain/subject-resolution.js'
import { newUuidV7 } from '../../domain/ids.js'
import { insertAuditEvent } from '../../db/repos/audit.repo.js'
import {
  findApiKeyByIdAndUser,
  findApiKeyByPrefix,
  listApiKeysByUser,
  insertApiKey,
  revokeApiKey,
} from '../../db/repos/api-keys.repo.js'
import { generateApiKey } from '../../security/api-key.js'
import { ensureDeveloperForUser, respondAccountError } from './common.js'

export interface DeveloperKeysApiDeps {
  sql: SqlExecutor
  /** IDENTITY_PAIRWISE_SUBJECT_KEY */
  pairwiseKey?: string
  /** 开发者门户登录 client_id */
  developerClientId?: string
  env?: Record<string, string | undefined>
}

function readSubject(ctx: RouterContext): string | undefined {
  const value = ctx.get('x-developer-subject')
  return value.length > 0 ? value : undefined
}

async function resolveSubjectUserId(deps: DeveloperKeysApiDeps, subject: string | undefined): Promise<string | null> {
  if (!subject) return null
  try {
    return await resolveUserIdBySubject({
      sql: deps.sql,
      pairwiseKey: deps.pairwiseKey ?? deps.env?.IDENTITY_PAIRWISE_SUBJECT_KEY,
      clientId: deps.developerClientId ?? deps.env?.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal',
      subject,
    })
  } catch {
    // pairwiseKey 未配置等 fail closed 场景 → 视为未认证
    return null
  }
}

/** prefix 预检重试（8 hex = 2^32 空间；UNIQUE 约束兜底竞态） */
async function generateUniqueApiKey(sql: SqlExecutor) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const generated = generateApiKey()
    const existing = await findApiKeyByPrefix(sql, generated.prefix)
    if (!existing) {
      return generated
    }
  }
  throw new Error('api key prefix 冲突重试耗尽')
}

export function registerDeveloperKeysRoutes(router: Router, deps: DeveloperKeysApiDeps): void {
  const { sql } = deps

  // GET /api/v1/developer/keys —— 本账户 Key 列表（无明文/无 hash）
  router.get(`${API_PREFIX}/developer/keys`, async (ctx) => {
    try {
      const userId = await resolveSubjectUserId(deps, readSubject(ctx))
      if (!userId) {
        ctx.status = 401
        ctx.body = { error: 'unauthorized', message: '登录状态无效' }
        return
      }
      await ensureDeveloperForUser(sql, userId, '开发者')
      const rows = await listApiKeysByUser(sql, userId)
      ctx.status = 200
      ctx.set('Cache-Control', 'no-store')
      ctx.body = {
        keys: rows.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          status: k.status,
          ...(k.last_used_at ? { last_used_at: k.last_used_at.toISOString() } : {}),
          created_at: k.created_at.toISOString(),
        })),
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // POST /api/v1/developer/keys —— 签发新 Key（明文仅此一次）
  router.post(`${API_PREFIX}/developer/keys`, async (ctx) => {
    try {
      const userId = await resolveSubjectUserId(deps, readSubject(ctx))
      if (!userId) {
        ctx.status = 401
        ctx.body = { error: 'unauthorized', message: '登录状态无效' }
        return
      }
      const dev = await ensureDeveloperForUser(sql, userId, '开发者')
      const body = ((await readJsonBody(ctx)) ?? {}) as { name?: unknown }
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 64) : ''
      if (!name) {
        ctx.status = 400
        ctx.body = { error: 'invalid_request', message: 'Key 名称不能为空' }
        return
      }
      const generated = await generateUniqueApiKey(sql)
      const id = `ak_${newUuidV7()}`
      await insertApiKey(sql, {
        id,
        userId,
        name,
        prefix: generated.prefix,
        secretHash: generated.hash,
      })
      // 审计只含 key_id/name/prefix；secret/hash 绝不落审计
      await insertAuditEvent(sql, {
        eventType: 'developer.key_created',
        actorType: 'developer',
        actorId: dev.id,
        targetType: 'api_key',
        targetId: id,
        result: 'success',
        metadata: { key_id: id, name, prefix: generated.prefix },
      })
      ctx.status = 201
      ctx.set('Cache-Control', 'no-store')
      ctx.body = {
        key: generated.full,
        info: {
          id,
          name,
          prefix: generated.prefix,
          status: 'active',
          created_at: new Date().toISOString(),
        },
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // DELETE /api/v1/developer/keys/:id —— 吊销（owner 校验；非本人 404 防枚举）
  router.delete(`${API_PREFIX}/developer/keys/:id`, async (ctx) => {
    try {
      const userId = await resolveSubjectUserId(deps, readSubject(ctx))
      if (!userId) {
        ctx.status = 401
        ctx.body = { error: 'unauthorized', message: '登录状态无效' }
        return
      }
      const dev = await ensureDeveloperForUser(sql, userId, '开发者')
      const key = await findApiKeyByIdAndUser(sql, ctx.params.id as string, userId)
      if (!key) {
        ctx.status = 404
        ctx.body = { error: 'not_found', message: 'Key 不存在' }
        return
      }
      const revoked = await revokeApiKey(sql, key.id)
      if (revoked) {
        // 仅在真实发生 active→revoked 迁移时记审计（幂等重放不重复记）
        await insertAuditEvent(sql, {
          eventType: 'developer.key_revoked',
          actorType: 'developer',
          actorId: dev.id,
          targetType: 'api_key',
          targetId: key.id,
          result: 'success',
          metadata: { key_id: key.id, name: key.name, prefix: key.prefix },
        })
      }
      ctx.status = 204
      ctx.set('Cache-Control', 'no-store')
      ctx.body = null
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })
}
