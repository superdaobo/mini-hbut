/**
 * Developer Portal API（#624 / #625 契约，web/lib/developer-api/client.ts 的实现端）。
 *
 * 挂载：/api/v1/developer/**（受 service-token 中间件保护，仅 BFF 通道）。
 *
 * 身份模型：
 * - x-developer-subject = BFF 会话中的 pairwise sub（developer-portal client 签发）；
 * - 本模块先把 pairwise sub 解析为内部 user_id，再关联 developers 表；
 * - 首次访问（GET/POST /me）自动建档（ensureDeveloper 语义：user_id 维度幂等）；
 * - 应用归属：oauth_applications.owner_developer_id → developers.id；
 *   所有查询带 owner 过滤，非本人一律 404（防枚举，不泄露存在性）。
 *
 * 状态机（应用生命周期）：
 *   draft → pending_review → approved → active → suspended/revoked
 *   draft/rejected 可编辑；draft 可删除；draft 可提交审核；
 *   web_confidential 创建/rotate 时 client_secret 明文只返回一次。
 */
import Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import type { QueryResultRow } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { readJsonBody } from '../app/body.js'
import type { RedirectUriKind } from '../../db/repos/clients.repo.js'
import { resolveUserIdBySubject } from '../../domain/subject-resolution.js'
import { newUuidV7 } from '../../domain/ids.js'
import {
  assertValidRedirectUris,
  assertValidScopes,
  createClient,
  rotateClientSecret,
  setClientStatus,
} from '../../domain/clients.js'
import {
  findApplicationByClientId,
  listRedirectUris,
  upsertApplicationScope,
  updateApplication,
  replaceRedirectUris,
  type OAuthApplicationRow,
} from '../../db/repos/clients.repo.js'
import { insertAuditEvent } from '../../db/repos/audit.repo.js'
import { decryptClientSecret } from '../../security/client-secret.js'
import { sha256Base64url } from '../../security/hash.js'

export const DEVELOPER_SUBJECT_HEADER = 'x-developer-subject'

/** registerDeveloperRoutes 依赖 */
export interface DeveloperApiDeps {
  sql: SqlExecutor
  /** IDENTITY_PAIRWISE_SUBJECT_KEY */
  pairwiseKey?: string
  /** IDENTITY_CLIENT_SECRET_KEK（secret 加密） */
  clientSecretKek?: string
  /** 开发者门户登录 client_id */
  developerClientId?: string
  env?: Record<string, string | undefined>
}

class DeveloperApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.name = 'DeveloperApiError'
    this.status = status
    this.code = code
  }
}

/** 读取 x-developer-subject */
function readSubject(ctx: RouterContext): string | undefined {
  const value = ctx.get(DEVELOPER_SUBJECT_HEADER)
  return value.length > 0 ? value : undefined
}

/** 解析 subject → user_id；无效返回 null */
async function resolveUserId(
  deps: DeveloperApiDeps,
  subject: string | undefined,
): Promise<string | null> {
  if (!subject) return null
  try {
    return await resolveUserIdBySubject({
      sql: deps.sql,
      pairwiseKey: deps.pairwiseKey ?? deps.env?.IDENTITY_PAIRWISE_SUBJECT_KEY,
      clientId: deps.developerClientId ?? deps.env?.DEVELOPER_OIDC_CLIENT_ID ?? 'developer-portal',
      subject,
    })
  } catch {
    return null
  }
}

/** 按 user_id 查 developer（不存在返回 null） */
async function findDeveloperByUserId(
  sql: SqlExecutor,
  userId: string,
): Promise<DeveloperRow | null> {
  const result = await sql.query<DeveloperRow>(
    'SELECT id, display_name, status, created_at FROM developers WHERE user_id = $1',
    [userId],
  )
  return result.rows[0] ?? null
}

interface DeveloperRow extends QueryResultRow {
  id: string
  display_name: string
  status: string
  created_at: string
}

/** 按 user_id 幂等建档（首次访问自动创建，dev_ 前缀） */
async function ensureDeveloper(
  sql: SqlExecutor,
  userId: string,
  displayName: string,
): Promise<DeveloperRow> {
  const existing = await findDeveloperByUserId(sql, userId)
  if (existing) {
    return existing
  }
  const id = `dev_${newUuidV7()}`
  await sql.query(
    `INSERT INTO developers (id, user_id, display_name, status)
     VALUES ($1, $2, $3, 'active')`,
    [id, userId, displayName],
  )
  return { id, display_name: displayName, status: 'active', created_at: new Date().toISOString() }
}

function respondError(ctx: RouterContext, err: unknown): void {
  if (err instanceof DeveloperApiError) {
    ctx.status = err.status
    ctx.body = { error: err.code, message: err.message }
    return
  }
  ctx.status = 502
  ctx.body = { error: 'internal' }
}

/** 应用行 → 摘要 DTO（web contract DeveloperAppSummaryDTO） */
async function toSummary(
  sql: SqlExecutor,
  app: OAuthApplicationRow,
): Promise<Record<string, unknown>> {
  const uris = await listRedirectUris(sql, app.id)
  return {
    id: app.id,
    client_id: app.client_id,
    name: app.name,
    client_type: app.client_type,
    status: app.status,
    scopes: [], // 摘要 scopes 由下方补充（简化：查询 approved+requested）
    updated_at: app.updated_at.toISOString(),
  }
}

/**
 * 注册 developer 路由。
 * 每个 handler：解析 subject → user_id → developer；应用操作校验 owner。
 */
export function registerDeveloperRoutes(router: Router, deps: DeveloperApiDeps): void {
  const { sql } = deps
  /** secret 解密 KEK（详情接口计算 last4/fingerprint 用；未配置则元数据退化为 null） */
  const secretKek = deps.clientSecretKek ?? deps.env?.IDENTITY_CLIENT_SECRET_KEK

  // GET/POST /api/v1/developer/me —— 当前开发者资料（幂等建档）
  router.get(`${API_PREFIX}/developer/me`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      ctx.status = 200
      ctx.body = {
        sub: userId,
        display_name: dev.display_name,
        status: dev.status,
        created_at: dev.created_at,
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  router.post(`${API_PREFIX}/developer/me`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const body = ((await readJsonBody(ctx)) as { display_name?: unknown }) ?? {}
      const displayName =
        typeof body.display_name === 'string' && body.display_name.trim()
          ? body.display_name.trim().slice(0, 64)
          : '开发者'
      const dev = await ensureDeveloper(sql, userId, displayName)
      ctx.status = 200
      ctx.body = {
        sub: userId,
        display_name: dev.display_name,
        status: dev.status,
        created_at: dev.created_at,
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/developer/apps —— 应用列表（本人）
  router.get(`${API_PREFIX}/developer/apps`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const result = await sql.query<OAuthApplicationRow>(
        `SELECT * FROM oauth_applications WHERE owner_developer_id = $1 ORDER BY updated_at DESC`,
        [dev.id],
      )
      const apps = await Promise.all(
        result.rows.map(async (row) => {
          const summary = await toSummary(sql, row)
          const scopes = await sql.query<{ scope: string }>(
            `SELECT scope FROM oauth_application_scopes WHERE application_id = $1 ORDER BY scope`,
            [row.id],
          )
          summary.scopes = scopes.rows.map((s) => s.scope)
          return summary
        }),
      )
      ctx.status = 200
      ctx.body = { apps }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/developer/apps —— 创建应用（先落 draft；secret 只返回一次）
  router.post(`${API_PREFIX}/developer/apps`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      if (dev.status !== 'active') {
        throw new DeveloperApiError(403, 'forbidden')
      }
      const body = ((await readJsonBody(ctx)) ?? {}) as Record<string, unknown>
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const description = typeof body.description === 'string' ? body.description.trim() : ''
      const clientType = body.client_type === 'native_public' ? 'native_public' : 'web_confidential'
      if (!name || !description) {
        throw new DeveloperApiError(400, 'invalid_request')
      }
      const redirectUris = Array.isArray(body.redirect_uris)
        ? (body.redirect_uris as Array<{ uri?: unknown; kind?: unknown }>)
            .filter((u) => typeof u?.uri === 'string' && u.uri.trim())
            .map((u) => ({
              uri: (u.uri as string).trim(),
              kind: (u.kind === 'native_custom' || u.kind === 'native_loopback' ? u.kind : 'web_https') as RedirectUriKind,
            }))
        : []
      if (redirectUris.length === 0) {
        throw new DeveloperApiError(400, 'invalid_request')
      }
      assertValidRedirectUris(redirectUris, clientType, {
        allowLocalhostDev: deps.env?.IDENTITY_ENVIRONMENT === 'development',
      })
      const scopes = Array.isArray(body.scopes)
        ? (body.scopes as Array<{ scope?: unknown; justification?: unknown }>)
            .filter((s) => typeof s?.scope === 'string')
            .map((s) => s.scope as string)
        : []
      if (scopes.length === 0) {
        throw new DeveloperApiError(400, 'invalid_request')
      }
      assertValidScopes(scopes)

      const created = await createClient(
        sql,
        {
          developerId: dev.id,
          name,
          description: description || undefined,
          homepageUrl:
            typeof body.homepage_url === 'string' && body.homepage_url.trim()
              ? body.homepage_url.trim()
              : undefined,
          privacyPolicyUrl:
            typeof body.privacy_policy_url === 'string' && body.privacy_policy_url.trim()
              ? body.privacy_policy_url.trim()
              : undefined,
          clientType,
          redirectUris,
          requestedScopes: scopes,
        },
        {
          clientSecretKek: deps.clientSecretKek ?? deps.env?.IDENTITY_CLIENT_SECRET_KEK,
          allowLocalhostDev: deps.env?.IDENTITY_ENVIRONMENT === 'development',
        },
      )
      await insertAuditEvent(sql, {
        eventType: 'developer.app_created',
        actorType: 'developer',
        actorId: dev.id,
        targetType: 'oauth_application',
        targetId: created.applicationId,
        result: 'success',
        metadata: { client_id: created.clientId },
      })
      ctx.status = 201
      ctx.body = {
        id: created.applicationId,
        client_id: created.clientId,
        client_secret: created.clientSecret ?? null,
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/developer/apps/:id —— 应用详情（本人；非本人 404）
  router.get(`${API_PREFIX}/developer/apps/:id`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      ctx.status = 200
      ctx.body = { app: await toDetail(sql, app, secretKek) }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // PATCH /api/v1/developer/apps/:id —— 编辑基本信息（draft/rejected 才可改）
  router.patch(`${API_PREFIX}/developer/apps/:id`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new DeveloperApiError(409, 'invalid_state')
      }
      const body = ((await readJsonBody(ctx)) ?? {}) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
      if (typeof body.description === 'string') patch.description = body.description.trim()
      if ('homepage_url' in body) patch.homepage_url = body.homepage_url as string | null
      if ('privacy_policy_url' in body) patch.privacy_policy_url = body.privacy_policy_url as string | null
      if ('contact' in body) patch.contact = body.contact as string | null
      await updateApplication(sql, app.client_id, patch)
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toDetail(sql, updated, secretKek) : null }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // DELETE /api/v1/developer/apps/:id —— 仅 draft 可删
  router.delete(`${API_PREFIX}/developer/apps/:id`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      if (app.status !== 'draft') {
        throw new DeveloperApiError(409, 'invalid_state')
      }
      await sql.query('DELETE FROM oauth_applications WHERE id = $1', [app.id])
      ctx.status = 200
      ctx.body = { deleted: true }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/developer/apps/:id/redirect-uris —— 添加回调地址
  router.post(`${API_PREFIX}/developer/apps/:id/redirect-uris`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new DeveloperApiError(409, 'invalid_state')
      }
      const body = ((await readJsonBody(ctx)) ?? {}) as { uri?: unknown; kind?: unknown }
      const uri = typeof body.uri === 'string' ? body.uri.trim() : ''
      const kind = body.kind === 'native_custom' || body.kind === 'native_loopback' ? body.kind : 'web_https'
      if (!uri) {
        throw new DeveloperApiError(400, 'invalid_request')
      }
      assertValidRedirectUris([{ uri, kind }], app.client_type, {
        allowLocalhostDev: deps.env?.IDENTITY_ENVIRONMENT === 'development',
      })
      await sql.query(
        `INSERT INTO oauth_redirect_uris (id, application_id, redirect_uri, kind)
         VALUES ($1, $2, $3, $4)`,
        [newUuidV7(), app.id, uri, kind],
      )
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toDetail(sql, updated, secretKek) : null }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // DELETE /api/v1/developer/apps/:id/redirect-uris/:rid —— 删除回调地址
  router.delete(`${API_PREFIX}/developer/apps/:id/redirect-uris/:rid`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new DeveloperApiError(409, 'invalid_state')
      }
      await sql.query('DELETE FROM oauth_redirect_uris WHERE id = $1 AND application_id = $2', [
        ctx.params.rid as string,
        app.id,
      ])
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toDetail(sql, updated, secretKek) : null }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // PUT /api/v1/developer/apps/:id/scopes —— 替换全部 scope 请求
  router.put(`${API_PREFIX}/developer/apps/:id/scopes`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new DeveloperApiError(409, 'invalid_state')
      }
      const body = ((await readJsonBody(ctx)) ?? {}) as { scopes?: Array<{ scope?: unknown; justification?: unknown }> }
      const scopes = Array.isArray(body.scopes)
        ? body.scopes
            .filter((s) => typeof s?.scope === 'string')
            .map((s) => ({
              scope: s.scope as string,
              justification: typeof s.justification === 'string' ? s.justification : null,
            }))
        : []
      assertValidScopes(scopes.map((s) => s.scope))
      await sql.query('DELETE FROM oauth_application_scopes WHERE application_id = $1', [app.id])
      for (const s of scopes) {
        await upsertApplicationScope(sql, app.id, s.scope, 'requested')
        await sql.query(
          `UPDATE oauth_application_scopes SET review_note = $1 WHERE application_id = $2 AND scope = $3`,
          [s.justification, app.id, s.scope],
        )
      }
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toDetail(sql, updated, secretKek) : null }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/developer/apps/:id/scopes —— scope 列表
  router.get(`${API_PREFIX}/developer/apps/:id/scopes`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      const result = await sql.query<{ scope: string; status: string; review_note: string | null }>(
        `SELECT scope, status, review_note FROM oauth_application_scopes WHERE application_id = $1`,
        [app.id],
      )
      ctx.status = 200
      ctx.body = {
        scopes: result.rows.map((r) => ({
          scope: r.scope,
          status: r.status,
          justification: r.review_note,
        })),
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/developer/apps/:id/submit —— 提交审核（draft/rejected → pending_review）
  router.post(`${API_PREFIX}/developer/apps/:id/submit`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new DeveloperApiError(409, 'invalid_state')
      }
      await setClientStatus(sql, app.client_id, 'pending_review')
      await sql.query(
        `UPDATE oauth_applications SET submitted_at = NOW() WHERE id = $1`,
        [app.id],
      )
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toDetail(sql, updated, secretKek) : null }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/developer/apps/:id/credentials/rotate —— 轮换 secret（web_confidential）
  router.post(`${API_PREFIX}/developer/apps/:id/credentials/rotate`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      const { clientSecret } = await rotateClientSecret(sql, app.client_id, {
        clientSecretKek: deps.clientSecretKek ?? deps.env?.IDENTITY_CLIENT_SECRET_KEK,
      })
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = {
        app: updated ? await toDetail(sql, updated, secretKek) : null,
        client_secret: clientSecret,
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // POST /api/v1/developer/apps/:id/revoke —— 撤销应用（active/suspended → revoked）
  router.post(`${API_PREFIX}/developer/apps/:id/revoke`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      await setClientStatus(sql, app.client_id, 'revoked')
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toDetail(sql, updated, secretKek) : null }
    } catch (err) {
      respondError(ctx, err)
    }
  })

  // GET /api/v1/developer/apps/:id/audit —— 审计
  router.get(`${API_PREFIX}/developer/apps/:id/audit`, async (ctx) => {
    try {
      const userId = await resolveUserId(deps, readSubject(ctx))
      if (!userId) {
        throw new DeveloperApiError(401, 'unauthorized')
      }
      const dev = await ensureDeveloper(sql, userId, '开发者')
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new DeveloperApiError(404, 'not_found')
      }
      const result = await sql.query(
        `SELECT id, created_at, event_type, actor_type, result, metadata
         FROM audit_events WHERE target_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [app.id],
      )
      ctx.status = 200
      ctx.body = {
        audit: result.rows.map((r: Record<string, unknown>) => ({
          id: r.id,
          at: r.created_at,
          action: r.event_type,
          actor: r.actor_type,
          detail: JSON.stringify(r.metadata ?? {}),
        })),
      }
    } catch (err) {
      respondError(ctx, err)
    }
  })
}

/** 查本人应用（owner 过滤；非本人 → null） */
async function findOwnedApp(
  sql: SqlExecutor,
  developerId: string,
  appId: string,
): Promise<OAuthApplicationRow | null> {
  const result = await sql.query<OAuthApplicationRow>(
    'SELECT * FROM oauth_applications WHERE id = $1 AND owner_developer_id = $2',
    [appId, developerId],
  )
  return result.rows[0] ?? null
}

/** 应用行 → 详情 DTO（web contract DeveloperAppDetailDTO 的核心字段） */
async function toDetail(
  sql: SqlExecutor,
  app: OAuthApplicationRow,
  clientSecretKek?: string,
): Promise<Record<string, unknown>> {
  const uris = await listRedirectUris(sql, app.id)
  const scopes = await sql.query<{ scope: string; status: string; review_note: string | null }>(
    `SELECT scope, status, review_note FROM oauth_application_scopes WHERE application_id = $1 ORDER BY scope`,
    [app.id],
  )
  // #687：secret 真实元数据——解出密文后取末 4 位明文与完整指纹。
  // 明文本身绝不出 Core；解密失败（KEK 不符/密文损坏）时 fail-safe 退化为 null，不影响其余字段
  let last4: string | null = null
  let fingerprint: string | null = null
  if (app.client_secret_encrypted && clientSecretKek) {
    try {
      const plaintext = decryptClientSecret(clientSecretKek, app.client_secret_encrypted)
      last4 = plaintext.slice(-4)
      fingerprint = sha256Base64url(plaintext)
    } catch {
      // 保持 null：宁缺毋假
    }
  }
  return {
    id: app.id,
    client_id: app.client_id,
    name: app.name,
    client_type: app.client_type,
    status: app.status,
    description: app.description ?? null,
    homepage_url: app.homepage_url ?? null,
    privacy_policy_url: app.privacy_policy_url ?? null,
    contact: app.contact ?? null,
    created_at: app.created_at.toISOString(),
    updated_at: app.updated_at.toISOString(),
    submitted_at: app.submitted_at ? app.submitted_at.toISOString() : null,
    activated_at: app.activated_at ? app.activated_at.toISOString() : null,
    scopes: scopes.rows.map((r) => ({
      scope: r.scope,
      status: r.status,
      justification: r.review_note,
    })),
    redirect_uris: uris.map((u) => ({
      id: u.id,
      uri: u.redirect_uri,
      kind: u.kind,
      validation_status: u.kind === 'web_https' ? 'approved' : 'pending',
      created_at: u.created_at.toISOString(),
    })),
    review: {
      status: app.status,
      submitted_at: app.submitted_at ? app.submitted_at.toISOString() : null,
      reviewed_at: app.reviewed_at ? app.reviewed_at.toISOString() : null,
      decision: app.status === 'active' || app.status === 'approved' ? 'approved' : app.status === 'rejected' ? 'rejected' : null,
      rejection_reason: app.status === 'rejected' ? '应用未通过审核，请根据审核意见修改后重新提交' : null,
      review_notes: null,
      needs_changes: app.status === 'rejected' ? ['请修改后重新提交审核'] : null,
    },
    secret: {
      created_at: app.client_secret_encrypted ? app.created_at.toISOString() : null,
      // 库中无「上次轮换时间」列（rotate 仅覆盖密文本身，无独立时间戳），无法真实提供 → 保持 null，不谎造
      last_rotated_at: null,
      fingerprint,
      last4,
    },
    audit: [],
  }
}
