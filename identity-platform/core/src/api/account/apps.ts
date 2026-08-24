/**
 * Account API —— 应用管理端点（#688）。
 *
 * 行为镜像 src/api/developer/index.ts 的对应 handler（状态机/owner 校验/
 * secret 只显示一次等业务规则完全一致），差异仅在身份来源：
 * Bearer Key 解析出的 user_id → developers 表（ensureDeveloper 同款语义）。
 *
 * 端点（前缀 /api/v1/account，受 requireAccountKey 保护）：
 *   GET|POST /apps
 *   GET|PATCH|DELETE /apps/:id
 *   POST /apps/:id/redirect-uris；DELETE /apps/:id/redirect-uris/:rid
 *   PUT|GET /apps/:id/scopes
 *   POST /apps/:id/submit
 *   POST /apps/:id/credentials/rotate
 *   POST /apps/:id/revoke
 *   GET  /apps/:id/audit
 */
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { readJsonBody } from '../app/body.js'
import type { RedirectUriKind } from '../../db/repos/clients.repo.js'
import type { OAuthApplicationRow } from '../../db/repos/clients.repo.js'
import {
  assertValidRedirectUris,
  assertValidScopes,
  createClient,
  rotateClientSecret,
  setClientStatus,
} from '../../domain/clients.js'
import {
  updateApplication,
  upsertApplicationScope,
} from '../../db/repos/clients.repo.js'
import { insertAuditEvent } from '../../db/repos/audit.repo.js'
import { newUuidV7 } from '../../domain/ids.js'
import {
  AccountApiError,
  findOwnedApp,
  requireAccountAuth,
  resolveAccountDeveloper,
  respondAccountError,
  toAppDetail,
  toAppSummary,
} from './common.js'

/** 注册 account 应用管理路由（前缀已由挂载方保证在 /api/v1/account 下） */
export function registerAccountAppsRoutes(router: Router, deps: { sql: SqlExecutor; env?: Record<string, string | undefined> }): void {
  const { sql } = deps

  // GET /api/v1/account/apps —— 应用列表（本人）
  router.get(`${API_PREFIX}/account/apps`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const result = await sql.query<OAuthApplicationRow>(
        `SELECT * FROM oauth_applications WHERE owner_developer_id = $1 ORDER BY updated_at DESC`,
        [dev.id],
      )
      const apps = await Promise.all(
        result.rows.map(async (row) => {
          const summary = await toAppSummary(sql, row)
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
      respondAccountError(ctx, err)
    }
  })

  // POST /api/v1/account/apps —— 创建应用（先落 draft；secret 只返回一次）
  router.post(`${API_PREFIX}/account/apps`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const body = ((await readJsonBody(ctx)) ?? {}) as Record<string, unknown>
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const description = typeof body.description === 'string' ? body.description.trim() : ''
      const clientType = body.client_type === 'native_public' ? 'native_public' : 'web_confidential'
      if (!name || !description) {
        throw new AccountApiError('invalid_request')
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
        throw new AccountApiError('invalid_request')
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
        throw new AccountApiError('invalid_request')
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
          clientSecretKek: deps.env?.IDENTITY_CLIENT_SECRET_KEK,
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
        metadata: { client_id: created.clientId, via: 'account_api_key' },
      })
      ctx.status = 201
      ctx.body = {
        id: created.applicationId,
        client_id: created.clientId,
        client_secret: created.clientSecret ?? null,
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // GET /api/v1/account/apps/:id —— 详情（非本人 404 防枚举）
  router.get(`${API_PREFIX}/account/apps/:id`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      ctx.status = 200
      ctx.body = { app: await toAppDetail(sql, app) }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // PATCH /api/v1/account/apps/:id —— 编辑基本信息（draft/rejected 才可改）
  router.patch(`${API_PREFIX}/account/apps/:id`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new AccountApiError('invalid_state')
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
      ctx.body = { app: updated ? await toAppDetail(sql, updated) : null }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // DELETE /api/v1/account/apps/:id —— 仅 draft 可删
  router.delete(`${API_PREFIX}/account/apps/:id`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      if (app.status !== 'draft') {
        throw new AccountApiError('invalid_state')
      }
      await sql.query('DELETE FROM oauth_applications WHERE id = $1', [app.id])
      ctx.status = 200
      ctx.body = { deleted: true }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // POST /api/v1/account/apps/:id/redirect-uris —— 添加回调地址
  router.post(`${API_PREFIX}/account/apps/:id/redirect-uris`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new AccountApiError('invalid_state')
      }
      const body = ((await readJsonBody(ctx)) ?? {}) as { uri?: unknown; kind?: unknown }
      const uri = typeof body.uri === 'string' ? body.uri.trim() : ''
      const kind = body.kind === 'native_custom' || body.kind === 'native_loopback' ? body.kind : 'web_https'
      if (!uri) {
        throw new AccountApiError('invalid_request')
      }
      assertValidRedirectUris([{ uri, kind: kind as RedirectUriKind }], app.client_type, {
        allowLocalhostDev: deps.env?.IDENTITY_ENVIRONMENT === 'development',
      })
      await sql.query(
        `INSERT INTO oauth_redirect_uris (id, application_id, redirect_uri, kind)
         VALUES ($1, $2, $3, $4)`,
        [newUuidV7(), app.id, uri, kind],
      )
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toAppDetail(sql, updated) : null }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // DELETE /api/v1/account/apps/:id/redirect-uris/:rid —— 删除回调地址
  router.delete(`${API_PREFIX}/account/apps/:id/redirect-uris/:rid`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new AccountApiError('invalid_state')
      }
      await sql.query('DELETE FROM oauth_redirect_uris WHERE id = $1 AND application_id = $2', [
        ctx.params.rid as string,
        app.id,
      ])
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toAppDetail(sql, updated) : null }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // PUT /api/v1/account/apps/:id/scopes —— 替换全部 scope 请求
  router.put(`${API_PREFIX}/account/apps/:id/scopes`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new AccountApiError('invalid_state')
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
      ctx.body = { app: updated ? await toAppDetail(sql, updated) : null }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // GET /api/v1/account/apps/:id/scopes —— scope 列表
  router.get(`${API_PREFIX}/account/apps/:id/scopes`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
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
      respondAccountError(ctx, err)
    }
  })

  // POST /api/v1/account/apps/:id/submit —— 提交审核（draft/rejected → pending_review）
  router.post(`${API_PREFIX}/account/apps/:id/submit`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      if (app.status !== 'draft' && app.status !== 'rejected') {
        throw new AccountApiError('invalid_state')
      }
      await setClientStatus(sql, app.client_id, 'pending_review')
      await sql.query(`UPDATE oauth_applications SET submitted_at = NOW() WHERE id = $1`, [app.id])
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toAppDetail(sql, updated) : null }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // POST /api/v1/account/apps/:id/credentials/rotate —— 轮换 secret（明文只返回一次）
  router.post(`${API_PREFIX}/account/apps/:id/credentials/rotate`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      const { clientSecret } = await rotateClientSecret(sql, app.client_id, {
        clientSecretKek: deps.env?.IDENTITY_CLIENT_SECRET_KEK,
      })
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = {
        app: updated ? await toAppDetail(sql, updated) : null,
        client_secret: clientSecret,
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // POST /api/v1/account/apps/:id/revoke —— 撤销应用
  router.post(`${API_PREFIX}/account/apps/:id/revoke`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      await setClientStatus(sql, app.client_id, 'revoked')
      const updated = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      ctx.status = 200
      ctx.body = { app: updated ? await toAppDetail(sql, updated) : null }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })

  // GET /api/v1/account/apps/:id/audit —— 单应用审计（target 维度，同 developer API）
  router.get(`${API_PREFIX}/account/apps/:id/audit`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const dev = await resolveAccountDeveloper(sql, userId)
      const app = await findOwnedApp(sql, dev.id, ctx.params.id as string)
      if (!app) {
        throw new AccountApiError('not_found')
      }
      const result = await sql.query(
        `SELECT id, created_at, event_type, actor_type, result, metadata_json
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
          detail: JSON.stringify(r.metadata_json ?? {}),
        })),
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })
}
