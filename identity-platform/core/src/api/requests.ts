/**
 * Requests Core API（issue #630 合同，本文件对齐 identity-platform/web/lib/core-client/contract.ts）。
 *
 * 端点：
 *   GET  /api/v1/requests/:id           → RequestDetailDTO（sanitized，不泄露
 *                                         challenge/handoff/code/学号内部字段）
 *   GET  /api/v1/requests/:id/status    → RequestStatusDTO
 *   POST /api/v1/requests/:id/resume    → ResumeResultDTO（幂等）
 *
 * 信任模型（#617 边界 12 + #630）：
 * - 所有端点要求 x-identity-handoff 头（handoff secret 的 HMAC 校验）；
 * - 错误一律 { error: <code> } JSON，禁止在错误信息携带敏感值；
 * - 错误码：401 invalid_handoff / 404 not_found / 410 expired /
 *   422 client_unavailable / 409 not_approved / 400 invalid_request / 500 internal。
 */
import Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor, QueryResultRow } from '../db/types.js'
import { parseJsonb } from '../db/types.js'
import {
  findAuthRequestById,
  type AuthRequestRow,
} from '../db/repos/auth-requests.repo.js'
import { verifyHandoffSecret, expireAuthRequest } from '../domain/auth-requests/service.js'
import { transitionAuthRequestStatus } from '../domain/auth-requests/service.js'
import { resumeAuthRequest, ResumeError } from '../oidc/interaction.js'
import type Provider from 'oidc-provider'

export const API_PREFIX = '/api/v1'

/** x-identity-handoff 请求头（#630：Web 接力凭据，绝不出现在日志） */
export const HANDOFF_HEADER = 'x-identity-handoff'

/** scope 展示元数据（#630 RequestScopeDTO：id/label/risk） */
const SCOPE_META: Record<string, { label: string; risk: 'basic' | 'sensitive' }> = {
  openid: { label: '身份标识（openid）', risk: 'basic' },
  profile: { label: '基础资料（昵称/显示名）', risk: 'basic' },
  'student.identity': { label: '学校身份信息（学号/姓名/验证方式）', risk: 'sensitive' },
  offline_access: { label: '刷新令牌（长期保持登录）', risk: 'basic' },
}

/** #630 CoreRequestStatus 映射（auth_requests 状态 → 页面状态机输入） */
function mapStatus(status: AuthRequestRow['status']): 'waiting_app' | 'app_opened' | 'approved' | 'denied' | 'expired' {
  switch (status) {
    case 'CREATED':
    case 'WAITING_APP':
      return 'waiting_app'
    case 'APP_OPENED':
      return 'app_opened'
    case 'APPROVED':
    case 'INTERACTION_FINISHED':
    case 'CODE_ISSUED':
    case 'CONSUMED':
      return 'approved'
    case 'DENIED':
    case 'CANCELLED':
    case 'FAILED':
      return 'denied'
    case 'EXPIRED':
      return 'expired'
  }
}

export interface RequestsApiDeps {
  sql: SqlExecutor
  provider: Provider
  handoffHmacKey: string | undefined
}

/** 请求详情（含 client/developer 展示信息；JOIN 只取展示所需列 + handoff 校验字段） */
interface RequestDetailRow extends QueryResultRow {
  request_id: string
  expires_at: Date
  status: AuthRequestRow['status']
  requested_scopes: string[]
  /** verifyHandoffSecret 需要（HMAC 比对）；绝不出现在响应 DTO 中 */
  handoff_secret_hash: string
  server_challenge: string
  client_id: string
  app_name: string | null
  homepage_url: string | null
  developer_display_name: string | null
  app_status: string | null
}

/** 测试用 client（授权链路测试：接力页/App 授权栏显示"测试、不获取数据"说明） */
export const TEST_CLIENT_IDS = new Set(['mini-hbut-test'])

async function loadRequestDetail(
  sql: SqlExecutor,
  requestId: string,
): Promise<RequestDetailRow | null> {
  const result = await sql.query<RequestDetailRow>(
    `SELECT ar.id AS request_id, ar.expires_at, ar.status, ar.requested_scopes,
            ar.handoff_secret_hash, ar.server_challenge,
            app.client_id, app.name AS app_name, app.homepage_url, app.status AS app_status,
            dev.display_name AS developer_display_name
       FROM auth_requests ar
       JOIN oauth_applications app ON app.client_id = ar.client_id
       LEFT JOIN developers dev ON dev.id = app.owner_developer_id
      WHERE ar.id = $1`,
    [requestId],
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  // 双后端统一：pg-mem 返回数组对象，真 PG 返回 JSON 字符串（#619 parseJsonb）
  row.requested_scopes = parseJsonb<string[]>(row.requested_scopes)
  return row
}

/** 读取 handoff 头（缺失 → undefined） */
function readHandoff(ctx: RouterContext): string | undefined {
  const value = ctx.get(HANDOFF_HEADER)
  return value.length > 0 ? value : undefined
}

/** 统一错误响应：{ error: <code> }，不泄露内部细节（#630） */
function respondError(ctx: RouterContext, status: number, code: string): void {
  ctx.status = status
  ctx.body = { error: code }
}

/** 懒过期：过期则迁移 EXPIRED 并返回 true */
async function lazyExpire(sql: SqlExecutor, row: AuthRequestRow): Promise<boolean> {
  if (row.expires_at.getTime() > Date.now()) {
    return false
  }
  try {
    await expireAuthRequest(sql, row.id)
  } catch {
    // 终态下迁移失败可忽略
  }
  return true
}

/** 注册 requests 路由（#630 合同端点） */
export function registerRequestsRoutes(router: Router, deps: RequestsApiDeps): void {
  const { sql, provider } = deps

  // GET /api/v1/requests/:id —— 详情（sanitized DTO）
  router.get(`${API_PREFIX}/requests/:id`, async (ctx) => {
    const handoff = readHandoff(ctx)
    const row = await loadRequestDetail(sql, ctx.params.id as string)
    if (!row) {
      respondError(ctx, 404, 'not_found')
      return
    }
    if (!handoff || !verifyHandoffSecret({
      handoffHmacKey: deps.handoffHmacKey,
      handoffSecret: handoff,
      request: row as unknown as AuthRequestRow,
    })) {
      respondError(ctx, 401, 'invalid_handoff')
      return
    }
    if (await lazyExpire(sql, row as unknown as AuthRequestRow)) {
      respondError(ctx, 410, 'expired')
      return
    }
    // 首次展示：CREATED → WAITING_APP（页面可见性标记；失败不阻塞响应）
    if (row.status === 'CREATED') {
      await transitionAuthRequestStatus(sql, row.request_id, 'WAITING_APP').catch(() => undefined)
    }
    const homepageHost = row.homepage_url
      ? new URL(row.homepage_url).hostname
      : ''
    ctx.status = 200
    ctx.body = {
      request_id: row.request_id,
      expires_at: row.expires_at.toISOString(),
      challenge: row.server_challenge ?? '',
      client_id: row.client_id ?? '',
      client: {
        name: row.app_name ?? '',
        homepage_host: homepageHost,
        developer_display_name: row.developer_display_name ?? '',
        review_status: row.app_status ?? '',
        /** 测试应用标记：接力页/App 授权栏据此展示"测试、不获取数据"说明 */
        is_test: TEST_CLIENT_IDS.has(row.client_id),
      },
      scopes: (row.requested_scopes as string[]).map((scope) => {
        const meta = SCOPE_META[scope] ?? { label: scope, risk: 'basic' as const }
        return { id: scope, label: meta.label, risk: meta.risk }
      }),
    }
  })

  // GET /api/v1/requests/:id/status —— 最小状态（页面轮询用）
  router.get(`${API_PREFIX}/requests/:id/status`, async (ctx) => {
    const handoff = readHandoff(ctx)
    const row = await findAuthRequestById(sql, ctx.params.id as string)
    if (!row) {
      respondError(ctx, 404, 'not_found')
      return
    }
    if (!handoff || !verifyHandoffSecret({
      handoffHmacKey: deps.handoffHmacKey,
      handoffSecret: handoff,
      request: row,
    })) {
      respondError(ctx, 401, 'invalid_handoff')
      return
    }
    if (await lazyExpire(sql, row)) {
      respondError(ctx, 410, 'expired')
      return
    }
    ctx.status = 200
    ctx.body = {
      request_id: row.id,
      status: mapStatus(row.status),
      expires_at: row.expires_at.toISOString(),
    }
  })

  // POST /api/v1/requests/:id/resume —— 幂等 resume（核心业务见 oidc/interaction.ts）
  router.post(`${API_PREFIX}/requests/:id/resume`, async (ctx) => {
    const handoff = readHandoff(ctx)
    if (!handoff) {
      respondError(ctx, 401, 'invalid_handoff')
      return
    }
    try {
      const result = await resumeAuthRequest(
        { sql, provider, handoffHmacKey: deps.handoffHmacKey },
        { requestId: ctx.params.id as string, handoffSecret: handoff },
      )
      ctx.status = 200
      ctx.body = result
    } catch (err) {
      if (err instanceof ResumeError) {
        respondError(ctx, err.status, err.code)
        return
      }
      // 未预期错误：不泄露细节
      ctx.app.emit('error', err as Error, ctx)
      respondError(ctx, 500, 'internal')
    }
  })
}
